import { describe, expect, it } from 'vitest';
import {
  cashMarginDzd,
  categorizeMargin,
  clamp,
  computeAgencyMarginBreakdown,
  computeLine,
  computeMargin,
  computePricing,
  deriveClientKpisFromReal,
  executableBudgetUsd,
  getEffectivePrice,
  isHealthyMargin,
  realCostToDisplayed,
  realUsdToDisplayed,
  roundCents,
  totalMarkup,
  type BdcFinancialConfig,
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

// =================================================================
// MODÈLE FINANCIER V2 — BDC-LOCKED + MULTI-CURRENCY
// =================================================================

const STANDARD_CONFIG: BdcFinancialConfig = {
  parallelRate: 260,
  feesPct: 0.06,
  divisor: 2.6,
};

describe('totalMarkup', () => {
  it('formule exacte : divisor / (1 - fees)', () => {
    expect(totalMarkup(STANDARD_CONFIG)).toBeCloseTo(2.6 / 0.94, 10);
    expect(totalMarkup(STANDARD_CONFIG)).toBeCloseTo(2.7659574468085, 10);
  });

  it('fees = 0 → markup = divisor', () => {
    expect(totalMarkup({ parallelRate: 260, feesPct: 0, divisor: 2.6 })).toBe(2.6);
  });

  it('divisor = 1 → markup = 1 / (1 - fees)', () => {
    expect(totalMarkup({ parallelRate: 260, feesPct: 0.06, divisor: 1 })).toBeCloseTo(1.063829787, 8);
  });

  it('rejette fees >= 1', () => {
    expect(() => totalMarkup({ parallelRate: 260, feesPct: 1, divisor: 2.6 })).toThrow();
    expect(() => totalMarkup({ parallelRate: 260, feesPct: 1.5, divisor: 2.6 })).toThrow();
  });

  it('rejette fees négatifs', () => {
    expect(() => totalMarkup({ parallelRate: 260, feesPct: -0.01, divisor: 2.6 })).toThrow();
  });

  it('rejette divisor < 1', () => {
    expect(() => totalMarkup({ parallelRate: 260, feesPct: 0.06, divisor: 0.5 })).toThrow();
  });
});

describe('executableBudgetUsd — exemple 1 200 000 DZD', () => {
  it('1 200 000 DZD → ~1 668,64 USD réel à dépenser', () => {
    const result = executableBudgetUsd(1_200_000, STANDARD_CONFIG);
    // 1 200 000 × 0.94 / 260 / 2.6 = 1668.6390532544376
    expect(result).toBeCloseTo(1668.6390532544376, 6);
  });

  it('100 000 DZD → ~139,05 USD réel', () => {
    const result = executableBudgetUsd(100_000, STANDARD_CONFIG);
    // 100 000 × 0.94 / 260 / 2.6 = 139.0532544378698
    expect(result).toBeCloseTo(139.0532544378698, 6);
  });

  it('dépôt 0 → executable 0', () => {
    expect(executableBudgetUsd(0, STANDARD_CONFIG)).toBe(0);
  });

  it('rejette dépôt négatif', () => {
    expect(() => executableBudgetUsd(-1000, STANDARD_CONFIG)).toThrow();
  });
});

describe('cashMarginDzd — exemple 1 200 000 DZD', () => {
  it('1 200 000 DZD → marge 766 153,85 DZD (63,85%)', () => {
    const margin = cashMarginDzd(1_200_000, STANDARD_CONFIG);
    expect(margin).toBeCloseTo(766_153.85, 2);
    expect(margin / 1_200_000).toBeCloseTo(0.6385, 4);
  });

  it('100 000 DZD → marge 63 846,15 DZD (63,85%)', () => {
    const margin = cashMarginDzd(100_000, STANDARD_CONFIG);
    expect(margin).toBeCloseTo(63_846.15, 2);
  });
});

describe('realUsdToDisplayed', () => {
  it('1 USD → 2,766 USD displayed → 719,15 DZD', () => {
    const result = realUsdToDisplayed(1, STANDARD_CONFIG);
    expect(result.displayedUsd).toBeCloseTo(2.7659574468, 8);
    expect(result.displayedDzd).toBeCloseTo(719.1489362, 6);
  });

  it('cohérence : real_executable × markup × parallel ≈ deposit', () => {
    // 1 668,6390 USD × 2,76596 × 260 ≈ 1 200 000 DZD
    const deposit = 1_200_000;
    const real = executableBudgetUsd(deposit, STANDARD_CONFIG);
    const result = realUsdToDisplayed(real, STANDARD_CONFIG);
    expect(result.displayedDzd).toBeCloseTo(deposit, 0); // ±1 DZD précision
  });
});

describe('realCostToDisplayed — exemple INR 0,20 INR par clic', () => {
  it('0,20 INR × 0,011 × 2,76596 × 260 (chiffres exacts)', () => {
    const result = realCostToDisplayed(
      { amountAccountCurrency: 0.20, accountCurrency: 'INR', bankRateToUsd: 0.011 },
      STANDARD_CONFIG,
    );
    // 0.20 × 0.011 = 0.0022 USD
    expect(result.realUsd).toBeCloseTo(0.0022, 6);
    // 0.0022 × (2.6/0.94) = 0.00608510638...
    expect(result.displayedUsd).toBeCloseTo(0.0060851063829787, 8);
    // 0.00608510638 × 260 = 1.58213276...
    expect(result.displayedDzd).toBeCloseTo(1.58, 2);
    expect(result.totalMarkup).toBeCloseTo(2.7659574468085, 10);
  });

  it('USD → pas de conversion bank (rate ignoré)', () => {
    const result = realCostToDisplayed(
      { amountAccountCurrency: 1, accountCurrency: 'USD', bankRateToUsd: 999 }, // bankRate ignoré
      STANDARD_CONFIG,
    );
    expect(result.realUsd).toBe(1);
    expect(result.displayedUsd).toBeCloseTo(2.7659574468, 8);
  });

  it('EUR → conversion via bankRate', () => {
    const result = realCostToDisplayed(
      { amountAccountCurrency: 1, accountCurrency: 'EUR', bankRateToUsd: 1.08 },
      STANDARD_CONFIG,
    );
    expect(result.realUsd).toBeCloseTo(1.08, 4);
    expect(result.displayedUsd).toBeCloseTo(1.08 * 2.7659574468, 6);
  });

  it('rejette amount négatif', () => {
    expect(() =>
      realCostToDisplayed(
        { amountAccountCurrency: -1, accountCurrency: 'INR', bankRateToUsd: 0.011 },
        STANDARD_CONFIG,
      ),
    ).toThrow();
  });

  it('rejette bankRate <= 0', () => {
    expect(() =>
      realCostToDisplayed(
        { amountAccountCurrency: 1, accountCurrency: 'INR', bankRateToUsd: 0 },
        STANDARD_CONFIG,
      ),
    ).toThrow();
  });
});

describe('deriveClientKpisFromReal — campagne complète INR', () => {
  // Setup : campagne 1,2M DZD, compte INR, real CPM = 16 INR ≈ 0,176 USD
  // Real spend = 1 668,6390 USD = 151 694,45 INR
  // À CTR 1,5% et CVR 0,5% : impressions ≈ 9 481 000, clicks ≈ 142 213, conversions ≈ 711

  const realSpendInr = 151_694.45;
  const impressions = 9_481_000;
  const clicks = 142_213;
  const conversions = 711;
  const thruplays = 1_422_136;

  it('cumul DZD ≈ dépôt 1 200 000 (cohérence campagne complète)', () => {
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: realSpendInr,
        accountCurrency: 'INR',
        bankRateToUsd: 0.011,
        impressions,
        clicks,
        conversions,
        videoThruplays: thruplays,
      },
      STANDARD_CONFIG,
    );
    expect(kpis.spendDzd).toBeCloseTo(1_200_000, -2); // précision ±100 DZD (dépend des arrondis input)
  });

  it('cohérence cross-métriques : CPM × impressions / 1000 = displayed_spend', () => {
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: realSpendInr,
        accountCurrency: 'INR',
        bankRateToUsd: 0.011,
        impressions,
        clicks,
        conversions,
      },
      STANDARD_CONFIG,
    );
    const reconstructed = (kpis.cpmUsd * impressions) / 1000;
    expect(reconstructed).toBeCloseTo(kpis.spendUsd, 4);
  });

  it('cohérence : CPC × clicks = displayed_spend', () => {
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: realSpendInr,
        accountCurrency: 'INR',
        bankRateToUsd: 0.011,
        impressions,
        clicks,
        conversions,
      },
      STANDARD_CONFIG,
    );
    expect(kpis.cpcUsd * clicks).toBeCloseTo(kpis.spendUsd, 4);
  });

  it('CTR et CVR sont des ratios réels (jamais transformés par markup)', () => {
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: realSpendInr,
        accountCurrency: 'INR',
        bankRateToUsd: 0.011,
        impressions,
        clicks,
        conversions,
      },
      STANDARD_CONFIG,
    );
    expect(kpis.ctr).toBeCloseTo(clicks / impressions, 8);
    expect(kpis.cvr).toBeCloseTo(conversions / clicks, 8);
  });

  it('ROAS recalculé sur displayed_spend', () => {
    const conversionValue = 5_000; // USD revenue
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: realSpendInr,
        accountCurrency: 'INR',
        bankRateToUsd: 0.011,
        impressions,
        clicks,
        conversions,
        conversionValue,
      },
      STANDARD_CONFIG,
    );
    expect(kpis.roas).toBeCloseTo(conversionValue / kpis.spendUsd, 4);
  });

  it('zéro impressions → CPM = 0 (pas de division par zéro)', () => {
    const kpis = deriveClientKpisFromReal(
      {
        spendAccountCurrency: 100,
        accountCurrency: 'USD',
        bankRateToUsd: 1,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      },
      STANDARD_CONFIG,
    );
    expect(kpis.cpmUsd).toBe(0);
    expect(kpis.cpcUsd).toBe(0);
    expect(kpis.cpaUsd).toBe(0);
    expect(kpis.ctr).toBe(0);
    expect(kpis.cvr).toBe(0);
  });
});

