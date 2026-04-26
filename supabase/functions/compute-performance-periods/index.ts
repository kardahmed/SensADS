/**
 * compute-performance-periods — pg_cron dimanche 03h UTC.
 *
 * Pour chaque org, calcule les agrégats KPIs sur la semaine écoulée
 * et insert dans `campaign_performance_periods`.
 *
 * Découpage par org dans `compute_jobs` pour reprise en cas d'erreur (correction SC4).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { handleCorsOptions } from '../_shared/cors.ts';
import { FunctionLogger, generateRequestId } from '../_shared/logger.ts';
import { respondError, respondJson } from '../_shared/response.ts';

serve(async (req) => {
  const cors = handleCorsOptions(req);
  if (cors) return cors;

  const authHeader = req.headers.get('authorization');
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!authHeader?.includes(expectedKey)) {
    return respondError(req, 401, 'Service role required');
  }

  const logger = new FunctionLogger({
    functionName: 'compute-performance-periods',
    requestId: generateRequestId(),
  });
  await logger.start();

  const service = createServiceClient();
  const url = new URL(req.url);
  const targetOrgId = url.searchParams.get('org_id'); // optionnel : pour ré-exécution ciblée

  // Période : semaine précédente
  const today = new Date();
  const periodEnd = new Date(today.setDate(today.getDate() - today.getDay())); // dimanche
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodEnd.getDate() - 6);
  const periodStartStr = periodStart.toISOString().split('T')[0]!;
  const periodEndStr = periodEnd.toISOString().split('T')[0]!;

  // Sélectionner les orgs
  let orgsQuery = service.from('organizations').select('id').is('deleted_at', null);
  if (targetOrgId) orgsQuery = orgsQuery.eq('id', targetOrgId);
  const { data: orgs, error: orgsError } = await orgsQuery;

  if (orgsError) {
    await logger.failure(500, orgsError.message);
    return respondError(req, 500, orgsError.message);
  }

  let processed = 0;
  let errored = 0;

  for (const org of orgs ?? []) {
    // Insert/update job
    const { data: job } = await service
      .from('compute_jobs')
      .insert({
        organization_id: org.id,
        job_type: 'compute-performance',
        period_start: periodStartStr,
        period_end: periodEndStr,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    try {
      // Agréger KPIs par campagne pour la semaine
      const { data: aggregates, error: aggError } = await service.rpc('aggregate_kpis_by_period', {
        p_organization_id: org.id,
        p_start: periodStartStr,
        p_end: periodEndStr,
      });

      if (aggError) {
        // Fallback : RPC non créée, on fait l'agrégation directement
        const { data: kpis } = await service
          .from('campaign_kpis')
          .select('campaign_id, spend_dzd, impressions, clicks, conversions, campaigns!inner(organization_id, platform)')
          .eq('campaigns.organization_id', org.id)
          .gte('date', periodStartStr)
          .lte('date', periodEndStr)
          .is('ad_set_id', null);

        // Group by campaign + platform
        const grouped = new Map<string, {
          campaignId: string;
          platform: string;
          spend: number;
          impressions: number;
          clicks: number;
          conversions: number;
        }>();

        for (const k of kpis ?? []) {
          const key = k.campaign_id as string;
          const camp = (k as unknown as { campaigns: { platform: string } }).campaigns;
          const existing = grouped.get(key) ?? {
            campaignId: key,
            platform: camp.platform,
            spend: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
          };
          existing.spend += Number(k.spend_dzd);
          existing.impressions += Number(k.impressions);
          existing.clicks += Number(k.clicks);
          existing.conversions += Number(k.conversions);
          grouped.set(key, existing);
        }

        // Insert performance periods
        for (const agg of grouped.values()) {
          const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
          const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
          const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
          const cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0;

          // Score simple : moyenne pondérée sur ratios
          let score = 50;
          if (ctr > 0.02) score += 15;
          if (cpa > 0 && cpa < 30) score += 15;
          if (agg.conversions > 10) score += 20;
          score = Math.max(0, Math.min(100, score));

          const level = score >= 80 ? 'excellent' : score >= 60 ? 'high' : score >= 40 ? 'normal' : 'low';

          await service.from('campaign_performance_periods').upsert({
            organization_id: org.id,
            campaign_id: agg.campaignId,
            platform: agg.platform,
            period_type: 'weekly',
            period_start: periodStartStr,
            period_end: periodEndStr,
            total_spend_dzd: agg.spend,
            total_impressions: agg.impressions,
            total_clicks: agg.clicks,
            total_conversions: agg.conversions,
            avg_cpm: cpm,
            avg_cpc: cpc,
            avg_ctr: ctr,
            avg_cpa: cpa,
            performance_score: score,
            performance_level: level,
            computed_at: new Date().toISOString(),
          }, { onConflict: 'campaign_id,period_type,period_start' });
        }
      } else {
        // RPC future a fait son boulot
        await logger.info('Aggregation done via RPC', { count: aggregates ? Object.keys(aggregates).length : 0 });
      }

      // Mark job done
      if (job) {
        await service
          .from('compute_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
      processed += 1;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await logger.error(`Org ${org.id} failed`, error);
      if (job) {
        await service
          .from('compute_jobs')
          .update({
            status: 'failed',
            last_error: error.message,
            attempts: 1,
          })
          .eq('id', job.id);
      }
      errored += 1;
    }
  }

  await logger.success(200, { processed, errored, periodStart: periodStartStr, periodEnd: periodEndStr });
  return respondJson(req, { processed, errored, periodStart: periodStartStr, periodEnd: periodEndStr });
});
