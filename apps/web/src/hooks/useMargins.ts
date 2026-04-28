/**
 * useMargins — Calculs agrégés de marge pour les dashboards agence.
 *
 * Sources :
 *   - purchase_orders (avec parallel_rate_locked + fees_pct_locked + divisor_current)
 *   - campaign_kpis (snapshots figés : displayed_dzd_snapshot, real spend, etc.)
 *
 * Toute la logique métier est dans packages/core/src/pricing.ts (testée).
 * Ces hooks ne font que requêter + agréger.
 */

import { useQuery } from '@tanstack/react-query';
import { CACHE_TIMES, totalMarkup, type BdcFinancialConfig } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export interface AgencyMarginStats {
  totalDepositsDzd: number;
  totalRealSpendDzd: number;
  totalMarginDzd: number;
  marginPct: number;
  bdcCount: number;
  activeBdcCount: number;
}

export interface ClientMarginRow {
  organizationId: string;
  organizationName: string;
  totalDepositsDzd: number;
  totalRealSpendDzd: number;
  totalMarginDzd: number;
  marginPct: number;
  bdcCount: number;
  lastDepositDate: string | null;
}

export interface PlatformMarginRow {
  platform: string;
  totalDisplayedDzd: number;
  totalRealSpendDzd: number;
  totalMarginDzd: number;
  marginPct: number;
  campaignCount: number;
}

export interface MonthlyMarginRow {
  monthKey: string; // YYYY-MM
  totalDepositsDzd: number;
  totalMarginDzd: number;
  marginPct: number;
}

interface RawBdcRow {
  id: string;
  organization_id: string;
  amount_ttc_dzd: number;
  parallel_rate_locked: number | null;
  fees_pct_locked: number | null;
  divisor_current: number | null;
  status: string;
  created_at: string;
}

/**
 * Calcule la marge cash d'un BDC à partir de sa config.
 */
function bdcMarginDzd(bdc: RawBdcRow): { marginDzd: number; realSpendDzd: number } {
  if (!bdc.parallel_rate_locked || !bdc.fees_pct_locked || !bdc.divisor_current) {
    return { marginDzd: 0, realSpendDzd: 0 };
  }
  const cfg: BdcFinancialConfig = {
    parallelRate: Number(bdc.parallel_rate_locked),
    feesPct: Number(bdc.fees_pct_locked),
    divisor: Number(bdc.divisor_current),
  };
  // markup = divisor / (1 - fees)
  // real_spend = deposit / markup / parallel × parallel = deposit × (1 - fees) / divisor
  // marge = deposit - real_spend × parallel
  try {
    const markup = totalMarkup(cfg);
    const realUsd = (Number(bdc.amount_ttc_dzd) * (1 - cfg.feesPct)) / cfg.parallelRate / cfg.divisor;
    const realSpendDzd = realUsd * cfg.parallelRate;
    return {
      marginDzd: Number(bdc.amount_ttc_dzd) - realSpendDzd,
      realSpendDzd,
    };
  } catch {
    return { marginDzd: 0, realSpendDzd: 0 };
  }
}

/**
 * Stats globales agence (total marge, total deposits, etc.).
 */
export function useAgencyMarginStats(periodFrom?: string) {
  return useQuery({
    queryKey: ['agency-margin-stats', periodFrom ?? 'all'],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<AgencyMarginStats> => {
      let q = supabase
        .from('purchase_orders')
        .select('id, organization_id, amount_ttc_dzd, parallel_rate_locked, fees_pct_locked, divisor_current, status, created_at')
        .in('status', ['active', 'consumed', 'paid']);

      if (periodFrom) q = q.gte('created_at', periodFrom);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as RawBdcRow[];
      let totalDepositsDzd = 0;
      let totalRealSpendDzd = 0;
      let totalMarginDzd = 0;
      let activeBdcCount = 0;

      for (const bdc of rows) {
        const { marginDzd, realSpendDzd } = bdcMarginDzd(bdc);
        totalDepositsDzd += Number(bdc.amount_ttc_dzd);
        totalRealSpendDzd += realSpendDzd;
        totalMarginDzd += marginDzd;
        if (bdc.status === 'active') activeBdcCount += 1;
      }

      return {
        totalDepositsDzd,
        totalRealSpendDzd,
        totalMarginDzd,
        marginPct: totalDepositsDzd > 0 ? totalMarginDzd / totalDepositsDzd : 0,
        bdcCount: rows.length,
        activeBdcCount,
      };
    },
  });
}

