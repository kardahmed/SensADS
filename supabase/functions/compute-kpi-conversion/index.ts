/**
 * compute-kpi-conversion — Calcule et insère un KPI quotidien côté serveur.
 *
 * RÈGLE CLAUDE.md 13 + 3 (anti-IDOR) :
 *   La conversion DZD ne doit JAMAIS être faite côté client. L'Edge Function :
 *     1. Extrait le user_id depuis le JWT (pas du body)
 *     2. Vérifie que le user a bien le droit d'écrire des KPIs sur cette campagne
 *        (via campaign.organization_id et la RLS)
 *     3. Charge le BDC pour récupérer les snapshots config (parallel/fees/divisor)
 *     4. Charge le bank_rate du jour pour la devise du compte pub
 *     5. Calcule displayed_dzd_snapshot = spend_account_currency × bank × markup × parallel
 *     6. Insère ou update le KPI avec TOUS les snapshots figés
 *
 * Body : {
 *   campaignId: uuid,
 *   adAccountId: uuid,
 *   date: 'YYYY-MM-DD',
 *   spendAccountCurrency: number,
 *   impressions, clicks, conversions, reach?, ...
 * }
 *
 * Réservé aux staff (TM/admin/super_admin).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';

interface KpiInput {
  campaignId: string;
  adAccountId: string;
  date: string;
  spendAccountCurrency: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach?: number;
  videoViews?: number;
  conversionValueAccountCurrency?: number;
  source?: 'manual' | 'api' | 'ga4';
  externalId?: string;
}

serve(
  createHandler(
    'compute-kpi-conversion',
    async (ctx) => {
      const body = (ctx.body ?? {}) as KpiInput;

      // Validation basique
      if (!body.campaignId || !body.adAccountId || !body.date) {
        return respondError(ctx.req, 400, 'campaignId, adAccountId, date required');
      }
      if (typeof body.spendAccountCurrency !== 'number' || body.spendAccountCurrency < 0) {
        return respondError(ctx.req, 400, 'spendAccountCurrency must be a non-negative number');
      }
      if (typeof body.impressions !== 'number' || body.impressions < 0) {
        return respondError(ctx.req, 400, 'impressions must be a non-negative number');
      }

      const service = createServiceClient();

      // 1. Charger la campagne pour vérifier l'existence + récupérer po_id + organization_id
      const { data: campaign, error: campErr } = await service
        .from('campaigns')
        .select('id, organization_id, po_id, platform, status')
        .eq('id', body.campaignId)
        .single();
      if (campErr || !campaign) {
        return respondError(ctx.req, 404, 'Campaign not found');
      }

      // Anti-IDOR : vérifier que l'user a accès à cette campagne via son rôle
      const isStaff = ['super_admin', 'admin', 'traffic_manager'].includes(ctx.auth.role ?? '');
      if (!isStaff) {
        // Si client, vérifier que la campaign appartient à son org
        if (campaign.organization_id !== ctx.auth.organizationId) {
          return respondError(ctx.req, 403, 'Forbidden: campaign belongs to another organization');
        }
      }

      // 2. Charger l'ad account pour avoir la devise + bank rate
      const { data: adAccount, error: adAccErr } = await service
        .from('agency_ad_accounts')
        .select('id, account_currency, status, deleted_at')
        .eq('id', body.adAccountId)
        .single();
      if (adAccErr || !adAccount) {
        return respondError(ctx.req, 404, 'Ad account not found');
      }
      if (adAccount.deleted_at || adAccount.status !== 'active') {
        return respondError(ctx.req, 400, `Ad account is ${adAccount.status} or deleted`);
      }

      // 3. Charger le BDC pour récupérer les snapshots config
      const { data: bdc, error: bdcErr } = await service
        .from('purchase_orders')
        .select('id, parallel_rate_locked, fees_pct_locked, divisor_current')
        .eq('id', campaign.po_id)
        .single();
      if (bdcErr || !bdc) {
        return respondError(ctx.req, 404, 'BDC not found for campaign');
      }

      const parallelRate = Number(bdc.parallel_rate_locked ?? 260);
      const feesPct = Number(bdc.fees_pct_locked ?? 0.06);
      const divisor = Number(bdc.divisor_current ?? 2.6);

      if (parallelRate <= 0 || feesPct >= 1 || divisor < 1) {
        return respondError(ctx.req, 400, 'Invalid BDC config (parallel/fees/divisor)');
      }

      const totalMarkup = divisor / (1 - feesPct);

      // 4. Charger le bank rate du jour pour la devise du compte pub
      let bankRate = 1;
      if (adAccount.account_currency !== 'USD') {
        const { data: rateRow } = await service
          .from('bank_exchange_rates')
          .select('rate_to_usd')
          .eq('currency', adAccount.account_currency)
          .lte('effective_date', body.date)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!rateRow) {
          return respondError(
            ctx.req,
            400,
            `No bank rate available for ${adAccount.account_currency} on/before ${body.date}`,
          );
        }
        bankRate = Number(rateRow.rate_to_usd);
      }

      // 5. Calcul SERVEUR (jamais côté client)
      const realUsd = body.spendAccountCurrency * bankRate;
      const displayedUsd = realUsd * totalMarkup;
      const displayedDzd = Math.round(displayedUsd * parallelRate * 100) / 100;
      const conversionValueDzd = body.conversionValueAccountCurrency
        ? Math.round(body.conversionValueAccountCurrency * bankRate * totalMarkup * parallelRate * 100) / 100
        : 0;

      // CPM/CPC/CTR/CPA dérivés
      const cpm = body.impressions > 0 ? (displayedUsd / body.impressions) * 1000 : 0;
      const cpc = body.clicks > 0 ? displayedUsd / body.clicks : 0;
      const ctr = body.impressions > 0 ? body.clicks / body.impressions : 0;
      const cpa = body.conversions > 0 ? displayedUsd / body.conversions : 0;
      const roas = displayedUsd > 0 && conversionValueDzd > 0
        ? conversionValueDzd / (displayedDzd || 1)
        : 0;

      // 6. Upsert avec snapshots figés
      const { data: kpi, error: kpiErr } = await service
        .from('campaign_kpis')
        .upsert(
          {
            campaign_id: body.campaignId,
            ad_set_id: null,
            date: body.date,
            // Compteurs réels (Meta API)
            spend: realUsd,
            impressions: body.impressions,
            clicks: body.clicks,
            conversions: body.conversions,
            reach: body.reach ?? 0,
            video_views: body.videoViews ?? 0,
            conversion_value: body.conversionValueAccountCurrency ?? 0,
            // Métriques dérivées
            cpm,
            cpc,
            ctr,
            cpa,
            roas,
            // DZD legacy (= displayed pour compatibilité)
            spend_dzd: displayedDzd,
            conversion_value_dzd: conversionValueDzd,
            // Snapshots multi-currency (Sprint 1)
            po_id: bdc.id,
            ad_account_id: body.adAccountId,
            account_currency: adAccount.account_currency,
            spend_account_currency: body.spendAccountCurrency,
            bank_rate_to_usd_snapshot: bankRate,
            parallel_rate_dzd_snapshot: parallelRate,
            total_markup_snapshot: totalMarkup,
            displayed_dzd_snapshot: displayedDzd,
            // Audit
            exchange_rate_snapshot: parallelRate,
            source: body.source ?? 'manual',
            external_id: body.externalId ?? null,
            created_by: ctx.auth.userId,
          },
          { onConflict: 'campaign_id,ad_set_id,date,source' },
        )
        .select('id, displayed_dzd_snapshot, total_markup_snapshot')
        .single();

      if (kpiErr) {
        return respondError(ctx.req, 500, `Failed to save KPI: ${kpiErr.message}`);
      }

      return respondJson(ctx.req, {
        success: true,
        kpiId: kpi.id,
        displayedDzd: kpi.displayed_dzd_snapshot,
        markup: kpi.total_markup_snapshot,
        breakdown: {
          realSpendAccountCurrency: body.spendAccountCurrency,
          accountCurrency: adAccount.account_currency,
          bankRateUsed: bankRate,
          realSpendUsd: realUsd,
          displayedSpendUsd: displayedUsd,
          displayedSpendDzd: displayedDzd,
          parallelRate,
          totalMarkup,
        },
      });
    },
    {
      requireAuth: true,
      allowedRoles: ['super_admin', 'admin', 'traffic_manager'],
      parseBody: true,
    },
  ),
);
