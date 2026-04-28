/**
 * validate-media-plan — Vérifications automatiques au moment de la soumission d'un plan.
 *
 * Body : { mediaPlanId: string }
 *
 * Vérifie pour chaque item :
 *   - Landing URL accessible (HTTP 200)
 *   - Drive link / post URL résolvable (HEAD ok)
 *   - Budget total <= remaining_amount du BDC
 *   - UTMs présents (warning si manquants)
 *   - Auto-génère utm_campaign si manquant
 *
 * Stocke les résultats dans `media_plan_validations`.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';

interface ValidateInput {
  mediaPlanId: string;
}

async function checkUrl(url: string | null): Promise<'passed' | 'warning' | 'failed'> {
  if (!url) return 'failed';
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return 'failed';
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (resp.ok) return 'passed';
    if (resp.status >= 300 && resp.status < 400) return 'warning';
    return 'failed';
  } catch {
    return 'warning';
  }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
}

serve(
  createHandler(
    'validate-media-plan',
    async (ctx) => {
      const body = (ctx.body ?? {}) as ValidateInput;

      if (!body.mediaPlanId) {
        return respondError(ctx.req, 400, 'mediaPlanId required');
      }

      const service = createServiceClient();

      const { data: plan, error: planErr } = await service
        .from('media_plans')
        .select('*, media_plan_items(*)')
        .eq('id', body.mediaPlanId)
        .single();
      if (planErr || !plan) {
        return respondError(ctx.req, 404, 'Media plan introuvable');
      }

      const items = (plan.media_plan_items ?? []) as Array<{
        id: string;
        campaign_name: string;
        platform: string;
        optimization_goal: string;
        budget_dzd: number;
        creative_type: string;
        drive_link: string | null;
        post_url: string | null;
        landing_url: string | null;
        utm_campaign: string | null;
      }>;

      // Charger le BDC pour vérifier le budget
      const { data: bdc } = await service
        .from('purchase_orders')
        .select('amount_ttc_dzd, remaining_amount_dzd')
        .eq('id', plan.bdc_id)
        .single();

      const totalAllocated = items.reduce((s, i) => s + Number(i.budget_dzd), 0);
      const budgetOk = bdc ? totalAllocated <= Number(bdc.remaining_amount_dzd) : true;

      // Nettoyer anciennes validations
      await service.from('media_plan_validations').delete().in(
        'media_plan_item_id',
        items.map((i) => i.id),
      );

      const validations: Array<{
        media_plan_item_id: string;
        check_type: string;
        status: 'passed' | 'warning' | 'failed';
        details: string | null;
      }> = [];

      for (const item of items) {
        // Vérif budget global
        validations.push({
          media_plan_item_id: item.id,
          check_type: 'budget_within_bdc',
          status: budgetOk ? 'passed' : 'failed',
          details: budgetOk ? null : `Total ${totalAllocated} > restant BDC ${bdc?.remaining_amount_dzd}`,
        });

        // Vérif landing
        if (item.landing_url) {
          const s = await checkUrl(item.landing_url);
          validations.push({
            media_plan_item_id: item.id,
            check_type: 'landing_url_reachable',
            status: s,
            details: s === 'passed' ? null : `URL ${item.landing_url}`,
          });
        }

        // Vérif drive link
        if (item.creative_type === 'drive_link' && item.drive_link) {
          const s = await checkUrl(item.drive_link);
          validations.push({
            media_plan_item_id: item.id,
            check_type: 'drive_link_accessible',
            status: s,
            details: s === 'passed' ? null : 'Drive non joignable depuis le serveur',
          });
        }

        // Vérif post URL
        if (item.creative_type === 'post_url' && item.post_url) {
          const s = await checkUrl(item.post_url);
          validations.push({
            media_plan_item_id: item.id,
            check_type: 'post_url_accessible',
            status: s,
            details: s === 'passed' ? null : 'Post non joignable',
          });
        }

        // UTM auto-fill si manquant
        if (!item.utm_campaign) {
          const auto = slugify(item.campaign_name);
          await service.from('media_plan_items').update({
            utm_source: item.platform,
            utm_medium: 'paid_social',
            utm_campaign: auto,
          }).eq('id', item.id);

          validations.push({
            media_plan_item_id: item.id,
            check_type: 'utm_format_valid',
            status: 'warning',
            details: `Auto-généré : utm_campaign=${auto}`,
          });
        } else {
          validations.push({
            media_plan_item_id: item.id,
            check_type: 'utm_format_valid',
            status: 'passed',
            details: null,
          });
        }
      }

      if (validations.length > 0) {
        await service.from('media_plan_validations').insert(validations);
      }

      const failures = validations.filter((v) => v.status === 'failed').length;
      const warnings = validations.filter((v) => v.status === 'warning').length;

      return respondJson(ctx.req, {
        success: true,
        totalChecks: validations.length,
        failures,
        warnings,
        canSubmit: failures === 0,
      });
    },
    {
      requireAuth: true,
      parseBody: true,
    },
  ),
);
