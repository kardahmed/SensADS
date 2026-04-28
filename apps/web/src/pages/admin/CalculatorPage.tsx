/**
 * /admin/calculator — Simulateur financier rapide.
 *
 * Permet à l'agence (super_admin/admin/TM) de simuler en temps réel :
 *   • Le budget réellement dépensable sur Meta
 *   • Le markup total appliqué
 *   • La marge cash prévisionnelle
 *   • Les impressions/clics estimés selon le compte pub choisi
 *   • Les KPIs displayed côté client
 *   • La comparaison entre 2 scénarios
 *
 * Outil quotidien pour pricer un devis client en 10 secondes.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ArrowRight, Sparkles, AlertTriangle } from 'lucide-react';
import {
  cashMarginDzd,
  computeAgencyMarginBreakdown,
  deriveClientKpisFromReal,
  executableBudgetUsd,
  formatAmount,
  formatPercentage,
  totalMarkup,
  type BdcFinancialConfig,
} from '@sensads/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { CostDisplay } from '@/components/ui/CostDisplay';

/**
 * Comptes pub agence (mockés pour le calculator de Sprint 1).
 * Sera remplacé en Sprint 2 par lecture depuis la table `agency_ad_accounts`
 * que l'utilisateur gérera via /admin/ad-accounts.
 *
 * Le user choisit un compte → currency + bank rate + CPM observé sont auto-déduits.
 */
interface AgencyAdAccount {
  id: string;
  name: string;
  currency: string;
  bankRateToUsd: number;
  observedCpm: number;
  notes?: string;
}

const AGENCY_ACCOUNTS: AgencyAdAccount[] = [
  { id: 'sensads_usd_01', name: 'sensads_usd_01', currency: 'USD', bankRateToUsd: 1, observedCpm: 0.30, notes: 'Compte USD principal' },
  { id: 'sensads_usd_02', name: 'sensads_usd_02', currency: 'USD', bankRateToUsd: 1, observedCpm: 0.32, notes: 'Compte USD backup' },
  { id: 'sensads_inr_01', name: 'sensads_inr_01', currency: 'INR', bankRateToUsd: 0.011, observedCpm: 16, notes: 'Compte indien — CPM bas' },
  { id: 'sensads_inr_02', name: 'sensads_inr_02', currency: 'INR', bankRateToUsd: 0.011, observedCpm: 18, notes: 'Compte indien #2' },
  { id: 'sensads_eur_01', name: 'sensads_eur_01', currency: 'EUR', bankRateToUsd: 1.08, observedCpm: 0.25, notes: 'Compte européen' },
  { id: 'sensads_aed_01', name: 'sensads_aed_01', currency: 'AED', bankRateToUsd: 0.272, observedCpm: 0.90, notes: 'Compte Émirats' },
  { id: 'sensads_gbp_01', name: 'sensads_gbp_01', currency: 'GBP', bankRateToUsd: 1.26, observedCpm: 0.40, notes: 'Compte UK' },
];

interface ScenarioInput {
  depositDzd: number;
  parallelRate: number;
  feesPct: number;
  divisor: number;
  /** ID du compte pub agence sélectionné (les autres champs en découlent) */
  accountId: string;
  /** Override CPM réel observé sur ce compte (sinon valeur par défaut du compte) */
  observedCpmOverride: number | null;
  estimatedCtr: number;
  estimatedCvr: number;
}

const DEFAULT_ACCOUNT = AGENCY_ACCOUNTS[2]; // sensads_inr_01

const INITIAL_SCENARIO: ScenarioInput = {
  depositDzd: 1_200_000,
  parallelRate: 260,
  feesPct: 0.06,
  divisor: 2.6,
  accountId: DEFAULT_ACCOUNT.id,
  observedCpmOverride: null,
  estimatedCtr: 0.015,
  estimatedCvr: 0.005,
};

function getAccount(id: string): AgencyAdAccount {
  return AGENCY_ACCOUNTS.find((a) => a.id === id) ?? AGENCY_ACCOUNTS[0];
}

