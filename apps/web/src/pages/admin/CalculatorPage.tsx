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
import { useAgencyAdAccounts } from '@/hooks/useAgencyAdAccounts';

/**
 * Bank rates par défaut (utilisés si pas de bank rate récent en DB pour la devise).
 * Tu peux les surcharger via la page /admin/exchange-rates.
 */
const DEFAULT_BANK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.26,
  INR: 0.011,
  AED: 0.272,
  MAD: 0.099,
  TND: 0.32,
  SAR: 0.266,
  QAR: 0.275,
  CAD: 0.73,
  CHF: 1.12,
};

interface AccountForCalc {
  id: string;
  name: string;
  currency: string;
  bankRateToUsd: number;
  observedCpm: number;
  notes?: string;
}

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

const INITIAL_SCENARIO: ScenarioInput = {
  depositDzd: 1_200_000,
  parallelRate: 260,
  feesPct: 0.06,
  divisor: 2.6,
  accountId: '',
  observedCpmOverride: null,
  estimatedCtr: 0.015,
  estimatedCvr: 0.005,
};

const EMPTY_SCENARIO: ScenarioResult = {
  config: { parallelRate: 0, feesPct: 0, divisor: 1 },
  markup: 0,
  realUsd: 0,
  realDzdParallel: 0,
  realInAccountCurrency: 0,
  marginDzd: 0,
  marginPct: 0,
  estimatedImpressions: 0,
  estimatedClicks: 0,
  estimatedConversions: 0,
  displayedSpendDzd: 0,
  displayedSpendUsd: 0,
  displayedCpmDzd: 0,
  displayedCpmUsd: 0,
  displayedCpcDzd: 0,
  displayedCpcUsd: 0,
};

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

function computeScenario(input: ScenarioInput, accounts: AccountForCalc[]): ScenarioResult {
  const config: BdcFinancialConfig = {
    parallelRate: input.parallelRate,
    feesPct: input.feesPct,
    divisor: input.divisor,
  };

  const account = accounts.find((a) => a.id === input.accountId) ?? accounts[0];
  if (!account) {
    return EMPTY_SCENARIO;
  }
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

  const accountsQ = useAgencyAdAccounts({ activeOnly: true });

  const accounts: AccountForCalc[] = useMemo(() => {
    return (accountsQ.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.accountCurrency,
      bankRateToUsd: DEFAULT_BANK_RATES[a.accountCurrency] ?? 1,
      observedCpm: a.observedCpmAccountCurrency,
      notes: a.notes ?? undefined,
    }));
  }, [accountsQ.data]);

  const initialScenario: ScenarioInput = useMemo(() => {
    const inrAccount = accounts.find((a) => a.currency === 'INR');
    return {
      ...INITIAL_SCENARIO,
      accountId: inrAccount?.id ?? accounts[0]?.id ?? '',
    };
  }, [accounts]);

  const [scenarioA, setScenarioA] = useState<ScenarioInput>(initialScenario);
  const [scenarioB, setScenarioB] = useState<ScenarioInput>({
    ...initialScenario,
    parallelRate: 280,
    divisor: 3.0,
    feesPct: 0.07,
  });
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Si les comptes arrivent après mount, on remplit l'accountId du scénario A
  if (!scenarioA.accountId && accounts.length > 0) {
    setScenarioA(initialScenario);
    setScenarioB({ ...initialScenario, parallelRate: 280, divisor: 3.0, feesPct: 0.07 });
  }

  const resultA = useMemo(() => computeScenario(scenarioA, accounts), [scenarioA, accounts]);
  const resultB = useMemo(() => computeScenario(scenarioB, accounts), [scenarioB, accounts]);

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

      {accountsQ.isLoading && (
        <Card><CardContent className="p-6 text-center text-textSecondary">Chargement des comptes pub agence...</CardContent></Card>
      )}

      {!accountsQ.isLoading && accounts.length === 0 && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="font-medium text-warning">Aucun compte pub agence configuré.</p>
            <p className="text-sm text-textSecondary">
              Va dans <span className="font-mono">/admin/ad-accounts</span> pour ajouter tes comptes USD/INR/EUR/AED…
              Le calculator a besoin d'au moins un compte actif pour estimer les impressions.
            </p>
          </CardContent>
        </Card>
      )}

      {!accountsQ.isLoading && accounts.length > 0 && (
        <div className={`grid gap-6 ${compareEnabled ? 'lg:grid-cols-2' : ''}`}>
          <ScenarioCard
            title={compareEnabled ? 'Scénario A' : 'Simulation'}
            input={scenarioA}
            result={resultA}
            onChange={updateA}
            accounts={accounts}
            accent="text-accent"
          />
          {compareEnabled && (
            <ScenarioCard
              title="Scénario B"
              input={scenarioB}
              result={resultB}
              onChange={updateB}
              accounts={accounts}
              accent="text-violet-400"
            />
          )}
        </div>
      )}

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
  accounts: AccountForCalc[];
  accent: string;
}

function ScenarioCard({ title, input, result, onChange, accounts, accent }: ScenarioCardProps): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const currentAccount = accounts.find((a) => a.id === input.accountId) ?? accounts[0];

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
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency}) — CPM réel ≈ {a.observedCpm} {a.currency}
                </option>
              ))}
            </Select>
            {currentAccount && (
              <p className="text-xs text-textSecondary">
                Devise auto : <span className="font-mono">{currentAccount.currency}</span>
                {' · '}
                Bank rate → USD : <span className="font-mono">{currentAccount.bankRateToUsd}</span>
                {currentAccount.notes && <span className="block italic">{currentAccount.notes}</span>}
              </p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="cpm">
              Real CPM observé ({currentAccount?.currency ?? 'USD'})
              <span className="ml-1 text-xs font-normal text-textSecondary">— override optionnel</span>
            </Label>
            <Input
              id="cpm"
              type="number"
              step="0.01"
              min="0.001"
              placeholder={String(currentAccount?.observedCpm ?? 0)}
              value={input.observedCpmOverride ?? currentAccount?.observedCpm ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                const def = currentAccount?.observedCpm ?? 0;
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
              <p className="text-xs text-textSecondary">Injecté ({(currentAccount?.currency ?? 'USD')})</p>
              <p className="font-mono text-textPrimary">
                {result.realInAccountCurrency.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {(currentAccount?.currency ?? 'USD')}
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