describe('computeAgencyMarginBreakdown — vue agence super_admin', () => {
  it('1,2M DZD avec compte INR → marge ≈ 766 154 DZD', () => {
    const realInr = 151_694.45;
    const breakdown = computeAgencyMarginBreakdown(
      1_200_000,
      { amountAccountCurrency: realInr, accountCurrency: 'INR', bankRateToUsd: 0.011 },
      STANDARD_CONFIG,
    );
    expect(breakdown.realSpendUsd).toBeCloseTo(1668.64, 2);
    expect(breakdown.marginCashDzd).toBeCloseTo(766_154, -1); // ±10 DZD
    expect(breakdown.marginPct).toBeCloseTo(0.6385, 3);
    expect(breakdown.totalMarkup).toBeCloseTo(2.7659574468, 8);
  });

  it('marge identique sur compte USD vs INR (même real spend USD)', () => {
    const realUsd = 1_668.6390;
    const inrEquivalent = realUsd / 0.011; // 151 694,45 INR

    const usdBreakdown = computeAgencyMarginBreakdown(
      1_200_000,
      { amountAccountCurrency: realUsd, accountCurrency: 'USD', bankRateToUsd: 1 },
      STANDARD_CONFIG,
    );
    const inrBreakdown = computeAgencyMarginBreakdown(
      1_200_000,
      { amountAccountCurrency: inrEquivalent, accountCurrency: 'INR', bankRateToUsd: 0.011 },
      STANDARD_CONFIG,
    );

    // Même USD réel injecté → même marge cash
    expect(inrBreakdown.marginCashDzd).toBeCloseTo(usdBreakdown.marginCashDzd, 2);
  });
});

describe('Tests anti-régression — formule exacte 1,2M DZD', () => {
  it('chiffres EXACTS du brief utilisateur', () => {
    const config: BdcFinancialConfig = { parallelRate: 260, feesPct: 0.06, divisor: 2.6 };
    const deposit = 1_200_000;

    // Étape 1 : budget exécutable
    const realUsd = executableBudgetUsd(deposit, config);
    expect(realUsd).toBeCloseTo(1668.6390, 3);

    // Étape 2 : markup
    expect(totalMarkup(config)).toBeCloseTo(2.7659574468, 8);

    // Étape 3 : displayed = deposit (cohérence)
    const displayed = realUsdToDisplayed(realUsd, config);
    expect(displayed.displayedDzd).toBeCloseTo(1_200_000, 0);

    // Étape 4 : marge cash 766 153,85 DZD
    expect(cashMarginDzd(deposit, config)).toBeCloseTo(766_153.85, 1);
  });
});
