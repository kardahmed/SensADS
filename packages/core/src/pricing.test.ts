import { describe, expect, it } from 'vitest';
import {
  categorizeMargin,
  clamp,
  computeLine,
  computeMargin,
  computePricing,
  getEffectivePrice,
  isHealthyMargin,
  roundCents,
} from './pricing';

describe('getEffectivePrice', () => {
  it('utilise tarif standard si pas d override', () => {
    const result = getEffectivePrice({
      standardPurchasePriceUsd: 15,
      standardSellingPriceUsd: 30,
    });
    expect(result).toEqual({ purchasePriceUsd: 15, sellingPriceUsd: 30 });
  });

  it('utilise override client si présent', () => {
    const result = getEffectivePrice({
      standardPurchasePriceUsd: 15,
      standardSellingPriceUsd: 30,
      customPurchasePriceUsd: 12,
      customSellingPriceUsd: 25,
    });
    expect(result).toEqual({ purchasePriceUsd: 12, sellingPriceUsd: 25 });
  });

  it('ignore override si <= 0 (sécurité division par zéro)', () => {
    const result = getEffectivePrice({
      standardPurchasePriceUsd: 15,
      standardSellingPriceUsd: 30,
      customPurchasePriceUsd: 0,
      customSellingPriceUsd: -5,
    });
    expect(result).toEqual({ purchasePriceUsd: 15, sellingPriceUsd: 30 });
  });

  it('ignore override null', () => {
    const result = getEffectivePrice({
      standardPurchasePriceUsd: 15,
      standardSellingPriceUsd: 30,
      customPurchasePriceUsd: null,
      customSellingPriceUsd: null,
    });
    expect(result).toEqual({ purchasePriceUsd: 15, sellingPriceUsd: 30 });
  });

  it('peut override seulement le selling price', () => {
    const result = getEffectivePrice({
      standardPurchasePriceUsd: 15,
      standardSellingPriceUsd: 30,
      customSellingPriceUsd: 25,
    });
    expect(result).toEqual({ purchasePriceUsd: 15, sellingPriceUsd: 25 });
  });
});

describe('computeMargin', () => {
  it('marge 100%', () => {
    expect(computeMargin(15, 30)).toBe(1);
  });

  it('marge 50%', () => {
    expect(computeMargin(20, 30)).toBe(0.5);
  });

  it('marge négative (vente à perte)', () => {
    expect(computeMargin(30, 20)).toBeCloseTo(-0.333, 2);
  });

  it('purchase = 0 → 0 (pas NaN)', () => {
    expect(computeMargin(0, 30)).toBe(0);
  });

  it('purchase négatif → 0', () => {
    expect(computeMargin(-5, 30)).toBe(0);
  });
});

describe('computeLine', () => {
  it('calcule total DZD avec quantité', () => {
    const result = computeLine(
      { standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30, quantity: 5 },
      250,
    );
    expect(result.unitPriceDzd).toBe(7500); // 30 × 250
    expect(result.totalDzd).toBe(37500); // 7500 × 5
    expect(result.marginPercentage).toBe(1);
  });

  it('quantity par défaut = 1', () => {
    const result = computeLine(
      { standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 },
      250,
    );
    expect(result.quantity).toBe(1);
    expect(result.totalDzd).toBe(7500);
  });
});

