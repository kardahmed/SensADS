/**
 * pricing.ts — Source de vérité pour TOUT calcul financier devis/facture.
 *
 * Ordre canonique (immuable) :
 *   selling_price (override > tarif standard)
 *   × quantity
 *   - discount (en pourcentage)
 *   = subtotal_ht
 *   + vat (rate depuis app_settings ou client custom)
 *   = total_ttc
 *
 * RÈGLES NON-NÉGOCIABLES :
 * - `purchase_price > 0` (CHECK DB) — sinon ratio = 1 fallback
 * - `selling_price >= purchase_price` (warning UI, pas bloquant)
 * - `discount` entre 0 et 1 (pourcentage)
 * - `vat_rate` entre 0 et 1
 * - Tous les montants en DZD à la fin
 * - `exchange_rate_snapshot` figé au moment du calcul
 *
 * 100% testé.
 */

import type { CurrencyCode } from './constants';

// ============================================
// TYPES
// ============================================

export interface PricingLineInput {
  /** Tarif standard (purchase_price_usd, selling_price_usd) */
  standardPurchasePriceUsd: number;
  standardSellingPriceUsd: number;
  /** Override client (priorité sur standard si fourni) */
  customPurchasePriceUsd?: number | null;
  customSellingPriceUsd?: number | null;
  /** Quantité (par défaut 1) */
  quantity?: number;
}

export interface PricingInput {
  lines: PricingLineInput[];
  /** Devise source (USD par défaut puisque tarifs en USD) */
  sourceCurrency?: CurrencyCode;
  /** Taux de change vers DZD (figé via snapshot) */
  exchangeRateToDzd: number;
  /** Remise client (0 à 1, ex: 0.10 = 10%) */
  discountPercentage?: number;
  /** Taux de TVA (0 à 1, ex: 0.19 = 19%) */
  vatRate: number;
}

export interface PricingLineResult {
  effectivePurchasePriceUsd: number;
  effectiveSellingPriceUsd: number;
  marginPercentage: number;
  unitPriceDzd: number;
  quantity: number;
  totalDzd: number;
}

export interface PricingResult {
  lines: PricingLineResult[];
  subtotalDzd: number;
  discountPercentage: number;
  discountAmountDzd: number;
  subtotalAfterDiscountDzd: number;
  vatRate: number;
  vatAmountDzd: number;
  totalDzd: number;
}

// ============================================
// FONCTIONS PURES
// ============================================

/**
 * Détermine le prix effectif (override client OU tarif standard).
 */
export function getEffectivePrice(line: PricingLineInput): {
  purchasePriceUsd: number;
  sellingPriceUsd: number;
} {
  const purchasePriceUsd =
    line.customPurchasePriceUsd != null && line.customPurchasePriceUsd > 0
      ? line.customPurchasePriceUsd
      : line.standardPurchasePriceUsd;

  const sellingPriceUsd =
    line.customSellingPriceUsd != null && line.customSellingPriceUsd > 0
      ? line.customSellingPriceUsd
      : line.standardSellingPriceUsd;

  return { purchasePriceUsd, sellingPriceUsd };
}

/**
 * Calcule la marge en pourcentage.
 *
 * @example
 * computeMargin(15, 30) // 1.0 (100% de marge)
 * computeMargin(15, 22.5) // 0.5 (50%)
 */
export function computeMargin(purchasePrice: number, sellingPrice: number): number {
  if (purchasePrice <= 0) return 0;
  return (sellingPrice - purchasePrice) / purchasePrice;
}

/**
 * Calcule une ligne de devis/facture.
 */
export function computeLine(
  line: PricingLineInput,
  exchangeRateToDzd: number,
): PricingLineResult {
  const { purchasePriceUsd, sellingPriceUsd } = getEffectivePrice(line);
  const quantity = line.quantity ?? 1;
  const unitPriceDzd = sellingPriceUsd * exchangeRateToDzd;
  const totalDzd = unitPriceDzd * quantity;

  return {
    effectivePurchasePriceUsd: purchasePriceUsd,
    effectiveSellingPriceUsd: sellingPriceUsd,
    marginPercentage: computeMargin(purchasePriceUsd, sellingPriceUsd),
    unitPriceDzd,
    quantity,
    totalDzd,
  };
}

