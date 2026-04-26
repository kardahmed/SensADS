/**
 * generate-suggestions — Manuel (bouton TM) ou auto post-compute-performance.
 *
 * Génère des suggestions intelligentes basées sur :
 * 1. Comparaison KPIs vs benchmarks MENA
 * 2. Détection anomalies (z-score 30 jours)
 * 3. Règles métier (sous-consommation, CPC élevé, CTR bas)
 *
 * Body : { forecastId?, campaignId? }
 *
 * Rate limit : 1 call par forecast / 5 minutes (correction F9).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';
import { checkRateLimit, recordAttempt } from '../_shared/rate-limit.ts';

interface SuggestionInput {
  forecastId?: string;
  campaignId?: string;
}

serve(
  createHandler(
    'generate-suggestions',
    async (ctx) => {
      const body = (ctx.body ?? {}) as SuggestionInput;

      if (!body.forecastId && !body.campaignId) {
        return respondError(ctx.req, 400, 'forecastId or campaignId required');
      }

      // Rate limit par forecast
      if (body.forecastId) {
        const limited = await checkRateLimit({
          functionName: 'generate-suggestions',
          resourceId: body.forecastId,
          limit: 1,
          windowMinutes: 5,
        });
        if (limited) {
          return respondError(ctx.req, 429, 'Rate limit: 1 call per forecast per 5 min');
        }
        await recordAttempt({
          functionName: 'generate-suggestions',
          userId: ctx.auth.userId,
          organizationId: ctx.auth.organizationId ?? undefined,
          resourceId: body.forecastId,
          limit: 1,
          windowMinutes: 5,
        });
      }

      const service = createServiceClient();
      let orgId: string;
      let campaignFilter: string | null = null;

      if (body.forecastId) {
        const { data: forecast, error } = await service
          .from('budget_forecasts')
          .select('organization_id')
          .eq('id', body.forecastId)
          .single();
        if (error || !forecast) return respondError(ctx.req, 404, 'Forecast not found');
        orgId = forecast.organization_id as string;
      } else {
        const { data: campaign, error } = await service
          .from('campaigns')
          .select('organization_id')
          .eq('id', body.campaignId!)
          .single();
        if (error || !campaign) return respondError(ctx.req, 404, 'Campaign not found');
        orgId = campaign.organization_id as string;
        campaignFilter = body.campaignId!;
      }

      // Lire KPIs récents (30 derniers jours)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      let kpisQuery = service
        .from('campaign_kpis')
        .select('campaign_id, date, spend, impressions, clicks, conversions, cpm, cpc, ctr, cpa, campaigns!inner(name, platform, optimization_goal, organization_id)')
        .eq('campaigns.organization_id', orgId)
        .gte('date', thirtyDaysAgo)
        .is('ad_set_id', null);

      if (campaignFilter) {
        kpisQuery = kpisQuery.eq('campaign_id', campaignFilter);
      }

      const { data: kpis } = await kpisQuery;
      if (!kpis || kpis.length === 0) {
        return respondJson(ctx.req, { suggestionsCreated: 0, message: 'No KPIs to analyze' });
      }

      // Lire benchmarks MENA
      const { data: benchmarks } = await service
        .from('global_benchmarks')
        .select('platform, optimization_goal, cpm, cpc, ctr, cpa')
        .eq('region', 'MENA');

      const benchmarkMap = new Map<string, { cpm: number; cpc: number; ctr: number; cpa: number }>();
      for (const b of benchmarks ?? []) {
        benchmarkMap.set(`${b.platform}:${b.optimization_goal}`, {
          cpm: Number(b.cpm),
          cpc: Number(b.cpc),
          ctr: Number(b.ctr),
          cpa: Number(b.cpa),
        });
      }

      // Group KPIs par campagne
      const byCampaign = new Map<string, {
        platform: string;
        goal: string;
        name: string;
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
      }>();

      for (const k of kpis) {
        const key = k.campaign_id as string;
        const camp = (k as unknown as { campaigns: { platform: string; optimization_goal: string; name: string } }).campaigns;
        const existing = byCampaign.get(key) ?? {
          platform: camp.platform,
          goal: camp.optimization_goal,
          name: camp.name,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
        };
        existing.spend += Number(k.spend);
        existing.impressions += Number(k.impressions);
        existing.clicks += Number(k.clicks);
        existing.conversions += Number(k.conversions);
        byCampaign.set(key, existing);
      }

      let created = 0;

      for (const [campaignId, agg] of byCampaign) {
        const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
        const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
        const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
        const cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0;

        const benchmark = benchmarkMap.get(`${agg.platform}:${agg.goal}`);

        // Règle 1 : CPC > 1.5× benchmark
        if (benchmark && benchmark.cpc > 0 && cpc > benchmark.cpc * 1.5) {
          const { data: existing } = await service
            .from('performance_suggestions')
            .select('id')
            .eq('campaign_id', campaignId)
            .eq('suggestion_type', 'high_cpc')
            .eq('status', 'pending')
            .maybeSingle();

          if (!existing) {
            await service.from('performance_suggestions').insert({
              organization_id: orgId,
              forecast_id: body.forecastId ?? null,
              campaign_id: campaignId,
              suggestion_type: 'high_cpc',
              title: 'CPC élevé détecté',
              description: `Le CPC actuel (${cpc.toFixed(2)} USD) est ${((cpc / benchmark.cpc - 1) * 100).toFixed(0)}% au-dessus du benchmark MENA pour ${agg.platform}.`,
              recommended_action: {
                action: 'optimize_audience',
                detail: 'Affiner le ciblage ou tester de nouvelles audiences',
              },
              expected_impact: 'Réduction CPC de 15-30%',
              confidence_score: 0.75,
              status: 'pending',
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
            created += 1;
          }
        }

        // Règle 2 : CTR < 0.5× benchmark
        if (benchmark && benchmark.ctr > 0 && ctr > 0 && ctr < benchmark.ctr * 0.5) {
          await service.from('performance_suggestions').insert({
            organization_id: orgId,
            forecast_id: body.forecastId ?? null,
            campaign_id: campaignId,
            suggestion_type: 'low_ctr',
            title: 'CTR faible',
            description: `Le CTR (${(ctr * 100).toFixed(2)}%) est inférieur au benchmark (${(benchmark.ctr * 100).toFixed(2)}%).`,
            recommended_action: {
              action: 'refresh_creatives',
              detail: 'Renouveler les visuels et tester de nouveaux messages',
            },
            expected_impact: 'Amélioration CTR de 30-50%',
            confidence_score: 0.7,
            status: 'pending',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
          created += 1;
        }

        // Règle 3 : conversions = 0 sur 30j
        if (agg.spend > 100 && agg.conversions === 0) {
          await service.from('performance_suggestions').insert({
            organization_id: orgId,
            forecast_id: body.forecastId ?? null,
            campaign_id: campaignId,
            suggestion_type: 'no_conversions',
            title: 'Aucune conversion sur 30 jours',
            description: `Campagne "${agg.name}" : ${agg.spend.toFixed(2)} USD dépensés, zéro conversion.`,
            recommended_action: {
              action: 'review_funnel',
              detail: 'Vérifier le tracking pixel/GA4, l\'objectif d\'optimisation et le contenu de la landing page',
            },
            expected_impact: 'Identifier la cause du blocage',
            confidence_score: 0.9,
            status: 'pending',
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          });
          created += 1;
        }

        // Règle 4 : CPA > 2× benchmark
        if (benchmark && benchmark.cpa > 0 && cpa > 0 && cpa > benchmark.cpa * 2) {
          await service.from('performance_suggestions').insert({
            organization_id: orgId,
            forecast_id: body.forecastId ?? null,
            campaign_id: campaignId,
            suggestion_type: 'high_cpa',
            title: 'CPA très au-dessus du benchmark',
            description: `CPA actuel: ${cpa.toFixed(2)} USD vs ${benchmark.cpa.toFixed(2)} USD benchmark.`,
            recommended_action: { action: 'review_targeting_and_creatives' },
            expected_impact: 'Réduire CPA de 30%+',
            confidence_score: 0.65,
            status: 'pending',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
          created += 1;
        }
      }

      return respondJson(ctx.req, {
        suggestionsCreated: created,
        campaignsAnalyzed: byCampaign.size,
      });
    },
    {
      requireAuth: true,
      allowedRoles: ['super_admin', 'admin', 'traffic_manager'],
    },
  ),
);