describe('computePricing', () => {
  it('calcul complet ordre canonique', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30, quantity: 10 }],
      exchangeRateToDzd: 250,
      discountPercentage: 0.1,
      vatRate: 0.19,
    });

    // subtotal = 30 × 250 × 10 = 75 000
    expect(result.subtotalDzd).toBe(75000);
    // discount = 75 000 × 0.10 = 7 500
    expect(result.discountAmountDzd).toBe(7500);
    expect(result.subtotalAfterDiscountDzd).toBe(67500);
    // vat = 67 500 × 0.19 = 12 825
    expect(result.vatAmountDzd).toBe(12825);
    // total TTC = 67 500 + 12 825 = 80 325
    expect(result.totalDzd).toBe(80325);
  });

  it('plusieurs lignes', () => {
    const result = computePricing({
      lines: [
        { standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30, quantity: 1 },
        { standardPurchasePriceUsd: 20, standardSellingPriceUsd: 40, quantity: 2 },
      ],
      exchangeRateToDzd: 250,
      vatRate: 0.19,
    });
    // L1: 30 × 250 = 7500
    // L2: 40 × 250 × 2 = 20000
    expect(result.subtotalDzd).toBe(27500);
    expect(result.totalDzd).toBe(roundCents(27500 * 1.19));
  });

  it('sans remise', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 }],
      exchangeRateToDzd: 250,
      vatRate: 0.19,
    });
    expect(result.discountAmountDzd).toBe(0);
    expect(result.discountPercentage).toBe(0);
  });

  it('TVA 0% (export EU avec VAT-ID valide)', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 }],
      exchangeRateToDzd: 250,
      vatRate: 0,
    });
    expect(result.vatAmountDzd).toBe(0);
    expect(result.totalDzd).toBe(7500);
  });

  it('clamp discount > 1', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 }],
      exchangeRateToDzd: 250,
      discountPercentage: 1.5, // 150% absurde
      vatRate: 0.19,
    });
    expect(result.discountPercentage).toBe(1); // clampé
  });

  it('clamp discount < 0', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 }],
      exchangeRateToDzd: 250,
      discountPercentage: -0.1,
      vatRate: 0.19,
    });
    expect(result.discountPercentage).toBe(0);
  });

  it('override client appliqué', () => {
    const result = computePricing({
      lines: [
        {
          standardPurchasePriceUsd: 15,
          standardSellingPriceUsd: 30,
          customSellingPriceUsd: 25, // override
        },
      ],
      exchangeRateToDzd: 250,
      vatRate: 0.19,
    });
    // 25 × 250 = 6250 (au lieu de 7500)
    expect(result.subtotalDzd).toBe(6250);
  });

  it('lignes vides → 0', () => {
    const result = computePricing({
      lines: [],
      exchangeRateToDzd: 250,
      vatRate: 0.19,
    });
    expect(result.subtotalDzd).toBe(0);
    expect(result.totalDzd).toBe(0);
  });

  it('arrondis cohérents (centimes)', () => {
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 0.123, standardSellingPriceUsd: 0.789 }],
      exchangeRateToDzd: 250.45,
      vatRate: 0.19,
    });
    // Vérifier que tout est arrondi à 2 décimales
    expect(result.subtotalDzd.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(result.totalDzd.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });

  it('exchange rate négatif → calcul cassé mais ne crash pas', () => {
    // Note : la validation se fait via isValidExchangeRate avant l'appel
    const result = computePricing({
      lines: [{ standardPurchasePriceUsd: 15, standardSellingPriceUsd: 30 }],
      exchangeRateToDzd: -250,
      vatRate: 0.19,
    });
    expect(result.totalDzd).toBeLessThan(0); // côté caller doit valider avant
  });
});

describe('roundCents', () => {
  it('arrondit à 2 décimales', () => {
    expect(roundCents(1.234)).toBe(1.23);
    expect(roundCents(1.235)).toBe(1.24);
    expect(roundCents(1.999)).toBe(2);
  });
});

describe('clamp', () => {
  it('clamp dans bornes', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
  });
});

describe('isHealthyMargin', () => {
  it('positif = sain', () => {
    expect(isHealthyMargin(0.5)).toBe(true);
  });
  it('zéro = pas sain', () => {
    expect(isHealthyMargin(0)).toBe(false);
  });
  it('négatif = pas sain', () => {
    expect(isHealthyMargin(-0.1)).toBe(false);
  });
});

describe('categorizeMargin', () => {
  it('high >= 100%', () => {
    expect(categorizeMargin(1)).toBe('high');
    expect(categorizeMargin(2)).toBe('high');
  });
  it('medium 50-100%', () => {
    expect(categorizeMargin(0.5)).toBe('medium');
    expect(categorizeMargin(0.99)).toBe('medium');
  });
  it('low < 50%', () => {
    expect(categorizeMargin(0.49)).toBe('low');
    expect(categorizeMargin(0.01)).toBe('low');
  });
  it('negative', () => {
    expect(categorizeMargin(-0.1)).toBe('negative');
  });
});