/**
 * Top clients par marge cumulée.
 */
export function useClientMarginRanking(limit = 10) {
  return useQuery({
    queryKey: ['client-margin-ranking', limit],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<ClientMarginRow[]> => {
      const { data: bdcs, error } = await supabase
        .from('purchase_orders')
        .select('id, organization_id, amount_ttc_dzd, parallel_rate_locked, fees_pct_locked, divisor_current, status, created_at')
        .in('status', ['active', 'consumed', 'paid']);
      if (error) throw error;

      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name')
        .is('deleted_at', null);
      if (orgErr) throw orgErr;

      const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name as string]));
      const aggregated = new Map<string, ClientMarginRow>();

      for (const bdc of (bdcs ?? []) as RawBdcRow[]) {
        const orgId = bdc.organization_id;
        const { marginDzd, realSpendDzd } = bdcMarginDzd(bdc);
        const existing = aggregated.get(orgId);
        if (existing) {
          existing.totalDepositsDzd += Number(bdc.amount_ttc_dzd);
          existing.totalRealSpendDzd += realSpendDzd;
          existing.totalMarginDzd += marginDzd;
          existing.bdcCount += 1;
          if (!existing.lastDepositDate || bdc.created_at > existing.lastDepositDate) {
            existing.lastDepositDate = bdc.created_at;
          }
        } else {
          aggregated.set(orgId, {
            organizationId: orgId,
            organizationName: orgMap.get(orgId) ?? '—',
            totalDepositsDzd: Number(bdc.amount_ttc_dzd),
            totalRealSpendDzd: realSpendDzd,
            totalMarginDzd: marginDzd,
            marginPct: 0,
            bdcCount: 1,
            lastDepositDate: bdc.created_at,
          });
        }
      }

      const rows = Array.from(aggregated.values());
      rows.forEach((r) => {
        r.marginPct = r.totalDepositsDzd > 0 ? r.totalMarginDzd / r.totalDepositsDzd : 0;
      });
      rows.sort((a, b) => b.totalMarginDzd - a.totalMarginDzd);
      return rows.slice(0, limit);
    },
  });
}

/**
 * Évolution mensuelle de la marge (12 derniers mois).
 */
export function useMonthlyMargins(months = 12) {
  return useQuery({
    queryKey: ['monthly-margins', months],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<MonthlyMarginRow[]> => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);

      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, organization_id, amount_ttc_dzd, parallel_rate_locked, fees_pct_locked, divisor_current, status, created_at')
        .gte('created_at', cutoff.toISOString());
      if (error) throw error;

      const aggregated = new Map<string, MonthlyMarginRow>();
      for (const bdc of (data ?? []) as RawBdcRow[]) {
        const monthKey = bdc.created_at.slice(0, 7);
        const { marginDzd } = bdcMarginDzd(bdc);
        const existing = aggregated.get(monthKey);
        if (existing) {
          existing.totalDepositsDzd += Number(bdc.amount_ttc_dzd);
          existing.totalMarginDzd += marginDzd;
        } else {
          aggregated.set(monthKey, {
            monthKey,
            totalDepositsDzd: Number(bdc.amount_ttc_dzd),
            totalMarginDzd: marginDzd,
            marginPct: 0,
          });
        }
      }

      const rows = Array.from(aggregated.values());
      rows.forEach((r) => {
        r.marginPct = r.totalDepositsDzd > 0 ? r.totalMarginDzd / r.totalDepositsDzd : 0;
      });
      rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      return rows;
    },
  });
}

/**
 * Marge agrégée par plateforme (depuis les KPIs).
 */
