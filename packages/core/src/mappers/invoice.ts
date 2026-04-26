import type { InvoiceStatus } from '../constants';
import type { Invoice } from '../types';

export interface DbInvoice {
  id: string;
  number: string;
  organization_id: string;
  campaign_id: string;
  po_id: string;
  status: InvoiceStatus;
  subtotal_dzd: number;
  vat_rate: number;
  vat_amount_dzd: number;
  total_dzd: number;
  adjustment_amount_dzd: number;
  adjustment_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  currency_translation_gain_loss_dzd: number;
  paid_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  pdf_url: string | null;
  created_at: string;
}

export function dbInvoiceToInvoice(db: DbInvoice): Invoice {
  return {
    id: db.id,
    number: db.number,
    organizationId: db.organization_id,
    campaignId: db.campaign_id,
    poId: db.po_id,
    status: db.status,
    subtotalDzd: db.subtotal_dzd,
    vatRate: db.vat_rate,
    vatAmountDzd: db.vat_amount_dzd,
    totalDzd: db.total_dzd,
    adjustmentAmountDzd: db.adjustment_amount_dzd,
    adjustmentReason: db.adjustment_reason,
    adjustedBy: db.adjusted_by,
    adjustedAt: db.adjusted_at,
    currencyTranslationGainLossDzd: db.currency_translation_gain_loss_dzd,
    paidAt: db.paid_at,
    validatedBy: db.validated_by,
    validatedAt: db.validated_at,
    pdfUrl: db.pdf_url,
    createdAt: db.created_at,
  };
}