interface ScenarioResult {
  config: BdcFinancialConfig;
  markup: number;
  realUsd: number;
  realDzdParallel: number;
  realInAccountCurrency: number;
  marginDzd: number;
  marginPct: number;
  estimatedImpressions: number;
  estimatedClicks: number;
  estimatedConversions: number;
  displayedSpendDzd: number;
  displayedSpendUsd: number;
  displayedCpmDzd: number;
  displayedCpmUsd: number;
  displayedCpcDzd: number;
  displayedCpcUsd: number;
}

function computeScenario(input: ScenarioInput): ScenarioResult {
  const config: BdcFinancialConfig = {
    parallelRate: input.parallelRate,
    feesPct: input.feesPct,
    divisor: input.divisor,
  };

  const account = getAccount(input.accountId);
  const realCpmAccountCurrency = input.observedCpmOverride ?? account.observedCpm;

  const realUsd = executableBudgetUsd(input.depositDzd, config);
  const realInAccount = account.currency === 'USD'
    ? realUsd
    : realUsd / account.bankRateToUsd;

  const marginDzd = cashMarginDzd(input.depositDzd, config);
  const marginPct = input.depositDzd > 0 ? marginDzd / input.depositDzd : 0;

  // Real CPM converted to USD : CPM_account × bankRate
  const realCpmUsd = account.currency === 'USD'
    ? realCpmAccountCurrency
    : realCpmAccountCurrency * account.bankRateToUsd;

  const impressions = realCpmUsd > 0 ? Math.round((realUsd / realCpmUsd) * 1000) : 0;
  const clicks = Math.round(impressions * input.estimatedCtr);
  const conversions = Math.round(clicks * input.estimatedCvr);

  const kpis = deriveClientKpisFromReal(
    {
      spendAccountCurrency: realInAccount,
      accountCurrency: account.currency,
      bankRateToUsd: account.bankRateToUsd,
      impressions,
      clicks,
      conversions,
    },
    config,
  );

  const breakdown = computeAgencyMarginBreakdown(
    input.depositDzd,
    {
      amountAccountCurrency: realInAccount,
      accountCurrency: account.currency,
      bankRateToUsd: account.bankRateToUsd,
    },
    config,
  );

  return {
    config,
    markup: totalMarkup(config),
    realUsd: breakdown.realSpendUsd,
    realDzdParallel: breakdown.realSpendDzdAtParallel,
    realInAccountCurrency: realInAccount,
    marginDzd,
    marginPct,
    estimatedImpressions: impressions,
    estimatedClicks: clicks,
    estimatedConversions: conversions,
    displayedSpendDzd: kpis.spendDzd,
    displayedSpendUsd: kpis.spendUsd,
    displayedCpmDzd: kpis.cpmDzd,
    displayedCpmUsd: kpis.cpmUsd,
    displayedCpcDzd: kpis.cpcDzd,
    displayedCpcUsd: kpis.cpcUsd,
  };
}

