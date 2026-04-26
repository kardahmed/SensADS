/**
 * Constantes globales — source de vérité unique.
 * Ne JAMAIS hardcoder ces valeurs ailleurs.
 */

export const APP_NAME = 'SensADS';
export const APP_COMPANY = 'SENSIUM-X';

// ============================================
// DEVISES
// ============================================
export const PRIMARY_CURRENCY = 'DZD' as const;

export const SUPPORTED_CURRENCIES = [
  'DZD',
  'USD',
  'EUR',
  'AED',
  'GBP',
  'MAD',
  'TND',
  'INR',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

// Devises utilisées par les ad accounts (sous-ensemble)
export const AD_ACCOUNT_CURRENCIES = ['USD', 'EUR', 'AED', 'INR'] as const;
export type AdAccountCurrency = (typeof AD_ACCOUNT_CURRENCIES)[number];

// ============================================
// LANGUES
// ============================================
export const DEFAULT_LANGUAGE = 'fr' as const;
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

// ============================================
// FISCAL / FINANCIER
// ============================================
export const DEFAULT_VAT_RATE = 0.19; // Algérie 19%
export const INVOICE_MIN_AMOUNT_DZD = 1000; // Sous ce seuil → pending_review

// ============================================
// LIMITES
// ============================================
export const DEFAULT_MAX_SUB_ACCOUNTS = 5;
export const MAX_MEDIA_UPLOAD_SIZE_MB = 50;
export const MAX_BDC_FILE_SIZE_MB = 20;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

// ============================================
// SIGNED URLS
// ============================================
export const SIGNED_URL_EXPIRY_SECONDS = 60;

// ============================================
// NUMÉROTATION
// ============================================
export const ENTITY_NUMBER_PADDING = 5; // YYYY-NNNNN

export const ENTITY_PREFIXES = {
  quote: 'DEV',
  purchase_order: 'BDC',
  campaign: 'CAM',
  invoice: 'FAC',
  forecast: 'PREV',
  credit_note: 'AVR',
} as const;

// ============================================
// RÔLES
// ============================================
export const USER_ROLES = [
  'super_admin',
  'admin',
  'traffic_manager',
  'client_owner',
  'client_member',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CLIENT_MEMBER_ACCESS_LEVELS = ['full', 'campaigns_only', 'read_only'] as const;
export type ClientMemberAccessLevel = (typeof CLIENT_MEMBER_ACCESS_LEVELS)[number];

// ============================================
// STATUTS
// ============================================
export const QUOTE_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'accepted',
  'converted',
  'expired',
  'cancelled',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'active',
  'consumed',
  'cancelled',
  'paid',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const INVOICE_STATUSES = [
  'pending_review',
  'draft',
  'validated',
  'sent',
  'paid',
  'overdue',
  'cancelled',
  'adjusted',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ============================================
// CACHE STRATEGY (React Query staleTime ms)
// ============================================
export const CACHE_TIMES = {
  tariffs: 10 * 60 * 1000, // 10 min
  benchmarks: 10 * 60 * 1000,
  appSettings: 30 * 60 * 1000, // 30 min
  organizations: 5 * 60 * 1000,
  campaigns: 60 * 1000, // 1 min
  kpis: 30 * 1000, // 30 sec
  notifications: 0, // toujours refetch (Realtime)
  default: 60 * 1000,
} as const;

// ============================================
// RATE LIMITING (Edge Functions)
// ============================================
export const RATE_LIMITS = {
  generateSuggestions: { perForecast: 1, windowMinutes: 5 },
  generateReport: { perCampaign: 3, windowMinutes: 5 },
  metaOauth: { perUser: 10, windowMinutes: 60 },
} as const;

// ============================================
// PAGINATION
// ============================================
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
