/**
 * /admin/clients/:id/margin-history — Historique détaillé des marges d'un client.
 *
 * Affiche tous les BDC du client avec :
 *   - Marge cash de chaque BDC (calculée depuis sa config figée)
 *   - Évolution du divisor (history JSONB)
 *   - Total cumulé
 *   - Graphique d'évolution mensuelle
 */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, TrendingUp, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  cashMarginDzd,
  formatAmount,
  formatDate,
  formatDateTime,
  formatPercentage,
  totalMarkup,
  type BdcFinancialConfig,
} from '@sensads/core';
import { useOrganization } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { supabase } from '@/lib/supabase';

interface BdcWithConfig {
  id: string;
  number: string;
  amount_ttc_dzd: number;
  consumed_amount_dzd: number;
  remaining_amount_dzd: number;
  status: string;
  parallel_rate_locked: number | null;
  fees_pct_locked: number | null;
  divisor_current: number | null;
  divisor_history: Array<{
    changed_at: string;
    from: number | null;
    to: number;
    note: string;
    changed_by: string | null;
    margin_impact_dzd?: number | null;
  }>;
  created_at: string;
}

function useClientBdcs(orgId: string | undefined) {
  return useQuery({
    queryKey: ['client-bdcs-with-config', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<BdcWithConfig[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(
          'id, number, amount_ttc_dzd, consumed_amount_dzd, remaining_amount_dzd, status, parallel_rate_locked, fees_pct_locked, divisor_current, divisor_history, created_at',
        )
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BdcWithConfig[];
    },
  });
}

export function ClientMarginHistoryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const orgQ = useOrganization(id);
  const bdcsQ = useClientBdcs(id);

  const stats = useMemo(() => {
    const bdcs = bdcsQ.data ?? [];
    let totalDeposits = 0;
    let totalMargin = 0;
    let totalDivisorChanges = 0;
    let totalImpactDivisor = 0;

    for (const bdc of bdcs) {
      if (!bdc.parallel_rate_locked || !bdc.fees_pct_locked || !bdc.divisor_current) continue;
      totalDeposits += Number(bdc.amount_ttc_dzd);
      try {
        const cfg: BdcFinancialConfig = {
          parallelRate: Number(bdc.parallel_rate_locked),
          feesPct: Number(bdc.fees_pct_locked),
          divisor: Number(bdc.divisor_current),
        };
        totalMargin += cashMarginDzd(Number(bdc.amount_ttc_dzd), cfg);
      } catch {
        /* skip */
      }
      const history = bdc.divisor_history ?? [];
      totalDivisorChanges += Math.max(0, history.length - 1);
      for (const h of history) {
        if (h.margin_impact_dzd !== undefined && h.margin_impact_dzd !== null) {
          totalImpactDivisor += Number(h.margin_impact_dzd);
        }
      }
    }

    return {
      totalDeposits,
      totalMargin,
      marginPct: totalDeposits > 0 ? totalMargin / totalDeposits : 0,
      bdcCount: bdcs.length,
      totalDivisorChanges,
      totalImpactDivisor,
    };
  }, [bdcsQ.data]);

  if (orgQ.isLoading || bdcsQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!orgQ.data) {
    return <Alert variant="error" title="Client introuvable">L'organisation demandée n'existe pas.</Alert>;
  }

  const bdcs = bdcsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/clients/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-textPrimary">
            <TrendingUp className="h-6 w-6 text-accent" /> Historique marges — {orgQ.data.name}
          </h1>
          <p className="text-sm text-textSecondary">Vue agence, jamais visible côté client.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCell label="Dépôts cumulés" value={formatAmount(stats.totalDeposits, lang)} />
        <KpiCell label="Marge cash totale" value={formatAmount(stats.totalMargin, lang)} highlight />
        <KpiCell label="Marge moyenne" value={formatPercentage(stats.marginPct, lang)} />
        <KpiCell
          label="Impact divisor cumulé"
          value={`${stats.totalImpactDivisor >= 0 ? '+' : ''}${formatAmount(stats.totalImpactDivisor, lang)}`}
          subValue={`${stats.totalDivisorChanges} changement(s)`}
          tone={stats.totalImpactDivisor >= 0 ? 'success' : 'error'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>BDC du client ({bdcs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {bdcs.length === 0 && (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Aucun BDC"
              description="Ce client n'a pas encore de BDC créé."
            />
          )}
          {bdcs.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/30 text-left text-xs uppercase text-textSecondary">
                  <th className="p-3">N°</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Config</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3 text-right">Marge</th>
                  <th className="p-3 text-right">%</th>
                  <th className="p-3">Modifs divisor</th>
                </tr>
              </thead>
              <tbody>
                {bdcs.map((bdc) => {
                  let marginDzd = 0;
                  let marginPct = 0;
                  let markup = 0;
                  if (bdc.parallel_rate_locked && bdc.fees_pct_locked && bdc.divisor_current) {
                    try {
                      const cfg: BdcFinancialConfig = {
                        parallelRate: Number(bdc.parallel_rate_locked),
                        feesPct: Number(bdc.fees_pct_locked),
                        divisor: Number(bdc.divisor_current),
                      };
                      marginDzd = cashMarginDzd(Number(bdc.amount_ttc_dzd), cfg);
                      marginPct = bdc.amount_ttc_dzd > 0 ? marginDzd / bdc.amount_ttc_dzd : 0;
                      markup = totalMarkup(cfg);
                    } catch {
                      /* skip */
                    }
                  }
                  const divisorChanges = (bdc.divisor_history ?? []).length;

                  return (
                    <tr
                      key={bdc.id}
                      className="cursor-pointer border-b border-border/40 hover:bg-background/30"
                      onClick={() => navigate(`/admin/purchase-orders/${bdc.id}`)}
                    >
                      <td className="p-3 font-mono">{bdc.number}</td>
                      <td className="p-3 text-xs">{formatDate(bdc.created_at, lang)}</td>
                      <td className="p-3">
                        <Badge variant="neutral">{bdc.status}</Badge>
                      </td>
                      <td className="p-3 text-xs font-mono text-textSecondary">
                        {bdc.parallel_rate_locked ? (
                          <>
                            ×{Number(bdc.parallel_rate_locked).toFixed(0)} / ÷
                            {Number(bdc.divisor_current).toFixed(2)} / {(Number(bdc.fees_pct_locked) * 100).toFixed(1)}%
                            <span className="ml-1 text-textPrimary">→ {markup.toFixed(3)}</span>
                          </>
                        ) : (
                          <span className="italic">Pas de config</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{formatAmount(bdc.amount_ttc_dzd, lang)}</td>
                      <td className="p-3 text-right font-mono font-bold text-success">
                        {formatAmount(marginDzd, lang)}
                      </td>
                      <td className="p-3 text-right">
                        <Badge
                          variant={marginPct >= 0.6 ? 'success' : marginPct >= 0.4 ? 'warning' : 'error'}
                        >
                          {formatPercentage(marginPct, lang)}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {divisorChanges > 1 ? `${divisorChanges - 1} modif(s)` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {bdcs.some((b) => (b.divisor_history ?? []).length > 1) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historique des modifs divisor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bdcs
              .filter((b) => (b.divisor_history ?? []).length > 1)
              .map((bdc) => (
                <div key={bdc.id} className="rounded-md border border-border bg-background/30 p-3">
                  <p className="font-mono text-sm font-bold">{bdc.number}</p>
                  <ul className="mt-2 space-y-2">
                    {[...(bdc.divisor_history ?? [])].reverse().map((h, idx) => (
                      <li key={idx} className="rounded bg-background/40 p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono">
                            {h.from === null ? '—' : h.from} → {h.to}
                          </span>
                          <span className="text-textSecondary">{formatDateTime(h.changed_at, lang)}</span>
                        </div>
                        {h.note && <p className="mt-1 italic text-textSecondary">{h.note}</p>}
                        {h.margin_impact_dzd !== undefined && h.margin_impact_dzd !== null && (
                          <p
                            className={`mt-1 font-mono ${
                              Number(h.margin_impact_dzd) > 0 ? 'text-success' : 'text-error'
                            }`}
                          >
                            Impact : {Number(h.margin_impact_dzd) > 0 ? '+' : ''}
                            {formatAmount(Number(h.margin_impact_dzd), lang)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface KpiCellProps {
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
  tone?: 'success' | 'error';
}

function KpiCell({ label, value, subValue, highlight, tone }: KpiCellProps): JSX.Element {
  const colorClass =
    tone === 'success' ? 'text-success' : tone === 'error' ? 'text-error' : highlight ? 'text-success' : 'text-textPrimary';
  return (
    <Card className={highlight ? 'border-success/40' : ''}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-textSecondary">{label}</p>
        <p className={`mt-1 font-mono text-2xl font-bold ${colorClass}`}>{value}</p>
        {subValue && <p className="text-xs text-textSecondary">{subValue}</p>}
      </CardContent>
    </Card>
  );
}