export function CalculatorPage(): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const [scenarioA, setScenarioA] = useState<ScenarioInput>(INITIAL_SCENARIO);
  const [scenarioB, setScenarioB] = useState<ScenarioInput>({
    ...INITIAL_SCENARIO,
    parallelRate: 280,
    divisor: 3.0,
    feesPct: 0.07,
  });
  const [compareEnabled, setCompareEnabled] = useState(false);

  const resultA = useMemo(() => computeScenario(scenarioA), [scenarioA]);
  const resultB = useMemo(() => computeScenario(scenarioB), [scenarioB]);

  const updateA = (patch: Partial<ScenarioInput>) =>
    setScenarioA((s) => ({ ...s, ...patch }));
  const updateB = (patch: Partial<ScenarioInput>) =>
    setScenarioB((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Calculator className="mt-1 h-6 w-6 text-accent" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-textPrimary">Calculateur financier</h1>
          <p className="text-sm text-textSecondary">
            Simule une campagne en temps réel avant de signer un devis. Compare 2 configurations pour optimiser ta marge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCompareEnabled((v) => !v)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-background/40"
        >
          {compareEnabled ? 'Cacher comparaison' : '+ Comparer 2 scénarios'}
        </button>
      </div>

      <div className={`grid gap-6 ${compareEnabled ? 'lg:grid-cols-2' : ''}`}>
        <ScenarioCard
          title={compareEnabled ? 'Scénario A' : 'Simulation'}
          input={scenarioA}
          result={resultA}
          onChange={updateA}
          accent="text-accent"
        />
        {compareEnabled && (
          <ScenarioCard
            title="Scénario B"
            input={scenarioB}
            result={resultB}
            onChange={updateB}
            accent="text-violet-400"
          />
        )}
      </div>

      {compareEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" /> Différentiel A → B
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <DiffCell
              label="Marge cash"
              valueA={resultA.marginDzd}
              valueB={resultB.marginDzd}
              format={(v) => formatAmount(v, lang)}
              positiveDirection="up"
            />
            <DiffCell
              label="Marge %"
              valueA={resultA.marginPct}
              valueB={resultB.marginPct}
              format={(v) => formatPercentage(v, lang)}
              positiveDirection="up"
            />
            <DiffCell
              label="Impressions"
              valueA={resultA.estimatedImpressions}
              valueB={resultB.estimatedImpressions}
              format={(v) => Math.round(v).toLocaleString('fr-FR')}
              positiveDirection="up"
            />
            <DiffCell
              label="Real spend USD"
              valueA={resultA.realUsd}
              valueB={resultB.realUsd}
              format={(v) => formatAmount(v, lang, 'USD', { maxDecimals: 2 })}
              positiveDirection="down"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ScenarioCardProps {
  title: string;
  input: ScenarioInput;
  result: ScenarioResult;
  onChange: (patch: Partial<ScenarioInput>) => void;
  accent: string;
}

function ScenarioCard({ title, input, result, onChange, accent }: ScenarioCardProps): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const marginLevel = result.marginPct >= 0.6 ? 'green' : result.marginPct >= 0.4 ? 'orange' : 'red';
  const marginColor =
    marginLevel === 'green' ? 'text-success' : marginLevel === 'orange' ? 'text-warning' : 'text-error';

  return (
    <Card>
      <CardHeader>
        <CardTitle className={accent}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* INPUTS */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dep">Dépôt client (DZD)</Label>
            <Input
              id="dep"
              type="number"
              step="1000"
              min="0"
              value={input.depositDzd}
              onChange={(e) => onChange({ depositDzd: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="par">Cours parallèle</Label>
            <Input
              id="par"
              type="number"
              step="1"
              min="1"
              value={input.parallelRate}
              onChange={(e) => onChange({ parallelRate: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee">Frais (%)</Label>
            <Input
              id="fee"
              type="number"
              step="0.01"
              min="0"
              max="99"
              value={input.feesPct * 100}
              onChange={(e) => onChange({ feesPct: (Number(e.target.value) || 0) / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="div">Divisor</Label>
            <Input
              id="div"
              type="number"
              step="0.1"
              min="1"
              value={input.divisor}
              onChange={(e) => onChange({ divisor: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="acc">Compte pub agence</Label>
            <Select
              id="acc"
              value={input.accountId}
              onChange={(e) => onChange({ accountId: e.target.value, observedCpmOverride: null })}
            >
              {AGENCY_ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency}) — CPM réel ≈ {a.observedCpm} {a.currency}
                </option>
              ))}
            </Select>
            {(() => {
              const acc = getAccount(input.accountId);
              return (
                <p className="text-xs text-textSecondary">
                  Devise auto : <span className="font-mono">{acc.currency}</span>
                  {' · '}
                  Bank rate → USD : <span className="font-mono">{acc.bankRateToUsd}</span>
                  {acc.notes && (
                    <span className="block italic">{acc.notes}</span>
                  )}
                </p>
              );
            })()}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="cpm">
              Real CPM observé ({getAccount(input.accountId).currency})
              <span className="ml-1 text-xs font-normal text-textSecondary">— override optionnel</span>
            </Label>
            <Input
              id="cpm"
              type="number"
              step="0.01"
              min="0.001"
              placeholder={String(getAccount(input.accountId).observedCpm)}
              value={input.observedCpmOverride ?? getAccount(input.accountId).observedCpm}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                const def = getAccount(input.accountId).observedCpm;
                onChange({ observedCpmOverride: v === def ? null : v });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ctr">CTR estimé (%)</Label>
            <Input
              id="ctr"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={input.estimatedCtr * 100}
              onChange={(e) => onChange({ estimatedCtr: (Number(e.target.value) || 0) / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cvr">CVR estimé (%)</Label>
            <Input
              id="cvr"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={input.estimatedCvr * 100}
              onChange={(e) => onChange({ estimatedCvr: (Number(e.target.value) || 0) / 100 })}
            />
          </div>
        </div>

        {/* OUTPUTS */}
        <div className="space-y-3 rounded-md border border-border bg-background/30 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-textSecondary">Markup total</p>
            <p className="font-mono text-lg font-bold text-textPrimary">
              × {result.markup.toFixed(5)}
            </p>
            <p className="text-xs text-textSecondary">= divisor / (1 − fees)</p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <p className="text-xs text-textSecondary">Real spend USD</p>
              <p className="font-mono font-bold text-textPrimary">
                {formatAmount(result.realUsd, lang, 'USD', { maxDecimals: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-textSecondary">Real spend DZD</p>
              <p className="font-mono font-bold text-textPrimary">
                {formatAmount(result.realDzdParallel, lang)}
              </p>
            </div>
            <div>
              <p className="text-xs text-textSecondary">Injecté ({getAccount(input.accountId).currency})</p>
              <p className="font-mono text-textPrimary">
                {result.realInAccountCurrency.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {getAccount(input.accountId).currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-textSecondary">Displayed client (DZD)</p>
              <p className="font-mono text-textPrimary">
                {formatAmount(result.displayedSpendDzd, lang)}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-textSecondary">💰 Marge cash</p>
            <p className={`font-mono text-2xl font-bold ${marginColor}`}>
              {formatAmount(result.marginDzd, lang)}
            </p>
            <p className={`text-sm ${marginColor}`}>
              {formatPercentage(result.marginPct, lang)} du dépôt
            </p>
            {marginLevel === 'red' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-error">
                <AlertTriangle className="h-3 w-3" /> Marge faible : vérifie ta config
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
            <div>
              <p className="text-textSecondary">Impressions</p>
              <p className="font-mono font-bold text-textPrimary">
                {result.estimatedImpressions.toLocaleString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-textSecondary">Clics</p>
              <p className="font-mono font-bold text-textPrimary">
                {result.estimatedClicks.toLocaleString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-textSecondary">Conversions</p>
              <p className="font-mono font-bold text-textPrimary">
                {result.estimatedConversions.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
            <div>
              <p className="text-textSecondary">Displayed CPM</p>
              <CostDisplay
                amountDzd={result.displayedCpmDzd}
                amountUsd={result.displayedCpmUsd}
                decimalsDzd={2}
                decimalsUsd={4}
                compact
                className="font-bold"
              />
            </div>
            <div>
              <p className="text-textSecondary">Displayed CPC</p>
              <CostDisplay
                amountDzd={result.displayedCpcDzd}
                amountUsd={result.displayedCpcUsd}
                decimalsDzd={2}
                decimalsUsd={4}
                compact
                className="font-bold"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DiffCellProps {
  label: string;
  valueA: number;
  valueB: number;
  format: (v: number) => string;
  positiveDirection: 'up' | 'down';
}

function DiffCell({ label, valueA, valueB, format, positiveDirection }: DiffCellProps): JSX.Element {
  const diff = valueB - valueA;
  const isImprovement = positiveDirection === 'up' ? diff > 0 : diff < 0;
  const color = diff === 0 ? 'text-textSecondary' : isImprovement ? 'text-success' : 'text-error';
  const sign = diff > 0 ? '+' : '';

  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-textSecondary">{label}</p>
      <p className="font-mono text-sm">
        <span className="text-textSecondary">A: {format(valueA)}</span>
      </p>
      <p className="font-mono text-sm">
        <span>B: {format(valueB)}</span>
      </p>
      <p className={`font-mono text-xs font-bold flex items-center gap-1 ${color}`}>
        <ArrowRight className="h-3 w-3" />
        {sign}
        {format(diff)}
      </p>
    </div>
  );
}
