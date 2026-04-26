/**
 * currency.ts — Conversion de devises avec snapshot historique.
 *
 * RÈGLES :
 * - Tout montant en devise source DOIT être converti en DZD au moment de la création
 *   de l'entité (KPI, devis, facture).
 * - Le `exchange_rate_snapshot` est figé à ce moment et JAMAIS recalculé.
 * - Garde-fou division par zéro : si `purchase_price <= 0` → ratio = 1.
 * - Lookup historique se fait via `getHistoricalRate(orgId, currency, date)` côté serveur uniquement.
 *
 * 100% testé.
 */

import type { CurrencyCode } from './constants';

// ============================================
// CONVERSION
// ============================================

export interface ConvertOptions {
  amount: number;
  exchangeRate: number;
  sellingPrice?: number;
  purchasePrice?: number;
}

/**
 * Convertit un montant source vers DZD avec ratio de marge tarif.
 *
 * Formule : `amount * exchangeRate * (sellingPrice / purchasePrice)`
 *
 * @example
 * // Client paie 100 USD au taux 250 DZD/USD, avec une marge tarif de 200%
 * convertToDzd({
 *   amount: 100,
 *   exchangeRate: 250,
 *   sellingPrice: 30,
 *   purchasePrice: 15,
 * }) // = 100 * 250 * (30/15) = 50000 DZD
 */
export function convertToDzd(options: ConvertOptions): number {
  const { amount, exchangeRate, sellingPrice, purchasePrice } = options;

  if (amount === 0 || exchangeRate <= 0) return 0;

  // Garde-fou division par zéro
  let ratio = 1;
  if (sellingPrice !== undefined && purchasePrice !== undefined) {
    ratio = purchasePrice > 0 ? sellingPrice / purchasePrice : 1;
  }

  return amount * exchangeRate * ratio;
}

/**
 * Conversion simple devise → devise sans ratio de marge.
 * Utile pour les affichages (ex: "300 USD ≈ 75 000 DZD" en preview).
 *
 * @example
 * convertCurrency({ amount: 100, fromRate: 1, toRate: 250 }) // 25000 (USD → DZD)
 */
export function convertCurrency(options: {
  amount: number;
  fromRate: number;
  toRate: number;
}): number {
  const { amount, fromRate, toRate } = options;
  if (fromRate <= 0) return 0;
  return (amount / fromRate) * toRate;
}

// ============================================
// SNAPSHOT
// ============================================

/**
 * Crée un snapshot des taux de change pour figer la conversion future.
 * À stocker dans `quote.exchange_rate_snapshot` ou `kpi.exchange_rate_snapshot`.
 */
export function createExchangeRateSnapshot(
  rates: Partial<Record<CurrencyCode, number>>,
): Record<string, number> {
  // Filter out undefined and ensure DZD = 1 (référence)
  const snapshot: Record<string, number> = { DZD: 1 };
  for (const [currency, rate] of Object.entries(rates)) {
    if (typeof rate === 'number' && rate > 0) {
      snapshot[currency] = rate;
    }
  }
  return snapshot;
}

/**
 * Lit le taux d'une devise depuis un snapshot.
 * Si manquant → fallback à 1 (équivalent DZD direct).
 */
export function getRateFromSnapshot(
  snapshot: Record<string, number> | null | undefined,
  currency: CurrencyCode,
): number {
  if (!snapshot) return 1;
  if (currency === 'DZD') return 1;
  const rate = snapshot[currency];
  return typeof rate === 'number' && rate > 0 ? rate : 1;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Vérifie qu'un taux de change est valide (positif, fini, raisonnable).
 */
export function isValidExchangeRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate < 1_000_000;
}
