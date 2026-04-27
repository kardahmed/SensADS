/**
 * ReportPDF — Rapport campagne 9 slides (mode CLAIR).
 *
 * Slides :
 *  1. Cover
 *  2. Executive summary
 *  3. KPIs synthétiques
 *  4. Performance journalière (table)
 *  5. Funnel (impressions → clicks → conversions)
 *  6. Benchmarks marché
 *  7. Insights & recommandations
 *  8. Détail dépense vs budget
 *  9. Annexe / mentions
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatAmount, formatDate, formatPercentage, getPlatform } from '@sensads/core';
import type { Campaign, CampaignKpi, Organization } from '@sensads/core';

const COLORS = {
  primary: '#0A2540',
  accent: '#00D4FF',
  accent2: '#38BDF8',
  textSecondary: '#425466',
  textMuted: '#8898AA',
  bgAlt: '#F6F9FC',
  border: '#E6EBF1',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: COLORS.primary },
  pageDark: { padding: 0, fontSize: 10, fontFamily: 'Helvetica', color: '#FFFFFF', backgroundColor: COLORS.primary },

  // Header / footer
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 10, borderBottom: `2 solid ${COLORS.accent}` },
  brandName: { fontSize: 14, fontWeight: 'bold' },
  brandTag: { fontSize: 8, color: COLORS.textMuted },
  slideBadge: { fontSize: 9, color: COLORS.accent, fontWeight: 'bold', letterSpacing: 1 },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, paddingTop: 6, borderTop: `1 solid ${COLORS.border}`, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: COLORS.textMuted },

  // Cover
  coverWrap: { flex: 1, padding: 60, justifyContent: 'space-between' },
  coverTopBrand: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  coverTagline: { fontSize: 10, color: COLORS.accent, marginTop: 4, letterSpacing: 2 },
  coverTitle: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 1.1 },
  coverSub: { fontSize: 14, color: COLORS.accent, marginTop: 8 },
  coverMeta: { fontSize: 10, color: '#9CA3AF', marginTop: 24, lineHeight: 1.6 },
  coverAccentBar: { width: 80, height: 4, backgroundColor: COLORS.accent, marginVertical: 16 },

  // Sections
  h1: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 'bold', marginBottom: 6, color: COLORS.primary },
  pSec: { fontSize: 10, color: COLORS.textSecondary, lineHeight: 1.5 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: COLORS.accent, marginBottom: 8, letterSpacing: 1 },

  // KPI cards
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiCard: { flex: 1, padding: 12, backgroundColor: COLORS.bgAlt, borderRadius: 4, borderLeft: `3 solid ${COLORS.accent}` },
  kpiLabel: { fontSize: 8, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  kpiValue: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  kpiSubValue: { fontSize: 8, color: COLORS.textSecondary, marginTop: 2 },

  // Tables
  table: { marginBottom: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, color: '#FFFFFF', padding: 6 },
  tableHeaderCell: { fontSize: 9, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', padding: 6, borderBottom: `1 solid ${COLORS.border}` },
  tableRowAlt: { backgroundColor: COLORS.bgAlt },
  cell: { fontSize: 9 },
  cellRight: { fontSize: 9, textAlign: 'right' },

  // Funnel
  funnelStep: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  funnelLabel: { width: 100, fontSize: 10, fontWeight: 'bold' },
  funnelBar: { height: 22, backgroundColor: COLORS.accent2, borderRadius: 2, justifyContent: 'center', paddingHorizontal: 8 },
  funnelBarText: { fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' },
  funnelMeta: { marginLeft: 8, fontSize: 9, color: COLORS.textSecondary },

  // Benchmark / insight blocks
  bench: { padding: 10, backgroundColor: COLORS.bgAlt, borderRadius: 4, marginBottom: 6 },
  benchLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  benchLabel: { fontSize: 9, color: COLORS.textSecondary },
  benchValue: { fontSize: 9, fontWeight: 'bold' },

  insight: { padding: 10, borderRadius: 4, marginBottom: 8, borderLeft: `3 solid ${COLORS.accent}` },
  insightTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 3 },
  insightText: { fontSize: 9, color: COLORS.textSecondary, lineHeight: 1.4 },

  // Budget bar
  budgetBar: { marginVertical: 4, height: 16, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  budgetFill: { height: '100%', backgroundColor: COLORS.success },
});

interface AgencyData {
  agency_name: string;
  agency_address?: string | null;
  agency_email?: string | null;
  agency_phone?: string | null;
}

interface BenchmarkData {
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
}

export interface ReportInsight {
  type: 'success' | 'warning' | 'info';
  title: string;
  text: string;
}

interface Props {
  campaign: Campaign;
  organization: Organization;
  kpis: CampaignKpi[];
  benchmark?: BenchmarkData | null;
  insights?: ReportInsight[];
  agency?: AgencyData;
  language?: 'fr' | 'en';
  periodStart: string;
  periodEnd: string;
}

interface KpiTotals {
  spend: number;
  spendDzd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
}

function totalsOf(kpis: CampaignKpi[]): KpiTotals {
  const t = kpis.reduce(
    (acc, k) => ({
      spend: acc.spend + k.spend,
      spendDzd: acc.spendDzd + k.spendDzd,
      impressions: acc.impressions + k.impressions,
      clicks: acc.clicks + k.clicks,
      conversions: acc.conversions + k.conversions,
      reach: Math.max(acc.reach, k.reach),
    }),
    { spend: 0, spendDzd: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0 },
  );
  return {
    ...t,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpa: t.conversions > 0 ? t.spend / t.conversions : 0,
  };
}

function PageHeader({ agency, slide, total }: { agency?: AgencyData; slide: number; total: number }): JSX.Element {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brandName}>{agency?.agency_name ?? 'SENSIUM-X'}</Text>
        <Text style={styles.brandTag}>Digital Traffic Management</Text>
      </View>
      <Text style={styles.slideBadge}>SLIDE {slide} / {total}</Text>
    </View>
  );
}

function PageFooter({ campaign, agency }: { campaign: Campaign; agency?: AgencyData }): JSX.Element {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{agency?.agency_name ?? 'SENSIUM-X'} · Rapport {campaign.number}</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function ReportPDF({
  campaign,
  organization,
  kpis,
  benchmark,
  insights,
  agency,
  language = 'fr',
  periodStart,
  periodEnd,
}: Props): JSX.Element {
  const lang = language;
  const platform = getPlatform(campaign.platform);
  const totals = totalsOf(kpis);
  const budgetUsedPct = campaign.budgetDzd > 0 ? Math.min(1, totals.spendDzd / campaign.budgetDzd) : 0;
  const remaining = Math.max(0, campaign.budgetDzd - totals.spendDzd);
  const sortedKpis = [...kpis].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Document title={`Rapport ${campaign.number}`} author={agency?.agency_name ?? 'SENSIUM-X'}>
      {/* Slide 1 — Cover */}
      <Page size="A4" style={styles.pageDark}>
        <View style={styles.coverWrap}>
          <View>
            <Text style={styles.coverTopBrand}>{agency?.agency_name ?? 'SENSIUM-X'}</Text>
            <Text style={styles.coverTagline}>RAPPORT DE PERFORMANCE</Text>
          </View>
          <View>
            <Text style={styles.coverTitle}>{campaign.name}</Text>
            <View style={styles.coverAccentBar} />
            <Text style={styles.coverSub}>{platform?.name ?? campaign.platform} · {campaign.optimizationGoal.toUpperCase()}</Text>
            <Text style={styles.coverMeta}>
              Client : {organization.name}{'\n'}
              Référence : {campaign.number}{'\n'}
              Période : {formatDate(periodStart, lang)} → {formatDate(periodEnd, lang)}{'\n'}
              Édité le : {formatDate(new Date().toISOString(), lang)}
            </Text>
          </View>
          <Text style={{ fontSize: 8, color: '#6B7280' }}>
            Document confidentiel · destiné exclusivement à {organization.name}
          </Text>
        </View>
      </Page>

      {/* Slide 2 — Executive summary */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={2} total={9} />
        <Text style={styles.sectionTitle}>Synthèse exécutive</Text>
        <Text style={styles.h1}>Vue d&apos;ensemble</Text>
        <Text style={styles.pSec}>
          Cette campagne {platform?.name ?? campaign.platform} a généré {totals.impressions.toLocaleString('fr-FR')} impressions
          pour {totals.clicks.toLocaleString('fr-FR')} clics et {totals.conversions.toLocaleString('fr-FR')} conversions
          sur la période du {formatDate(periodStart, lang)} au {formatDate(periodEnd, lang)}.
          La dépense totale s&apos;élève à {formatAmount(totals.spendDzd, lang)} ({formatPercentage(budgetUsedPct, lang)} du budget alloué).
        </Text>

        <View style={[styles.kpiRow, { marginTop: 18 }]}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Dépense totale</Text>
            <Text style={styles.kpiValue}>{formatAmount(totals.spendDzd, lang)}</Text>
            <Text style={styles.kpiSubValue}>Budget : {formatAmount(campaign.budgetDzd, lang)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Impressions</Text>
            <Text style={styles.kpiValue}>{totals.impressions.toLocaleString('fr-FR')}</Text>
            <Text style={styles.kpiSubValue}>Reach : {totals.reach.toLocaleString('fr-FR')}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Conversions</Text>
            <Text style={styles.kpiValue}>{totals.conversions.toLocaleString('fr-FR')}</Text>
            <Text style={styles.kpiSubValue}>CPA : {formatAmount(totals.cpa, lang, 'USD')}</Text>
          </View>
        </View>

        <Text style={styles.h2}>Statut</Text>
        <Text style={styles.pSec}>
          La campagne est actuellement au statut <Text style={{ fontWeight: 'bold', color: COLORS.accent }}>{campaign.status.toUpperCase()}</Text>.
          {campaign.endDate ? ` Date de fin prévue : ${formatDate(campaign.endDate, lang)}.` : ''}
        </Text>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 3 — KPIs synthétiques */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={3} total={9} />
        <Text style={styles.sectionTitle}>Indicateurs clés</Text>
        <Text style={styles.h1}>Performance globale</Text>

        <View style={[styles.kpiRow, { marginTop: 14 }]}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>CPM</Text>
            <Text style={styles.kpiValue}>{formatAmount(totals.cpm, lang, 'USD')}</Text>
            <Text style={styles.kpiSubValue}>Coût pour 1000 impressions</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>CPC</Text>
            <Text style={styles.kpiValue}>{formatAmount(totals.cpc, lang, 'USD')}</Text>
            <Text style={styles.kpiSubValue}>Coût par clic</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>CTR</Text>
            <Text style={styles.kpiValue}>{formatPercentage(totals.ctr, lang)}</Text>
            <Text style={styles.kpiSubValue}>Taux de clics</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>CPA</Text>
            <Text style={styles.kpiValue}>{formatAmount(totals.cpa, lang, 'USD')}</Text>
            <Text style={styles.kpiSubValue}>Coût par acquisition</Text>
          </View>
        </View>

        <Text style={styles.h2}>Volumétrie</Text>
        <View style={styles.bench}>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Impressions servies</Text>
            <Text style={styles.benchValue}>{totals.impressions.toLocaleString('fr-FR')}</Text>
          </View>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Clics</Text>
            <Text style={styles.benchValue}>{totals.clicks.toLocaleString('fr-FR')}</Text>
          </View>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Conversions</Text>
            <Text style={styles.benchValue}>{totals.conversions.toLocaleString('fr-FR')}</Text>
          </View>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Audience touchée (reach)</Text>
            <Text style={styles.benchValue}>{totals.reach.toLocaleString('fr-FR')}</Text>
          </View>
        </View>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 4 — Performance journalière */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={4} total={9} />
        <Text style={styles.sectionTitle}>Évolution quotidienne</Text>
        <Text style={styles.h1}>Performance par jour</Text>

        <View style={[styles.table, { marginTop: 14 }]}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: '18%' }]}>Date</Text>
            <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'right' }]}>Dépense</Text>
            <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'right' }]}>Impressions</Text>
            <Text style={[styles.tableHeaderCell, { width: '13%', textAlign: 'right' }]}>Clics</Text>
            <Text style={[styles.tableHeaderCell, { width: '13%', textAlign: 'right' }]}>Conv.</Text>
            <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'right' }]}>CTR</Text>
            <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'right' }]}>CPA</Text>
          </View>
          {sortedKpis.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, { width: '100%', color: COLORS.textMuted, textAlign: 'center' }]}>
                Aucun KPI saisi sur la période.
              </Text>
            </View>
          )}
          {sortedKpis.slice(0, 30).map((k, idx) => (
            <View key={k.id} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.cell, { width: '18%' }]}>{formatDate(k.date, lang)}</Text>
              <Text style={[styles.cellRight, { width: '18%' }]}>{formatAmount(k.spendDzd, lang)}</Text>
              <Text style={[styles.cellRight, { width: '18%' }]}>{k.impressions.toLocaleString('fr-FR')}</Text>
              <Text style={[styles.cellRight, { width: '13%' }]}>{k.clicks.toLocaleString('fr-FR')}</Text>
              <Text style={[styles.cellRight, { width: '13%' }]}>{k.conversions.toLocaleString('fr-FR')}</Text>
              <Text style={[styles.cellRight, { width: '10%' }]}>{formatPercentage(k.ctr, lang)}</Text>
              <Text style={[styles.cellRight, { width: '10%' }]}>{formatAmount(k.cpa, lang, 'USD')}</Text>
            </View>
          ))}
        </View>
        {sortedKpis.length > 30 && (
          <Text style={[styles.pSec, { fontStyle: 'italic' }]}>
            Affichage des 30 premiers jours. {sortedKpis.length - 30} jours supplémentaires disponibles dans l&apos;app.
          </Text>
        )}

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 5 — Funnel */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={5} total={9} />
        <Text style={styles.sectionTitle}>Tunnel de conversion</Text>
        <Text style={styles.h1}>Du coût au résultat</Text>

        <View style={{ marginTop: 18 }}>
          {(() => {
            const max = Math.max(totals.impressions, 1);
            const steps = [
              { label: 'Impressions', value: totals.impressions, sub: `${formatAmount(totals.cpm, lang, 'USD')} CPM` },
              { label: 'Clics', value: totals.clicks, sub: `${formatPercentage(totals.ctr, lang)} CTR` },
              { label: 'Conversions', value: totals.conversions, sub: `${formatAmount(totals.cpa, lang, 'USD')} CPA` },
            ];
            return steps.map((s) => {
              const pct = (s.value / max) * 100;
              const widthPct = `${Math.max(8, pct)}%` as const;
              return (
                <View key={s.label} style={styles.funnelStep}>
                  <Text style={styles.funnelLabel}>{s.label}</Text>
                  <View style={[styles.funnelBar, { width: widthPct }]}>
                    <Text style={styles.funnelBarText}>{s.value.toLocaleString('fr-FR')}</Text>
                  </View>
                  <Text style={styles.funnelMeta}>{s.sub}</Text>
                </View>
              );
            });
          })()}
        </View>

        <Text style={[styles.h2, { marginTop: 18 }]}>Lecture</Text>
        <Text style={styles.pSec}>
          Le funnel illustre la déperdition à chaque étape. Le ratio Clics/Impressions ({formatPercentage(totals.ctr, lang)}) mesure
          l&apos;attractivité de la créa, le ratio Conversions/Clics ({formatPercentage(totals.clicks > 0 ? totals.conversions / totals.clicks : 0, lang)}) mesure la pertinence
          de la landing page et de l&apos;offre.
        </Text>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 6 — Benchmarks */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={6} total={9} />
        <Text style={styles.sectionTitle}>Comparaison marché</Text>
        <Text style={styles.h1}>Benchmark MENA</Text>

        {benchmark ? (
          <View style={[styles.bench, { marginTop: 14 }]}>
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>CPM — campagne</Text>
              <Text style={styles.benchValue}>{formatAmount(totals.cpm, lang, 'USD')}</Text>
            </View>
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>CPM — benchmark MENA</Text>
              <Text style={[styles.benchValue, { color: COLORS.textMuted }]}>{formatAmount(benchmark.cpm, lang, 'USD')}</Text>
            </View>
            <View style={[styles.benchLine, { marginTop: 8 }]}>
              <Text style={styles.benchLabel}>CPC — campagne</Text>
              <Text style={styles.benchValue}>{formatAmount(totals.cpc, lang, 'USD')}</Text>
            </View>
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>CPC — benchmark MENA</Text>
              <Text style={[styles.benchValue, { color: COLORS.textMuted }]}>{formatAmount(benchmark.cpc, lang, 'USD')}</Text>
            </View>
            <View style={[styles.benchLine, { marginTop: 8 }]}>
              <Text style={styles.benchLabel}>CTR — campagne</Text>
              <Text style={styles.benchValue}>{formatPercentage(totals.ctr, lang)}</Text>
            </View>
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>CTR — benchmark MENA</Text>
              <Text style={[styles.benchValue, { color: COLORS.textMuted }]}>{formatPercentage(benchmark.ctr / 100, lang)}</Text>
            </View>
            <View style={[styles.benchLine, { marginTop: 8 }]}>
              <Text style={styles.benchLabel}>CPA — campagne</Text>
              <Text style={styles.benchValue}>{formatAmount(totals.cpa, lang, 'USD')}</Text>
            </View>
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>CPA — benchmark MENA</Text>
              <Text style={[styles.benchValue, { color: COLORS.textMuted }]}>{formatAmount(benchmark.cpa, lang, 'USD')}</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.pSec, { marginTop: 18 }]}>
            Aucun benchmark disponible pour {platform?.name ?? campaign.platform} · {campaign.optimizationGoal}.
          </Text>
        )}

        <Text style={[styles.h2, { marginTop: 14 }]}>Méthodologie</Text>
        <Text style={styles.pSec}>
          Les benchmarks sont issus d&apos;agrégats marché MENA pour la même plateforme et le même objectif d&apos;optimisation.
          Ils servent de repère et non de cible absolue : le contexte produit, saisonnalité et créa peuvent expliquer des écarts légitimes.
        </Text>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 7 — Insights */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={7} total={9} />
        <Text style={styles.sectionTitle}>Recommandations</Text>
        <Text style={styles.h1}>Insights & actions</Text>

        <View style={{ marginTop: 14 }}>
          {(insights ?? []).length === 0 && (
            <Text style={styles.pSec}>Aucune recommandation automatique disponible. Activez le module Intelligence pour générer des insights.</Text>
          )}
          {(insights ?? []).map((i, idx) => {
            const accent = i.type === 'success' ? COLORS.success : i.type === 'warning' ? COLORS.warning : COLORS.accent;
            return (
              <View key={idx} style={[styles.insight, { borderLeftColor: accent, backgroundColor: COLORS.bgAlt }]}>
                <Text style={[styles.insightTitle, { color: accent }]}>{i.title}</Text>
                <Text style={styles.insightText}>{i.text}</Text>
              </View>
            );
          })}
        </View>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 8 — Budget */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={8} total={9} />
        <Text style={styles.sectionTitle}>Budget & dépense</Text>
        <Text style={styles.h1}>Suivi budgétaire</Text>

        <View style={[styles.kpiRow, { marginTop: 14 }]}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Budget alloué</Text>
            <Text style={styles.kpiValue}>{formatAmount(campaign.budgetDzd, lang)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Dépensé</Text>
            <Text style={styles.kpiValue}>{formatAmount(totals.spendDzd, lang)}</Text>
            <Text style={styles.kpiSubValue}>{formatPercentage(budgetUsedPct, lang)} du budget</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Reste</Text>
            <Text style={styles.kpiValue}>{formatAmount(remaining, lang)}</Text>
          </View>
        </View>

        <Text style={styles.h2}>Progression</Text>
        <View style={styles.budgetBar}>
          <View style={[styles.budgetFill, { width: `${Math.round(budgetUsedPct * 100)}%` }]} />
        </View>
        <Text style={[styles.pSec, { marginTop: 4 }]}>
          {formatPercentage(budgetUsedPct, lang)} du budget consommé sur la période. Mode :
          <Text style={{ fontWeight: 'bold' }}> {campaign.budgetMode.toUpperCase()}</Text>.
        </Text>

        <Text style={[styles.h2, { marginTop: 18 }]}>Source de calcul</Text>
        <Text style={styles.pSec}>
          Les montants en DZD sont calculés à partir du taux de change figé (`exchange_rate_snapshot`) au moment de chaque KPI quotidien.
          La conversion respecte la grille tarifaire applicable au client.
        </Text>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>

      {/* Slide 9 — Annexe */}
      <Page size="A4" style={styles.page}>
        <PageHeader agency={agency} slide={9} total={9} />
        <Text style={styles.sectionTitle}>Annexe & mentions</Text>
        <Text style={styles.h1}>Informations complémentaires</Text>

        <Text style={[styles.h2, { marginTop: 14 }]}>Identifiants</Text>
        <View style={styles.bench}>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Référence campagne</Text>
            <Text style={styles.benchValue}>{campaign.number}</Text>
          </View>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Plateforme</Text>
            <Text style={styles.benchValue}>{platform?.name ?? campaign.platform}</Text>
          </View>
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Compte publicitaire</Text>
            <Text style={styles.benchValue}>{campaign.adAccountId}</Text>
          </View>
          {campaign.externalId && (
            <View style={styles.benchLine}>
              <Text style={styles.benchLabel}>ID externe</Text>
              <Text style={styles.benchValue}>{campaign.externalId}</Text>
            </View>
          )}
          <View style={styles.benchLine}>
            <Text style={styles.benchLabel}>Catégorie spéciale</Text>
            <Text style={styles.benchValue}>{campaign.specialAdCategory}</Text>
          </View>
        </View>

        <Text style={[styles.h2, { marginTop: 14 }]}>Période couverte</Text>
        <Text style={styles.pSec}>
          Du {formatDate(periodStart, lang)} au {formatDate(periodEnd, lang)} inclus. {sortedKpis.length} jours de données analysés.
        </Text>

        <Text style={[styles.h2, { marginTop: 14 }]}>Mentions légales</Text>
        <Text style={[styles.pSec, { fontSize: 8 }]}>
          Document confidentiel destiné exclusivement à {organization.name}. Reproduction et diffusion interdites sans
          autorisation écrite préalable. Les données sont issues des plateformes publicitaires et des saisies manuelles
          effectuées par l&apos;équipe Traffic Management. Les benchmarks sont indicatifs et ne constituent pas une garantie
          de performance future.{'\n\n'}
          {agency?.agency_name ?? 'SENSIUM-X'}
          {agency?.agency_address ? ` · ${agency.agency_address}` : ''}
          {agency?.agency_email ? ` · ${agency.agency_email}` : ''}
          {agency?.agency_phone ? ` · ${agency.agency_phone}` : ''}
        </Text>

        <PageFooter campaign={campaign} agency={agency} />
      </Page>
    </Document>
  );
}
