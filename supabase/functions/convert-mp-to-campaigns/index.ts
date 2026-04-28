/**
 * convert-mp-to-campaigns — Convertit un media plan approuvé en campagnes draft.
 *
 * Body : { mediaPlanId: string }
 *
 * Comportement :
 *   1. Charge le plan + ses items + son BDC
 *   2. Vérifie que le plan est en statut 'approved'
 *   3. Pour chaque item : crée une campagne 'draft' héritant des snapshots du BDC
 *   4. Met à jour mp_items.converted_campaign_id
 *   5. Marque le plan comme 'converted'
 *
 * Rate limit : 1 conversion par plan / 5 minutes (anti-double-clic).
 * Sécurité : seul un staff (admin/super_admin/TM) peut déclencher la conversion.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';
import { checkRateLimit, recordAttempt } from '../_shared/rate-limit.ts';

interface ConvertInput {
  mediaPlanId: string;
}

serve(
  createHandler(
    'convert-mp-to-campaigns',
    async (ctx) => {
      const body = (ctx.body ?? {}) as ConvertInput;

      if (!body.mediaPlanId) {
        return respondError(ctx.req, 400, 'mediaPlanId required');
      }

      // Rate limit anti-double-clic
      const limited = await checkRateLimit({
        functionName: 'convert-mp-to-campaigns',
        resourceId: body.mediaPlanId,
        limit: 1,
        windowMinutes: 5,
      });
      if (limited) {
        return respondError(ctx.req, 429, 'Conversion déjà tentée récemment, attendre 5 min');
      }

      const service = createServiceClient();

      // 1. Charger le plan
      const { data: plan, error: planErr } = await service
        .from('media_plans')
        .select('*, media_plan_items(*)')
        .eq('id', body.mediaPlanId)
        .single();
      if (planErr || !plan) {
        return respondError(ctx.req, 404, 'Media plan introuvable');
      }

      if (plan.status !== 'approved') {
        return respondError(ctx.req, 400, `Plan en statut ${plan.status} — doit être 'approved'`);
      }

      // 2. Charger le BDC pour récupérer la config
      const { data: bdc, error: bdcErr } = await service
        .from('purchase_orders')
        .select('*')
        .eq('id', plan.bdc_id)
        .single();
      if (bdcErr || !bdc) {
        return respondError(ctx.req, 404, 'BDC parent introuvable');
      }

      const items = (plan.media_plan_items ?? []) as Array<{
        id: string;
        position: number;
        campaign_name: string;
        platform: string;
        optimization_goal: string;
        budget_dzd: number;
        start_date: string;
        end_date: string;
        landing_url: string | null;
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        utm_term: string | null;
        utm_content: string | null;
      }>;

      if (items.length === 0) {
        return respondError(ctx.req, 400, 'Le plan ne contient aucun item');
      }

      // 3. Créer les campagnes
      const created: Array<{ id: string; number: string }> = [];
      const errors: string[] = [];

      for (const item of items.sort((a, b) => a.position - b.position)) {
        // Calculer allocated_usd = (budget_dzd × (1-fees)) / parallel / divisor
        const fees = Number(bdc.fees_pct_locked ?? 0.06);
        const parallel = Number(bdc.parallel_rate_locked ?? 260);
        const divisor = Number(bdc.divisor_current ?? 2.6);
        const allocatedUsd = (Number(item.budget_dzd) * (1 - fees)) / parallel / divisor;
        const overshootBufferPct = 0.08;
        const platformCapUsd = allocatedUsd * (1 - overshootBufferPct);

        const { data: camp, error: campErr } = await service
          .from('campaigns')
          .insert({
            organization_id: plan.organization_id,
            po_id: plan.bdc_id,
            name: item.campaign_name,
            platform: item.platform,
            optimization_goal: item.optimization_goal,
            budget_dzd: item.budget_dzd,
            budget_mode: 'cbo',
            start_date: item.start_date,
            end_date: item.end_date,
            ad_account_id: '00000000-0000-0000-0000-000000000000', // placeholder, TM choisira
            special_ad_category: 'none',
            status: 'draft',
            allocated_usd: allocatedUsd,
            platform_cap_usd: platformCapUsd,
            overshoot_buffer_pct: overshootBufferPct,
            media_plan_item_id: item.id,
            created_by: ctx.auth.userId,
          })
          .select('id, number')
          .single();

        if (campErr || !camp) {
          errors.push(`Item ${item.campaign_name}: ${campErr?.message ?? 'unknown'}`);
          continue;
        }

        // 4. Mettre à jour l'item avec converted_campaign_id
        await service
          .from('media_plan_items')
          .update({ converted_campaign_id: camp.id })
          .eq('id', item.id);

        created.push({ id: camp.id, number: camp.number });
      }

      // 5. Marquer le plan comme converted
      if (created.length > 0) {
        await service
          .from('media_plans')
          .update({
            status: 'converted',
            converted_at: new Date().toISOString(),
          })
          .eq('id', plan.id);
      }

      await recordAttempt({
        functionName: 'convert-mp-to-campaigns',
        userId: ctx.auth.userId,
        organizationId: plan.organization_id,
        resourceId: body.mediaPlanId,
        limit: 1,
        windowMinutes: 5,
      });

      return respondJson(ctx.req, {
        success: true,
        created: created.length,
        campaigns: created,
        errors,
      });
    },
    {
      requireAuth: true,
      allowedRoles: ['super_admin', 'admin', 'traffic_manager'],
      parseBody: true,
    },
  ),
);