export function usePlatformMargins() {
  return useQuery({
    queryKey: ['platform-margins'],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<PlatformMarginRow[]> => {
      // KPIs joints aux campagnes pour la plateforme
      const { data, error } = await supabase
        .from('campaign_kpis')
        .select(
          'displayed_dzd_snapshot, spend_dzd, parallel_rate_dzd_snapshot, total_markup_snapshot, campaigns(platform)',
        )
        .limit(10000);
      if (error) throw error;

      const aggregated = new Map<string, PlatformMarginRow>();
      for (const r of (data ?? []) as Array<{
        displayed_dzd_snapshot: number | null;
        spend_dzd: number | null;
        parallel_rate_dzd_snapshot: number | null;
        total_markup_snapshot: number | null;
        campaigns: { platform: string } | { platform: string }[] | null;
      }>) {
        const platform = Array.isArray(r.campaigns) ? r.campaigns[0]?.platform : r.campaigns?.platform;
        if (!platform) continue;
        const displayed = Number(r.displayed_dzd_snapshot ?? r.spend_dzd ?? 0);
        const markup = Number(r.total_markup_snapshot ?? 1);
        const realDzd = markup > 0 ? displayed / markup : 0;
        const margin = displayed - realDzd;

        const existing = aggregated.get(platform);
        if (existing) {
          existing.totalDisplayedDzd += displayed;
          existing.totalRealSpendDzd += realDzd;
          existing.totalMarginDzd += margin;
          existing.campaignCount += 1;
        } else {
          aggregated.set(platform, {
            platform,
            totalDisplayedDzd: displayed,
            totalRealSpendDzd: realDzd,
            totalMarginDzd: margin,
            marginPct: 0,
            campaignCount: 1,
          });
        }
      }

      const rows = Array.from(aggregated.values());
      rows.forEach((r) => {
        r.marginPct = r.totalDisplayedDzd > 0 ? r.totalMarginDzd / r.totalDisplayedDzd : 0;
      });
      rows.sort((a, b) => b.totalMarginDzd - a.totalMarginDzd);
      return rows;
    },
  });
}

/**
 * Cash flow prévisionnel : marge restante à collecter sur BDC actifs.
 */
export interface CashFlowForecast {
  totalRemainingMarginDzd: number;
  byMonth: Array<{ monthKey: string; estimatedMarginDzd: number; bdcCount: number }>;
}

export function useCashFlowForecast() {
  return useQuery({
    queryKey: ['cash-flow-forecast'],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<CashFlowForecast> => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, organization_id, amount_ttc_dzd, consumed_amount_dzd, remaining_amount_dzd, parallel_rate_locked, fees_pct_locked, divisor_current, status, created_at')
        .eq('status', 'active');
      if (error) throw error;

      const monthMap = new Map<string, { totalDzd: number; count: number }>();
      let totalRemainingMarginDzd = 0;

      for (const bdc of (data ?? []) as Array<RawBdcRow & { remaining_amount_dzd: number }>) {
        const remaining = Number(bdc.remaining_amount_dzd);
        if (remaining <= 0 || !bdc.parallel_rate_locked || !bdc.fees_pct_locked || !bdc.divisor_current) continue;

        const cfg: BdcFinancialConfig = {
          parallelRate: Number(bdc.parallel_rate_locked),
          feesPct: Number(bdc.fees_pct_locked),
          divisor: Number(bdc.divisor_current),
        };
        try {
          const realUsd = (remaining * (1 - cfg.feesPct)) / cfg.parallelRate / cfg.divisor;
          const realDzd = realUsd * cfg.parallelRate;
          const futureMargin = remaining - realDzd;
          totalRemainingMarginDzd += futureMargin;

          // Estimation : la marge tombe le mois prochain
          const next = new Date();
          next.setMonth(next.getMonth() + 1);
          const monthKey = next.toISOString().slice(0, 7);
          const existing = monthMap.get(monthKey);
          if (existing) {
            existing.totalDzd += futureMargin;
            existing.count += 1;
          } else {
            monthMap.set(monthKey, { totalDzd: futureMargin, count: 1 });
          }
        } catch {
          /* ignore */
        }
      }

      const byMonth = Array.from(monthMap.entries())
        .map(([monthKey, v]) => ({
          monthKey,
          estimatedMarginDzd: v.totalDzd,
          bdcCount: v.count,
        }))
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

      return { totalRemainingMarginDzd, byMonth };
    },
  });
}
