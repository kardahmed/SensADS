/**
 * Tests anti-régression spécifiques pour les calculs de marge utilisés
 * par les dashboards agence (Sprint 4).
 *
 * Vérifie la cohérence entre :
 *   - cashMarginDzd (helper Sprint 1)
 *   - executableBudgetUsd
 *   - totalMarkup
 * sur des cas réalistes avec multi-clients, multi-BDC, multi-config.
 */

import { describe, expect, it } from 'vitest';
import {
  cashMarginDzd,
  executableBudgetUsd,
  totalMarkup,
  type BdcFinancialConfig,
} from './pricing';

const CONFIGS = {
  standard: { parallelRate: 260, feesPct: 0.06, divisor: 2.6 } as BdcFinancialConfig,
  premium: { parallelRate: 250, feesPct: 0.04, divisor: 2.2 } as BdcFinancialConfig,
  volume: { parallelRate: 270, feesPct: 0.07, divisor: 3.0 } as BdcFinancialConfig,
  trial: { parallelRate: 260, feesPct: 0.05, divisor: 2.3 } as BdcFinancialConfig,
};

describe('Cohérence helpers Sprint 1 — agrégat agence', () => {
  it('marge cumulée sur 5 BDC (1.2M chacun, config standard) = 3 830 769', () => {
    const deposit = 1_200_000;
    const totalMargin = 5 * cashMarginDzd(deposit, CONFIGS.standard);
    expect(totalMargin).toBeCloseTo(5 * 766_153.85, 1);
    // ≈ 3 830 769,25
  });

  it('marges par template — chiffres exacts attendus', () => {
    const deposit = 1_000_000;
    expect(cashMarginDzd(deposit, CONFIGS.standard)).toBeCloseTo(638_461.54, 1);
    // Standard 64% sur 1M
    expect(cashMarginDzd(deposit, CONFIGS.premium)).toBeCloseTo(563_636.36, 1);
    // Premium 56% (moins de marge, prix plus négocié)
    expect(cashMarginDzd(deposit, CONFIGS.volume)).toBeCloseTo(690_000.0, 1);
    // Volume 69% (gros markup)
    expect(cashMarginDzd(deposit, CONFIGS.trial)).toBeCloseTo(586_956.52, 1);
    // Trial ≈ 59%
  });

  it('marge augmente quand on passe Standard → Volume sur le même dépôt', () => {
    const deposit = 800_000;
    const standardMargin = cashMarginDzd(deposit, CONFIGS.standard);
    const volumeMargin = cashMarginDzd(deposit, CONFIGS.volume);
    expect(volumeMargin).toBeGreaterThan(standardMargin);
  });

  it('marge cumulée multi-clients ≠ marge moyenne × N (cas non-trivial)', () => {
    const bdcs = [
      { deposit: 1_200_000, config: CONFIGS.standard },
      { deposit: 800_000, config: CONFIGS.premium },
      { deposit: 500_000, config: CONFIGS.volume },
      { deposit: 300_000, config: CONFIGS.trial },
    ];

    const totalDeposits = bdcs.reduce((s, b) => s + b.deposit, 0);
    const totalMargin = bdcs.reduce((s, b) => s + cashMarginDzd(b.deposit, b.config), 0);
    const avgPct = totalMargin / totalDeposits;

    expect(totalDeposits).toBe(2_800_000);
    expect(totalMargin).toBeGreaterThan(0);
    expect(avgPct).toBeGreaterThan(0.4);
    expect(avgPct).toBeLessThan(0.7);
  });

  it('cohérence : real_spend × (markup × parallel) = displayed ≈ deposit', () => {
    const deposit = 1_500_000;
    const cfg = CONFIGS.standard;
    const realUsd = executableBudgetUsd(deposit, cfg);
    const markup = totalMarkup(cfg);
    const displayed = realUsd * markup * cfg.parallelRate;
    expect(displayed).toBeCloseTo(deposit, 0);
  });

  it('cas extrême : dépôt 0 → marge 0', () => {
    expect(cashMarginDzd(0, CONFIGS.standard)).toBe(0);
    expect(executableBudgetUsd(0, CONFIGS.standard)).toBe(0);
  });

  it('cas extrême : divisor = 1 → markup = 1/(1-fees), marge = fees × deposit', () => {
    const cfg: BdcFinancialConfig = { parallelRate: 260, feesPct: 0.06, divisor: 1 };
    const deposit = 1_000_000;
    const markup = totalMarkup(cfg);
    expect(markup).toBeCloseTo(1 / 0.94, 6);
    // Marge ≈ deposit × 0.06 / (1) ... Let me compute :
    // real = deposit × 0.94 / 260 / 1 = 3615.38 USD
    // realDzd = 3615.38 × 260 = 940 000 DZD
    // marge = 1M - 940k = 60 000 DZD = 6% du dépôt
    expect(cashMarginDzd(deposit, cfg)).toBeCloseTo(60_000, 0);
  });

  it('cas extrême : divisor = 5 → marge très élevée', () => {
    const cfg: BdcFinancialConfig = { parallelRate: 260, feesPct: 0.06, divisor: 5 };
    const deposit = 1_000_000;
    const margin = cashMarginDzd(deposit, cfg);
    const pct = margin / deposit;
    expect(pct).toBeGreaterThan(0.8);
  });
});

describe('Cas spécifiques business agence Algérie', () => {
  it('100 000 DZD avec config standard → marge 63 846,15 (63,85%)', () => {
    expect(cashMarginDzd(100_000, CONFIGS.standard)).toBeCloseTo(63_846.15, 2);
  });

  it('1 200 000 DZD avec config standard → marge 766 153,85', () => {
    expect(cashMarginDzd(1_200_000, CONFIGS.standard)).toBeCloseTo(766_153.85, 2);
  });

  it('changement de config : 1.2M Std vs 1.2M Volume — gain attendu', () => {
    const standardMargin = cashMarginDzd(1_200_000, CONFIGS.standard);
    const volumeMargin = cashMarginDzd(1_200_000, CONFIGS.volume);
    const gain = volumeMargin - standardMargin;
    expect(gain).toBeGreaterThan(50_000);
    // Le passage Standard → Volume rapporte > 50k DZD sur 1.2M
  });
});
