import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatCompact,
  formatDate,
  formatEntityNumber,
  formatFileSize,
  formatNumber,
  formatPercentage,
} from './format';

describe('formatAmount', () => {
  it('formate FR avec espace insécable et 2 décimales', () => {
    const result = formatAmount(1000, 'fr');
    expect(result).toBe('1 000,00 DZD');
  });

  it('formate EN avec virgule séparateur et point décimal', () => {
    expect(formatAmount(1000, 'en')).toBe('1,000.00 DZD');
  });

  it('gère null/undefined → 0', () => {
    expect(formatAmount(null, 'fr')).toBe('0,00 DZD');
    expect(formatAmount(undefined, 'fr')).toBe('0,00 DZD');
  });

  it('formate avec autre devise', () => {
    expect(formatAmount(1234.5, 'fr', 'USD')).toBe('1 234,50 USD');
  });

  it('option showCurrency:false', () => {
    expect(formatAmount(1000, 'fr', 'DZD', { showCurrency: false })).toBe('1 000,00');
  });

  it('grands montants', () => {
    expect(formatAmount(1234567.89, 'fr')).toBe('1 234 567,89 DZD');
  });

  it('montants négatifs', () => {
    expect(formatAmount(-1000, 'fr')).toBe('-1 000,00 DZD');
  });
});

describe('formatPercentage', () => {
  it('formate ratio (0.19) en pourcentage FR', () => {
    expect(formatPercentage(0.19, 'fr')).toBe('19,00 %');
  });

  it('formate ratio en EN', () => {
    expect(formatPercentage(0.19, 'en')).toBe('19.00%');
  });

  it('alreadyInPercent=true ne re-multiplie pas', () => {
    expect(formatPercentage(19, 'fr', true)).toBe('19,00 %');
  });

  it('décimales custom', () => {
    expect(formatPercentage(0.1234, 'fr', false, 1)).toBe('12,3 %');
  });
});

describe('formatNumber', () => {
  it('formate FR avec espace milliers', () => {
    expect(formatNumber(1234567, 'fr')).toBe('1 234 567');
  });

  it('formate EN avec virgules', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });

  it('null → 0', () => {
    expect(formatNumber(null, 'fr')).toBe('0');
  });
});

describe('formatCompact', () => {
  it('format compact FR', () => {
    expect(formatCompact(1234, 'fr')).toMatch(/1,2/);
    expect(formatCompact(1234567, 'fr')).toMatch(/M/);
  });
});

describe('formatDate', () => {
  it('formate FR DD/MM/YYYY', () => {
    expect(formatDate('2026-01-15', 'fr')).toBe('15/01/2026');
  });

  it('formate EN MM/DD/YYYY', () => {
    expect(formatDate('2026-01-15', 'en')).toBe('01/15/2026');
  });

  it('date invalide → string vide', () => {
    expect(formatDate('invalid', 'fr')).toBe('');
    expect(formatDate(null, 'fr')).toBe('');
  });

  it('accepte un objet Date', () => {
    expect(formatDate(new Date('2026-01-15'), 'fr')).toBe('15/01/2026');
  });
});

describe('formatEntityNumber', () => {
  it('padding 5 digits', () => {
    expect(formatEntityNumber('DEV', 2026, 1)).toBe('DEV-2026-00001');
    expect(formatEntityNumber('DEV', 2026, 999)).toBe('DEV-2026-00999');
    expect(formatEntityNumber('FAC', 2026, 12345)).toBe('FAC-2026-12345');
  });

  it('pas de troncage si > 99999', () => {
    expect(formatEntityNumber('DEV', 2026, 100000)).toBe('DEV-2026-100000');
  });
});

describe('formatFileSize', () => {
  it('bytes / KB / MB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 MB');
  });
});
