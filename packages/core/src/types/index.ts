/**
 * Types domain (camelCase) — résultats des mappers.
 * Les types DB (snake_case) viennent de @sensads/db.
 */

import type {
  CampaignStatus,
  ClientMemberAccessLevel,
  CurrencyCode,
  InvoiceStatus,
  LanguageCode,
  PurchaseOrderStatus,
  QuoteStatus,
  UserRole,
} from '../constants';

// ============================================
// CORE ENTITIES
// ============================================

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string | null;
  preferredLanguage: LanguageCode;
  twoFactorEnabled: boolean;
  parentUserId: string | null; // pour client_member
  accessLevel: ClientMemberAccessLevel | null;
  assignedTmId: string | null; // pour client : son TM dédié
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  legalName: string | null;
  nif: string | null; // Algérie
  nis: string | null;
  rc: string | null;
  vatId: string | null; // EU VAT
  isEuVatValid: boolean;
  address: string | null;
  wilaya: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  ownerId: string;
  assignedTmId: string | null;
  sandboxMode: boolean;
  maxSubAccounts: number;
  features: Record<string, unknown>; // feature flags
  createdAt: string;
  deletedAt: string | null;
}

export interface AppSettings {
  id: string; // toujours '00000000-0000-0000-0000-000000000001'
  vatRate: number;
  invoiceMinimumAmountDzd: number;
  defaultExchangeRates: Record<CurrencyCode, number>;
  brandingLogoUrl: string | null;
  agencyName: string;
  agencyAddress: string | null;
  agencyNif: string | null;
  agencyVatId: string | null;
  notificationsEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

// ============================================
// FINANCIAL
// ============================================

export interface ClientFinancialSettings {
  organizationId: string;
  sourceCurrency: CurrencyCode;
  exchangeRate: number;
  discountPercentage: number;
  customVatRate: number | null;
  paymentTermsDays: number;
  updatedAt: string;
}

export interface ExchangeRateHistory {
  id: string;
  organizationId: string;
  currency: CurrencyCode;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string | null;
}

// ============================================
// PRICING
// ============================================

export interface PlatformTariff {
  id: string;
  platform: string;
  optimizationGoal: string;
  name: string;
  purchasePriceUsd: number;
  sellingPriceUsd: number;
  marginPercentage: number; // GENERATED
  minBudgetDzd: number;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface ClientTariffOverride {
  id: string;
  organizationId: string;
  tariffId: string;
  customPurchasePriceUsd: number | null;
  customSellingPriceUsd: number | null;
  notes: string | null;
  createdAt: string;
}

// ============================================
// QUOTES
// ============================================

export interface Quote {
  id: string;
  number: string; // DEV-2026-00001
  organizationId: string;
  createdBy: string;
  status: QuoteStatus;
  subtotalDzd: number;
  discountPercentage: number;
  discountAmountDzd: number;
  vatRate: number;
  vatAmountDzd: number;
  totalDzd: number;
  exchangeRateSnapshot: Record<CurrencyCode, number>;
  notes: string | null;
  validUntil: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  acceptedAt: string | null;
  rejectedReason: string | null;
  convertedToPoId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

// ============================================
// PURCHASE ORDERS
// ============================================

export interface PurchaseOrder {
  id: string;
  number: string; // BDC-2026-00001
  organizationId: string;
  quoteId: string | null;
  parentPoId: string | null; // pour BDC budget restant
  amountTtcDzd: number;
  consumedAmountDzd: number;
  remainingAmountDzd: number; // GENERATED
  status: PurchaseOrderStatus;
  fileUrl: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ============================================
// CAMPAIGNS
// ============================================

export type SpecialAdCategory =
  | 'none'
  | 'employment'
  | 'housing'
  | 'credit'
  | 'social_issues_elections';

export interface Campaign {
  id: string;
  number: string; // CAM-2026-00001
  organizationId: string;
  poId: string;
  name: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  budgetMode: 'cbo' | 'abo';
  startDate: string;
  endDate: string | null;
  adAccountId: string;
  specialAdCategory: SpecialAdCategory;
  disclaimerText: string | null;
  status: CampaignStatus;
  externalId: string | null; // ID Meta / autre plateforme
  totalSpentSourceCurrency: number;
  totalSpentDzd: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  completedAt: string | null;
  rejectedReason: string | null;
  createdBy: string;
  createdAt: string;
}

// ============================================
// KPIs
// ============================================

export interface CampaignKpi {
  id: string;
  campaignId: string;
  adSetId: string | null;
  date: string;
  // Universal metrics
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
  // Source-specific (JSONB)
  platformMetrics: Record<string, number>;
  // Conversion
  exchangeRateSnapshot: number;
  spendDzd: number;
  source: 'manual' | 'api' | 'ga4';
  createdBy: string | null;
  createdAt: string;
}

// ============================================
// INVOICES
// ============================================

export interface Invoice {
  id: string;
  number: string; // FAC-2026-00001
  organizationId: string;
  campaignId: string;
  poId: string;
  status: InvoiceStatus;
  subtotalDzd: number;
  vatRate: number;
  vatAmountDzd: number;
  totalDzd: number;
  adjustmentAmountDzd: number;
  adjustmentReason: string | null;
  adjustedBy: string | null;
  adjustedAt: string | null;
  currencyTranslationGainLossDzd: number;
  paidAt: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

// ============================================
// NOTIFICATIONS
// ============================================

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'critical';

export interface Notification {
  id: string;
  recipientId: string;
  type: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

// ============================================
// AUDIT
// ============================================

export interface AuditLog {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
