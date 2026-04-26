/**
 * format.ts — Source de vérité pour tout l'affichage de montants/dates/nombres.
 *
 * Règles strictes :
 * - FR : `1 000,00 DZD` (avec ESPACE INSÉCABLE U+00A0 entre milliers)
 * - EN : `1,000.00 DZD`
 * - JAMAIS de string template `${amount} DZD` brut dans l'UI
 *
 * 100% testé.
 */

import type { CurrencyCode, LanguageCode } from './constants';
import { DEFAULT_LANGUAGE, PRIMARY_CURRENCY } from './constants';

// ============================================
// MONTANTS
// ============================================

const LOCALE_MAP: Record<LanguageCode, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};

/**
 * Formate un montant avec sa devise.
 *
 * @example
 * formatAmount(1000)               // "1 000,00 DZD" (FR par défaut)
 * formatAmount(1000, 'fr')         // "1 000,00 DZD"
 * formatAmount(1000, 'en')         // "1,000.00 DZD"
 * formatAmount(1234.5, 'fr', 'USD') // "1 234,50 USD"
 */
export function formatAmount(
  value: number | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
  currency: CurrencyCode = PRIMARY_CURRENCY,
  options: { showCurrency?: boolean; minDecimals?: number; maxDecimals?: number } = {},
): string {
  const { showCurrency = true, minDecimals = 2, maxDecimals = 2 } = options;
  const amount = value ?? 0;

  const formatted = new Intl.NumberFormat(LOCALE_MAP[language], {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    useGrouping: true,
  }).format(amount);

  return showCurrency ? `${formatted} ${currency}` : formatted;
}

/**
 * Formate un pourcentage.
 *
 * @example
 * formatPercentage(0.19)            // "19,00 %" (FR)
 * formatPercentage(0.19, 'en')      // "19.00%"
 * formatPercentage(19, 'fr', true)  // "19,00 %" (déjà en %)
 */
export function formatPercentage(
  value: number | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
  alreadyInPercent = false,
  decimals = 2,
): string {
  const amount = (value ?? 0) * (alreadyInPercent ? 1 : 100);
  const formatted = new Intl.NumberFormat(LOCALE_MAP[language], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return language === 'fr' ? `${formatted} %` : `${formatted}%`;
}

/**
 * Formate un nombre entier (impressions, clics, etc.).
 *
 * @example
 * formatNumber(1234567)             // "1 234 567" (FR)
 * formatNumber(1234567, 'en')       // "1,234,567"
 */
export function formatNumber(
  value: number | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
): string {
  const amount = value ?? 0;
  return new Intl.NumberFormat(LOCALE_MAP[language], {
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format compact pour grands nombres.
 *
 * @example
 * formatCompact(1234)    // "1,2 k" (FR)
 * formatCompact(1234567) // "1,2 M"
 */
export function formatCompact(
  value: number | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
): string {
  const amount = value ?? 0;
  return new Intl.NumberFormat(LOCALE_MAP[language], {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

// ============================================
// DATES
// ============================================

/**
 * Formate une date.
 *
 * @example
 * formatDate('2026-01-15')         // "15/01/2026" (FR)
 * formatDate('2026-01-15', 'en')   // "01/15/2026"
 */
export function formatDate(
  value: string | Date | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_MAP[language]).format(date);
}

/**
 * Formate une date avec heure.
 *
 * @example
 * formatDateTime('2026-01-15T14:30:00')  // "15/01/2026 14:30" (FR)
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_MAP[language], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format relatif (il y a X minutes/heures/jours).
 *
 * @example
 * formatRelativeTime(date)  // "il y a 5 minutes" (FR)
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  language: LanguageCode = DEFAULT_LANGUAGE,
): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_MAP[language], { numeric: 'auto' });

  if (diffSeconds < 60) return rtf.format(-diffSeconds, 'second');
  if (diffSeconds < 3600) return rtf.format(-Math.floor(diffSeconds / 60), 'minute');
  if (diffSeconds < 86400) return rtf.format(-Math.floor(diffSeconds / 3600), 'hour');
  if (diffSeconds < 2592000) return rtf.format(-Math.floor(diffSeconds / 86400), 'day');
  if (diffSeconds < 31536000) return rtf.format(-Math.floor(diffSeconds / 2592000), 'month');
  return rtf.format(-Math.floor(diffSeconds / 31536000), 'year');
}

// ============================================
// NUMÉROTATION ENTITÉS
// ============================================

/**
 * Formate un numéro d'entité.
 *
 * @example
 * formatEntityNumber('DEV', 2026, 1)   // "DEV-2026-00001"
 * formatEntityNumber('FAC', 2026, 999) // "FAC-2026-00999"
 */
export function formatEntityNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
}

// ============================================
// TAILLE FICHIER
// ============================================

/**
 * Formate une taille de fichier en bytes vers KB/MB/GB.
 *
 * @example
 * formatFileSize(1024)        // "1 KB"
 * formatFileSize(50 * 1024 * 1024) // "50 MB"
 */
export function formatFileSize(bytes: number, language: LanguageCode = DEFAULT_LANGUAGE): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const formatted = new Intl.NumberFormat(LOCALE_MAP[language], {
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${sizes[i]}`;
}
