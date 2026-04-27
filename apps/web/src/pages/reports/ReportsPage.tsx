/**
 * /client/reports & /admin/reports — Génération + historique des rapports campagne.
 *
 * Sélection : campagne + période → preview/download PDF (9 slides) +
 * persistance d'une trace dans `reports`.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Loader2 } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { formatDate } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaign } from '@/hooks/useCampaigns';
import { useCampaignKpis } from '@/hooks/useKpis';
import { useOrganization } from '@/hooks/useOrganizations';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useBenchmarks } from '@/hooks/useBenchmarks';
import { useReports, useCreateReport } from '@/hooks/useReports';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ReportPDF, type ReportInsight } from '@/pdfs/ReportPDF';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function ReportsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile } = useAuth();
  const toast = useToast();

  const [campaignId, setCampaignId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>(thirtyDaysAgoIso());
  const [periodEnd, setPeriodEnd] = useState<string>(todayIso());

  const campaignsList = useCampaigns({ pageSize: 50 });
  const reports = useReports();
  const createReport = useCreateReport();

  const campaigns = campaignsList.data?.data ?? [];
  const selected = useCampaign(campaignId || undefined);
  const kpisQ = useCampaignKpis(campaignId || undefined);
  const orgQ = useOrganization(selected.data?.organization_id ?? undefined);
  const settingsQ = useAppSettings();
  const benchmarksQ = useBenchmarks();

  const selectedCampaignRow = selected.data;
  const filteredKpis = useMemo(() => {
    const list = kpisQ.data ?? [];
    return list.filter((k) => k.date >= periodStart && k.date <= periodEnd);
  }, [kpisQ.data, periodStart, periodEnd]);

  const benchmark = useMemo(() => {
    if (!selectedCampaignRow) return null;
    const match = (benchmarksQ.data ?? []).find(
      (b) => b.platform === selectedCampaignRow.platform && b.optimizationGoal === selectedCampaignRow.optimization_goal,
    );
    return match ? { cpm: match.cpm, cpc: match.cpc, ctr: match.ctr, cpa: match.cpa } : null;
  }, [benchmarksQ.data, selectedCampaignRow]);

  const insights: ReportInsight[] = useMemo(() => {
    if (!selectedCampaignRow || filteredKpis.length === 0) return [];
    const out: ReportInsight[] = [];
    const totalSpend = filteredKpis.reduce((s, k) => s + k.spend, 0);
    const totalImpr = filteredKpis.reduce((s, k) => s + k.impressions, 0);
    const totalClicks = filteredKpis.reduce((s, k) => s + k.clicks, 0);
    const totalConv = filteredKpis.reduce((s, k) => s + k.conversions, 0);
    const ctr = totalImpr > 0 ? totalClicks / totalImpr : 0;
    const cpa = totalConv > 0 ? totalSpend / totalConv : 0;

    if (benchmark) {
      if (ctr > benchmark.ctr / 100 * 1.1) {
        out.push({ type: 'success', title: 'CTR au-dessus du benchmark', text: 'La créa et le ciblage performent bien : envisager d\'augmenter le budget.' });
      } else if (ctr < benchmark.ctr / 100 * 0.7) {
        out.push({ type: 'warning', title: 'CTR sous le benchmark', text: 'Tester de nouveaux visuels et raffiner l\'audience.' });
      }
      if (cpa > 0 && cpa > benchmark.cpa * 1.3) {
        out.push({ type: 'warning', title: 'CPA élevé', text: 'Coût d\'acquisition au-dessus du marché. Réviser landing page et offre.' });
      } else if (cpa > 0 && cpa < benchmark.cpa * 0.8) {
        out.push({ type: 'success', title: 'CPA très compétitif', text: 'Excellente efficacité — opportunité de scaling.' });
      }
    }
    if (totalConv === 0 && totalClicks > 100) {
      out.push({ type: 'warning', title: 'Aucune conversion', text: 'Vérifier le tracking et la qualité du trafic.' });
    }
    if (out.length === 0) {
      out.push({ type: 'info', title: 'Performance dans la moyenne', text: 'Continuer le monitoring quotidien et tester des variations créa.' });
    }
    return out;
  }, [filteredKpis, benchmark, selectedCampaignRow]);

  const canRender =
    !!selected.data &&
    !!orgQ.data &&
    !kpisQ.isLoading &&
    !orgQ.isLoading;

  const onPersist = async (): Promise<void> => {
    if (!selectedCampaignRow || !orgQ.data) return;
    try {
      await createReport.mutateAsync({
        organizationId: orgQ.data.id,
        campaignId: selectedCampaignRow.id,
        periodStart,
        periodEnd,
        title: `Rapport ${selectedCampaignRow.name} · ${periodStart} → ${periodEnd}`,
        language: lang,
      });
      toast.show({ variant: 'success', title: 'Rapport enregistré', message: 'Trace ajoutée à l\'historique.' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <FileText className="mt-1 h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.reports', { defaultValue: 'Rapports' })}</h1>
          <p className="text-sm text-textSecondary">Génération de rapport PDF 9 slides : synthèse, KPIs, funnel, benchmarks, insights.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Nouvelle génération</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="campaign">Campagne</Label>
              <Select id="campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">— Choisir une campagne —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} · {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodStart">Début période</Label>
              <Input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Fin période</Label>
              <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          {!campaignId && (
            <p className="text-xs text-textSecondary">Sélectionne une campagne pour activer le téléchargement du PDF.</p>
          )}

          {campaignId && (kpisQ.isLoading || orgQ.isLoading || selected.isLoading) && (
            <div className="flex items-center gap-2 text-sm text-textSecondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des données…
            </div>
          )}

          {campaignId && canRender && selected.data && orgQ.data && settingsQ.data && (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="neutral">{filteredKpis.length} KPI sur la période</Badge>
              {benchmark && <Badge variant="success">Benchmark trouvé</Badge>}
              {!benchmark && <Badge variant="warning">Pas de benchmark</Badge>}

              <div className="ml-auto flex flex-wrap gap-2">
                <PDFDownloadLink
                  document={
                    <ReportPDF
                      campaign={{
                        id: selected.data.id,
                        number: selected.data.number,
                        organizationId: selected.data.organization_id,
                        poId: selected.data.po_id,
                        name: selected.data.name,
                        platform: selected.data.platform,
                        optimizationGoal: selected.data.optimization_goal,
                        budgetDzd: Number(selected.data.budget_dzd),
                        budgetMode: selected.data.budget_mode,
                        startDate: selected.data.start_date,
                        endDate: selected.data.end_date,
                        adAccountId: selected.data.ad_account_id ?? '',
                        specialAdCategory: selected.data.special_ad_category,
                        disclaimerText: selected.data.disclaimer_text,
                        status: selected.data.status,
                        externalId: selected.data.external_id,
                        totalSpentSourceCurrency: Number(selected.data.total_spent_source_currency ?? 0),
                        totalSpentDzd: Number(selected.data.total_spent_dzd ?? 0),
                        submittedAt: selected.data.submitted_at,
                        approvedAt: selected.data.approved_at,
                        approvedBy: selected.data.approved_by,
                        completedAt: selected.data.completed_at,
                        rejectedReason: selected.data.rejected_reason,
                        createdBy: selected.data.created_by,
                        createdAt: selected.data.created_at,
                      }}
                      organization={orgQ.data}
                      kpis={filteredKpis}
                      benchmark={benchmark}
                      insights={insights}
                      agency={{
                        agency_name: settingsQ.data.agencyName,
                        agency_address: settingsQ.data.agencyAddress,
                        agency_email: null,
                        agency_phone: null,
                      }}
                      language={lang}
                      periodStart={periodStart}
                      periodEnd={periodEnd}
                    />
                  }
                  fileName={`rapport-${selected.data.number}-${periodStart}-${periodEnd}.pdf`}
                >
                  {({ loading }) => (
                    <Button variant="primary" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Télécharger PDF
                    </Button>
                  )}
                </PDFDownloadLink>

                <Button variant="outline" onClick={() => void onPersist()} isLoading={createReport.isPending}>
                  Enregistrer trace
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historique</CardTitle></CardHeader>
        <CardContent>
          {reports.isLoading && <Skeleton className="h-32 w-full" />}
          {!reports.isLoading && (reports.data ?? []).length === 0 && (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="Aucun rapport généré"
              description="Les traces des rapports générés apparaîtront ici."
            />
          )}
          {!reports.isLoading && (reports.data ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-textSecondary">
                  <th className="pb-2 font-medium">Titre</th>
                  <th className="pb-2 font-medium">Période</th>
                  <th className="pb-2 font-medium">Lang</th>
                  <th className="pb-2 font-medium">Généré le</th>
                </tr>
              </thead>
              <tbody>
                {(reports.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 text-textPrimary">{r.title}</td>
                    <td className="py-2 text-textSecondary">
                      {formatDate(r.periodStart, lang)} → {formatDate(r.periodEnd, lang)}
                    </td>
                    <td className="py-2"><Badge variant="neutral">{r.language.toUpperCase()}</Badge></td>
                    <td className="py-2 text-textSecondary">{formatDate(r.generatedAt, lang)}</td>
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
