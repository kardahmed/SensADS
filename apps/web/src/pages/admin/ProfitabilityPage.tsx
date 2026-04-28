/**
 * /admin/profitability — Dashboard rentabilité agence (super_admin/admin).
 *
 * Vue agrégée :
 *   - 4 KPIs principaux (marge totale, marge %, BDC actifs, dépôts cumulés)
 *   - Top 10 clients par marge
 *   - Marges par plateforme
 *   - Évolution mensuelle (graph)
 *   - Cash flow prévisionnel sur BDC actifs
 *
 * Vue 100% interne agence. Le client ne voit JAMAIS ces chiffres.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  DollarSign,
  PiggyBank,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { formatAmount, formatDate, formatPercentage } from '@sensads/core';
import {
  useAgencyMarginStats,
  useCashFlowForecast,
  useClientMarginRanking,
  useMonthlyMargins,
  usePlatformMargins,
} from '@/hooks/useMargins';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export function ProfitabilityPage(): JSX.Element {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const stats = useAgencyMarginStats();
  const topClients = useClientMarginRanking(10);
  const platforms = usePlatformMargins();
  const monthly = useMonthlyMargins(12);
  const cashFlow = useCashFlowForecast();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-1 h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Rentabilité agence</h1>
          <p className="text-sm text-textSecondary">
            Vue cumulée des marges. Le client ne voit JAMAIS ces chiffres.
          </p>
        </div>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-accent" />}
          label="Dépôts cumulés"
          value={stats.data ? formatAmount(stats.data.totalDepositsDzd, lang) : '...'}
          loading={stats.isLoading}
        />
        <KpiCard
          icon={<PiggyBank className="h-5 w-5 text-success" />}
          label="Marge cash totale"
          value={stats.data ? formatAmount(stats.data.totalMarginDzd, lang) : '...'}
          subValue={stats.data ? `${formatPercentage(stats.data.marginPct, lang)} de marge` : undefined}
          loading={stats.isLoading}
          highlight
        />
        <KpiCard
          icon={<Activity className="h-5 w-5 text-warning" />}
          label="BDC actifs"
          value={stats.data ? `${stats.data.activeBdcCount} / ${stats.data.bdcCount}` : '...'}
          subValue={stats.data ? `${stats.data.bdcCount} BDC créés` : undefined}
          loading={stats.isLoading}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5 text-violet-400" />}
          label="Cash flow prévu"
          value={cashFlow.data ? formatAmount(cashFlow.data.totalRemainingMarginDzd, lang) : '...'}
          subValue="Marge restant à encaisser"
          loading={cashFlow.isLoading}
        />
      </div>

      {/* Top clients */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Top 10 clients par marge
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {topClients.isLoading && <Skeleton className="m-4 h-40" />}
          {!topClients.isLoading && (topClients.data ?? []).length === 0 && (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="Aucun client encore"
              description="Crée tes premiers BDC clients pour voir le ranking."
            />
          )}
          {!topClients.isLoading && (topClients.data ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/30 text-left text-xs uppercase text-textSecondary">
                  <th className="p-3">#</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Dépôts</th>
                  <th className="p-3 text-right">Real spend</th>
                  <th className="p-3 text-right">Marge</th>
                  <th className="p-3 text-right">Marge %</th>
                  <th className="p-3 text-right">BDC</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {(topClients.data ?? []).map((c, idx) => (
                  <tr
                    key={c.organizationId}
                    className="cursor-pointer border-b border-border/40 hover:bg-background/30"
                    onClick={() => navigate(`/admin/clients/${c.organizationId}`)}
                  >
                    <td className="p-3 font-mono text-xs text-textSecondary">#{idx + 1}</td>
                    <td className="p-3 font-medium">{c.organizationName}</td>
                    <td className="p-3 text-right font-mono">{formatAmount(c.totalDepositsDzd, lang)}</td>
                    <td className="p-3 text-right font-mono text-textSecondary">
                      {formatAmount(c.totalRealSpendDzd, lang)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-success">
                      {formatAmount(c.totalMarginDzd, lang)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant={c.marginPct >= 0.6 ? 'success' : c.marginPct >= 0.4 ? 'warning' : 'error'}
                      >
                        {formatPercentage(c.marginPct, lang)}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{c.bdcCount}</td>
                    <td className="p-3 text-right">
                      <ArrowRight className="ml-auto h-4 w-4 text-textSecondary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Plateformes */}
      <Card>
        <CardHeader>
          <CardTitle>Marges par plateforme</CardTitle>
        </CardHeader>
        <CardContent>
          {platforms.isLoading && <Skeleton className="h-32" />}
          {!platforms.isLoading && (platforms.data ?? []).length === 0 && (
            <p className="text-sm italic text-textSecondary">Aucun KPI enregistré pour le moment.</p>
          )}
          {!platforms.isLoading && (platforms.data ?? []).length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(platforms.data ?? []).map((p) => (
                <div key={p.platform} className="rounded-lg border border-border bg-background/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-textSecondary">{p.platform}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-success">
                    {formatAmount(p.totalMarginDzd, lang)}
                  </p>
                  <p className="text-xs text-textSecondary">
                    {formatPercentage(p.marginPct, lang)} sur {p.campaignCount} KPIs
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Évolution mensuelle */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution mensuelle (12 derniers mois)</CardTitle>
        </CardHeader>
        <CardContent>
          {monthly.isLoading && <Skeleton className="h-48" />}
          {!monthly.isLoading && (monthly.data ?? []).length === 0 && (
            <p className="text-sm italic text-textSecondary">Pas encore de données mensuelles.</p>
          )}
          {!monthly.isLoading && (monthly.data ?? []).length > 0 && (
            <BarChart rows={monthly.data ?? []} lang={lang} />
          )}
        </CardContent>
      </Card>

      {/* Cash flow */}
      <Card>
        <CardHeader>
          <CardTitle>Cash flow prévisionnel</CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlow.isLoading && <Skeleton className="h-32" />}
          {!cashFlow.isLoading && (cashFlow.data?.byMonth ?? []).length === 0 && (
            <p className="text-sm italic text-textSecondary">
              Pas de BDC actif avec budget restant. Tout est consommé ou pas encore créé.
            </p>
          )}
          {!cashFlow.isLoading && (cashFlow.data?.byMonth ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-textSecondary">
                  <th className="p-2">Mois</th>
                  <th className="p-2 text-right">Marge estimée</th>
                  <th className="p-2 text-right">BDC concernés</th>
                </tr>
              </thead>
              <tbody>
                {(cashFlow.data?.byMonth ?? []).map((m) => (
                  <tr key={m.monthKey} className="border-b border-border/40">
                    <td className="p-2 font-mono">{m.monthKey}</td>
                    <td className="p-2 text-right font-mono font-bold text-success">
                      {formatAmount(m.estimatedMarginDzd, lang)}
                    </td>
                    <td className="p-2 text-right font-mono text-xs">{m.bdcCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  icon: JSX.Element;
  label: string;
  value: string;
  subValue?: string;
  loading?: boolean;
  highlight?: boolean;
}

function KpiCard({ icon, label, value, subValue, loading, highlight }: KpiCardProps): JSX.Element {
  return (
    <Card className={highlight ? 'border-success/50 bg-success/5' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-textSecondary">{label}</p>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-32" />
        ) : (
          <>
            <p className={`mt-1 font-mono text-2xl font-bold ${highlight ? 'text-success' : 'text-textPrimary'}`}>
              {value}
            </p>
            {subValue && <p className="text-xs text-textSecondary">{subValue}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface BarChartProps {
  rows: Array<{ monthKey: string; totalDepositsDzd: number; totalMarginDzd: number; marginPct: number }>;
  lang: 'fr' | 'en';
}

function BarChart({ rows, lang }: BarChartProps): JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.totalDepositsDzd));
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const depPct = (r.totalDepositsDzd / max) * 100;
        const marPct = (r.totalMarginDzd / max) * 100;
        return (
          <div key={r.monthKey} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-textSecondary">{r.monthKey}</span>
              <span className="font-mono">
                <span className="text-success">{formatAmount(r.totalMarginDzd, lang)}</span>
                <span className="ml-2 text-textSecondary">/ {formatAmount(r.totalDepositsDzd, lang)}</span>
              </span>
            </div>
            <div className="relative h-5 w-full rounded bg-border">
              <div
                className="absolute left-0 top-0 h-full rounded bg-accent/40"
                style={{ width: `${depPct}%` }}
              />
              <div
                className="absolute left-0 top-0 h-full rounded bg-success"
                style={{ width: `${marPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
