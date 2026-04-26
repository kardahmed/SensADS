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