/**
 * Calcul complet d'un devis/facture (suit l'ordre canonique).
 *
 * @example
 * computePricing({
 *   lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30, quantity: 10 }],
 *   exchangeRateToDzd: 250,
 *   discountPercentage: 0.10,
 *   vatRate: 0.19,
 * })
 * // subtotal = 30 × 250 × 10 = 75 000
 * // discount = 75 000 × 0.10 = 7 500
 * // afterDiscount = 67 500
 * // vat = 67 500 × 0.19 = 12 825
 * // total = 80 325
 */
export function computePricing(input: PricingInput): PricingResult {
  const { lines, exchangeRateToDzd, discountPercentage = 0, vatRate } = input;

  // 1. Compute each line in DZD
  const computedLines = lines.map((line) => computeLine(line, exchangeRateToDzd));

  // 2. Subtotal HT (avant remise et TVA)
  const subtotalDzd = roundCents(computedLines.reduce((sum, l) => sum + l.totalDzd, 0));

  // 3. Remise
  const safeDiscount = clamp(discountPercentage, 0, 1);
  const discountAmountDzd = roundCents(subtotalDzd * safeDiscount);
  const subtotalAfterDiscountDzd = roundCents(subtotalDzd - discountAmountDzd);

  // 4. TVA
  const safeVatRate = clamp(vatRate, 0, 1);
  const vatAmountDzd = roundCents(subtotalAfterDiscountDzd * safeVatRate);

  // 5. Total TTC
  const totalDzd = roundCents(subtotalAfterDiscountDzd + vatAmountDzd);

  return {
    lines: computedLines,
    subtotalDzd,
    discountPercentage: safeDiscount,
    discountAmountDzd,
    subtotalAfterDiscountDzd,
    vatRate: safeVatRate,
    vatAmountDzd,
    totalDzd,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Arrondit à 2 décimales (centimes DZD).
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Clamp une valeur entre min et max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Vérifie qu'une marge est saine (>0%).
 */
export function isHealthyMargin(margin: number): boolean {
  return margin > 0;
}

/**
 * Catégorise la marge pour affichage badges UI.
 */
export function categorizeMargin(margin: number): 'high' | 'medium' | 'low' | 'negative' {
  if (margin < 0) return 'negative';
  if (margin >= 1) return 'high'; // >= 100%
  if (margin >= 0.5) return 'medium'; // 50-100%
  return 'low'; // < 50%
}

// =================================================================
// MODÈLE FINANCIER V2 — BDC-LOCKED + MULTI-CURRENCY
// =================================================================
//
// Principe :
//   1. Client dépose X DZD → BDC créé avec config figée (parallel, fees, divisor)
//   2. markup_total = divisor / (1 - fees)  ← formule exacte (pas d'arrondi)
//   3. real_spend_usd = deposit_dzd × (1 - fees) / parallel / divisor
//   4. Pour chaque coût réel sur compte pub (devise X) :
//        displayed_dzd = real_X × bank_rate(X→USD) × markup × parallel
//   5. Total displayed_dzd ≈ deposit_dzd à l'unité près (cohérence parfaite)
//
// Garanties :
//   - displayed_DZD = deposit_DZD au cumul de la campagne
//   - Aucune modification rétroactive (snapshots figés)
//   - Cohérence cross-métriques (CPM × impressions = displayed_spend)
// =================================================================

/**
 * Configuration financière figée d'un BDC.
 * - `parallelRate` : DZD/USD du marché parallèle (verrouillé à la création du BDC)
 * - `feesPct`     : frais transaction (verrouillé)
 * - `divisor`     : modifiable à tout moment avec note (impact marge agence)
 */
export interface BdcFinancialConfig {
  parallelRate: number;
  feesPct: number;
  divisor: number;
}

/**
 * Coût réel sur le compte pub (avant markup), à convertir vers DZD client.
 */
export interface RealCostInput {
  /** Montant brut Meta API dans la devise du compte (ex 15 000 INR) */
  amountAccountCurrency: number;
  /** Devise du compte pub (USD/INR/EUR/AED/...) */
  accountCurrency: string;
  /** Taux bank devise → USD figé pour la date du KPI (ex 0.011 pour INR) */
  bankRateToUsd: number;
}

/**
 * Sortie du calcul multi-devise complet.
 */
export interface DisplayedCostResult {
  realUsd: number;
  realDzdAtParallel: number;
  displayedUsd: number;
  displayedDzd: number;
  totalMarkup: number;
}

/**
 * Markup total = divisor / (1 − fees).
 *
 * Cette formule garantit que :
 *   real_spend × markup × parallel = deposit
 * (à l'unité près, validé par tests unitaires).
 *
 * @example
 *   totalMarkup({ parallelRate: 260, feesPct: 0.06, divisor: 2.6 })
 *   // → 2.7659574468085... (= 2.6 / 0.94)
 */
export function totalMarkup(config: BdcFinancialConfig): number {
  if (config.feesPct >= 1 || config.feesPct < 0) {
    throw new Error('feesPct must be in [0, 1)');
  }
  if (config.divisor < 1) {
    throw new Error('divisor must be >= 1');
  }
  return config.divisor / (1 - config.feesPct);
}

/**
 * Calcule le budget USD réellement dépensable sur Meta à partir d'un dépôt DZD.
 *
 * Chaîne :
 *   deposit_dzd × (1 - fees) / parallel_rate / divisor = executable_usd
 *
 * @example
 *   executableBudgetUsd(1_200_000, { parallelRate: 260, feesPct: 0.06, divisor: 2.6 })
 *   // → 1668.6390... USD
 */
export function executableBudgetUsd(depositDzd: number, config: BdcFinancialConfig): number {
  if (depositDzd < 0) throw new Error('depositDzd must be >= 0');
  return (depositDzd * (1 - config.feesPct)) / config.parallelRate / config.divisor;
}

/**
 * Marge cash en DZD pour un dépôt donné.
 * Formule : dépôt − (real_spend_usd × parallel_rate)
 *
 * @example
 *   cashMarginDzd(1_200_000, { parallelRate: 260, feesPct: 0.06, divisor: 2.6 })
 *   // → 766_153.85 DZD (≈ 63.85% du dépôt)
 */
export function cashMarginDzd(depositDzd: number, config: BdcFinancialConfig): number {
  const executableUsd = executableBudgetUsd(depositDzd, config);
  const realSpendDzd = executableUsd * config.parallelRate;
  return roundCents(depositDzd - realSpendDzd);
}

/**
 * Convertit un coût réel USD vers le coût displayed (USD + DZD) pour le client.
 *
 * Chaîne :
 *   displayed_usd = real_usd × markup
 *   displayed_dzd = displayed_usd × parallel_rate
 */
export function realUsdToDisplayed(
  realUsd: number,
  config: BdcFinancialConfig,
): { displayedUsd: number; displayedDzd: number } {
  const markup = totalMarkup(config);
  const displayedUsd = realUsd * markup;
  return {
    displayedUsd,
    displayedDzd: displayedUsd * config.parallelRate,
  };
}

/**
 * Conversion complète multi-devises : compte pub → USD → markup → DZD.
 *
 * Chaîne complète :
 *   1. amount_account_currency × bank_rate = real_usd
 *   2. real_usd × markup = displayed_usd
 *   3. displayed_usd × parallel_rate = displayed_dzd
 *
 * @example
 *   // Coût 0,20 INR sur compte INR avec config Algérie
 *   realCostToDisplayed(
 *     { amountAccountCurrency: 0.20, accountCurrency: 'INR', bankRateToUsd: 0.011 },
 *     { parallelRate: 260, feesPct: 0.06, divisor: 2.6 }
 *   )
 *   // → { realUsd: 0.0022, displayedUsd: 0.00606, displayedDzd: 1.576, ... }
 */
export function realCostToDisplayed(
  input: RealCostInput,
  config: BdcFinancialConfig,
): DisplayedCostResult {
  if (input.amountAccountCurrency < 0) {
    throw new Error('amountAccountCurrency must be >= 0');
  }
  if (input.bankRateToUsd <= 0) {
    throw new Error('bankRateToUsd must be > 0');
  }

  const markup = totalMarkup(config);
  const realUsd = input.accountCurrency === 'USD'
    ? input.amountAccountCurrency
    : input.amountAccountCurrency * input.bankRateToUsd;

  const realDzdAtParallel = realUsd * config.parallelRate;
  const displayedUsd = realUsd * markup;
  const displayedDzd = displayedUsd * config.parallelRate;

  return {
    realUsd,
    realDzdAtParallel: roundCents(realDzdAtParallel),
    displayedUsd,
    displayedDzd: roundCents(displayedDzd),
    totalMarkup: markup,
  };
}

/**
 * Données réelles d'un KPI quotidien (avant markup).
 */
export interface RealKpiInput {
  spendAccountCurrency: number;
  accountCurrency: string;
  bankRateToUsd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  videoThruplays?: number;
  reach?: number;
  conversionValue?: number;
}

/**
 * KPIs vue client (toutes les métriques de coût dérivées du markup).
 */
export interface DerivedClientKpis {
  // Coûts (markup appliqué)
  spendUsd: number;
  spendDzd: number;
  cpmUsd: number;
  cpmDzd: number;
  cpcUsd: number;
  cpcDzd: number;
  cpaUsd: number;
  cpaDzd: number;
  costPerThruplayUsd: number;
  costPerThruplayDzd: number;
  // Volumes (réels, jamais transformés)
  impressions: number;
  clicks: number;
  conversions: number;
  videoThruplays: number;
  reach: number;
  // Ratios (réels)
  ctr: number;
  cvr: number;
  // ROAS recalculé avec displayed_spend (revenue / displayed_spend)
  roas: number;
  // Métadonnées
  totalMarkup: number;
}

/**
 * Dérive TOUTES les métriques client à partir des KPIs réels Meta + config BDC.
 *
 * Garantie de cohérence :
 *   - Toutes les métriques de coût utilisent le MÊME markup
 *   - displayed_cost × volume = displayed_spend (cohérence cross-métriques)
 *   - Les ratios (CTR/CVR) restent réels (pas de markup appliqué)
 */
export function deriveClientKpisFromReal(
  real: RealKpiInput,
  config: BdcFinancialConfig,
): DerivedClientKpis {
  const cost = realCostToDisplayed(
    {
      amountAccountCurrency: real.spendAccountCurrency,
      accountCurrency: real.accountCurrency,
      bankRateToUsd: real.bankRateToUsd,
    },
    config,
  );

  const impressions = Math.max(0, real.impressions);
  const clicks = Math.max(0, real.clicks);
  const conversions = Math.max(0, real.conversions);
  const thruplays = Math.max(0, real.videoThruplays ?? 0);
  const reach = Math.max(0, real.reach ?? 0);

  // Coûts dérivés depuis displayed_spend
  const cpmUsd = impressions > 0 ? (cost.displayedUsd / impressions) * 1000 : 0;
  const cpcUsd = clicks > 0 ? cost.displayedUsd / clicks : 0;
  const cpaUsd = conversions > 0 ? cost.displayedUsd / conversions : 0;
  const cptp = thruplays > 0 ? cost.displayedUsd / thruplays : 0;

  // Ratios réels
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cvr = clicks > 0 ? conversions / clicks : 0;

  // ROAS calculé sur displayed_spend (vue client)
  const revenue = real.conversionValue ?? 0;
  const roas = cost.displayedUsd > 0 ? revenue / cost.displayedUsd : 0;

  return {
    spendUsd: cost.displayedUsd,
    spendDzd: cost.displayedDzd,
    cpmUsd,
    cpmDzd: cpmUsd * config.parallelRate,
    cpcUsd,
    cpcDzd: cpcUsd * config.parallelRate,
    cpaUsd,
    cpaDzd: cpaUsd * config.parallelRate,
    costPerThruplayUsd: cptp,
    costPerThruplayDzd: cptp * config.parallelRate,
    impressions,
    clicks,
    conversions,
    videoThruplays: thruplays,
    reach,
    ctr,
    cvr,
    roas,
    totalMarkup: cost.totalMarkup,
  };
}

/**
 * Vue agence : breakdown des marges pour un KPI.
 * Réservé super_admin/admin/TM (jamais affiché client).
 */
export interface AgencyMarginBreakdown {
  realSpendAccountCurrency: number;
  realSpendUsd: number;
  realSpendDzdAtParallel: number;
  displayedSpendUsd: number;
  displayedSpendDzd: number;
  marginCashDzd: number;
  marginPct: number;
  totalMarkup: number;
}

/**
 * Calcule le breakdown agence pour un dépôt + config + real spend.
 */
export function computeAgencyMarginBreakdown(
  depositDzd: number,
  realCost: RealCostInput,
  config: BdcFinancialConfig,
): AgencyMarginBreakdown {
  const cost = realCostToDisplayed(realCost, config);
  const marginCashDzd = roundCents(depositDzd - cost.realDzdAtParallel);
  const marginPct = depositDzd > 0 ? marginCashDzd / depositDzd : 0;

  return {
    realSpendAccountCurrency: realCost.amountAccountCurrency,
    realSpendUsd: cost.realUsd,
    realSpendDzdAtParallel: cost.realDzdAtParallel,
    displayedSpendUsd: cost.displayedUsd,
    displayedSpendDzd: cost.displayedDzd,
    marginCashDzd,
    marginPct,
    totalMarkup: cost.totalMarkup,
  };
}
