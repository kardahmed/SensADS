import { describe, expect, it } from 'vitest';
import {
  convertCurrency,
  convertToDzd,
  createExchangeRateSnapshot,
  getRateFromSnapshot,
  isValidExchangeRate,
} from './currency';

describe('convertToDzd', () => {
  it('conversion simple sans marge', () => {
    expect(convertToDzd({ amount: 100, exchangeRate: 250 })).toBe(25000);
  });

  it('conversion avec ratio de marge', () => {
    // 100 USD × 250 DZD/USD × (30/15 marge) = 50000
    expect(
      convertToDzd({
        amount: 100,
        exchangeRate: 250,
        sellingPrice: 30,
        purchasePrice: 15,
      }),
    ).toBe(50000);
  });

  it('garde-fou purchasePrice = 0 → ratio 1', () => {
    expect(
      convertToDzd({
        amount: 100,
        exchangeRate: 250,
        sellingPrice: 30,
        purchasePrice: 0,
      }),
    ).toBe(25000);
  });

  it('garde-fou purchasePrice négatif → ratio 1', () => {
    expect(
      convertToDzd({
        amount: 100,
        exchangeRate: 250,
        sellingPrice: 30,
        purchasePrice: -5,
      }),
    ).toBe(25000);
  });

  it('amount = 0 → 0', () => {
    expect(convertToDzd({ amount: 0, exchangeRate: 250 })).toBe(0);
  });

  it('exchangeRate <= 0 → 0', () => {
    expect(convertToDzd({ amount: 100, exchangeRate: 0 })).toBe(0);
    expect(convertToDzd({ amount: 100, exchangeRate: -1 })).toBe(0);
  });

  it('marge négative (selling < purchase) acceptée mais signale via résultat plus bas', () => {
    expect(
      convertToDzd({
        amount: 100,
        exchangeRate: 250,
        sellingPrice: 10,
        purchasePrice: 20,
      }),
    ).toBe(12500); // ratio 0.5
  });
});

describe('convertCurrency', () => {
  it('USD vers DZD', () => {
    expect(convertCurrency({ amount: 100, fromRate: 1, toRate: 250 })).toBe(25000);
  });

  it('DZD vers USD', () => {
    expect(convertCurrency({ amount: 25000, fromRate: 250, toRate: 1 })).toBe(100);
  });

  it('fromRate = 0 → 0', () => {
    expect(convertCurrency({ amount: 100, fromRate: 0, toRate: 250 })).toBe(0);
  });
});

describe('createExchangeRateSnapshot', () => {
  it('inclut toujours DZD = 1', () => {
    const snap = createExchangeRateSnapshot({ USD: 250, EUR: 280 });
    expect(snap.DZD).toBe(1);
    expect(snap.USD).toBe(250);
    expect(snap.EUR).toBe(280);
  });

  it('ignore les rates invalides', () => {
    const snap = createExchangeRateSnapshot({ USD: 250, EUR: 0, GBP: -1 });
    expect(snap.USD).toBe(250);
    expect(snap.EUR).toBeUndefined();
    expect(snap.GBP).toBeUndefined();
  });
});

describe('getRateFromSnapshot', () => {
  const snap = { DZD: 1, USD: 250, EUR: 280 };

  it('lit le taux existant', () => {
    expect(getRateFromSnapshot(snap, 'USD')).toBe(250);
    expect(getRateFromSnapshot(snap, 'EUR')).toBe(280);
  });

  it('DZD toujours 1', () => {
    expect(getRateFromSnapshot(snap, 'DZD')).toBe(1);
  });

  it('devise manquante → 1 (fallback)', () => {
    expect(getRateFromSnapshot(snap, 'GBP')).toBe(1);
  });

  it('snapshot null → 1', () => {
    expect(getRateFromSnapshot(null, 'USD')).toBe(1);
  });
});

describe('isValidExchangeRate', () => {
  it('valide les taux positifs raisonnables', () => {
    expect(isValidExchangeRate(250)).toBe(true);
    expect(isValidExchangeRate(0.001)).toBe(true);
  });

  it('rejette zéro et négatifs', () => {
    expect(isValidExchangeRate(0)).toBe(false);
    expect(isValidExchangeRate(-1)).toBe(false);
  });

  it('rejette infinis et NaN', () => {
    expect(isValidExchangeRate(Infinity)).toBe(false);
    expect(isValidExchangeRate(NaN)).toBe(false);
  });

  it('rejette absurdement grand', () => {
    expect(isValidExchangeRate(10_000_000)).toBe(false);
  });
});
