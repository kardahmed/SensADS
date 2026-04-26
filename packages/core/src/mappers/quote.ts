import type { CurrencyCode } from '../constants';
import type { QuoteStatus } from '../constants';
import type { Quote } from '../types';

export interface DbQuote {
  id: string;
  number: string;
  organization_id: string;
  created_by: string;
  status: QuoteStatus;
  subtotal_dzd: number;
  discount_percentage: number;
  discount_amount_dzd: number;
  vat_rate: number;
  vat_amount_dzd: number;
  total_dzd: number;
  exchange_rate_snapshot: Record<CurrencyCode, number>;
  notes: string | null;
  valid_until: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  accepted_at: string | null;
  rejected_reason: string | null;
  converted_to_po_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export function dbQuoteToQuote(db: DbQuote): Quote {
  return {
    id: db.id,
    number: db.number,
    organizationId: db.organization_id,
    createdBy: db.created_by,
    status: db.status,
    subtotalDzd: db.subtotal_dzd,
    discountPercentage: db.discount_percentage,
    discountAmountDzd: db.discount_amount_dzd,
    vatRate: db.vat_rate,
    vatAmountDzd: db.vat_amount_dzd,
    totalDzd: db.total_dzd,
    exchangeRateSnapshot: db.exchange_rate_snapshot,
    notes: db.notes,
    validUntil: db.valid_until,
    submittedAt: db.submitted_at,
    approvedAt: db.approved_at,
    approvedBy: db.approved_by,
    acceptedAt: db.accepted_at,
    rejectedReason: db.rejected_reason,
    convertedToPoId: db.converted_to_po_id,
    createdAt: db.created_at,
    deletedAt: db.deleted_at,
  };
}
