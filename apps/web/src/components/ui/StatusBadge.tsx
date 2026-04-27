/**
 * StatusBadge — Badge avec mapping centralisé des statuts métier.
 */

import type {
  CampaignStatus,
  InvoiceStatus,
  PurchaseOrderStatus,
  QuoteStatus,
} from '@sensads/core';
import { Badge } from './Badge';

type AnyStatus = QuoteStatus | PurchaseOrderStatus | CampaignStatus | InvoiceStatus | string;

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'violet';

interface Mapping {
  variant: Variant;
  labelFr: string;
  labelEn: string;
}

const QUOTE_MAPPING: Record<QuoteStatus, Mapping> = {
  draft: { variant: 'neutral', labelFr: 'Brouillon', labelEn: 'Draft' },
  submitted: { variant: 'info', labelFr: 'Soumis', labelEn: 'Submitted' },
  approved: { variant: 'violet', labelFr: 'Approuvé', labelEn: 'Approved' },
  rejected: { variant: 'error', labelFr: 'Rejeté', labelEn: 'Rejected' },
  accepted: { variant: 'success', labelFr: 'Accepté', labelEn: 'Accepted' },
  converted: { variant: 'success', labelFr: 'Converti BDC', labelEn: 'Converted to PO' },
  expired: { variant: 'warning', labelFr: 'Expiré', labelEn: 'Expired' },
  cancelled: { variant: 'error', labelFr: 'Annulé', labelEn: 'Cancelled' },
};

const PO_MAPPING: Record<PurchaseOrderStatus, Mapping> = {
  draft: { variant: 'neutral', labelFr: 'Brouillon', labelEn: 'Draft' },
  active: { variant: 'success', labelFr: 'Actif', labelEn: 'Active' },
  consumed: { variant: 'info', labelFr: 'Consommé', labelEn: 'Consumed' },
  cancelled: { variant: 'error', labelFr: 'Annulé', labelEn: 'Cancelled' },
  paid: { variant: 'violet', labelFr: 'Payé', labelEn: 'Paid' },
};

const CAMPAIGN_MAPPING: Record<CampaignStatus, Mapping> = {
  draft: { variant: 'neutral', labelFr: 'Brouillon', labelEn: 'Draft' },
  in_review: { variant: 'warning', labelFr: 'En revue', labelEn: 'In review' },
  approved: { variant: 'violet', labelFr: 'Approuvée', labelEn: 'Approved' },
  active: { variant: 'success', labelFr: 'Active', labelEn: 'Active' },
  paused: { variant: 'warning', labelFr: 'En pause', labelEn: 'Paused' },
  completed: { variant: 'info', labelFr: 'Terminée', labelEn: 'Completed' },
  rejected: { variant: 'error', labelFr: 'Rejetée', labelEn: 'Rejected' },
  cancelled: { variant: 'error', labelFr: 'Annulée', labelEn: 'Cancelled' },
};

const INVOICE_MAPPING: Record<InvoiceStatus, Mapping> = {
  pending_review: { variant: 'warning', labelFr: 'En revue', labelEn: 'Pending review' },
  draft: { variant: 'neutral', labelFr: 'Brouillon', labelEn: 'Draft' },
  validated: { variant: 'violet', labelFr: 'Validée', labelEn: 'Validated' },
  sent: { variant: 'info', labelFr: 'Envoyée', labelEn: 'Sent' },
  paid: { variant: 'success', labelFr: 'Payée', labelEn: 'Paid' },
  overdue: { variant: 'error', labelFr: 'En retard', labelEn: 'Overdue' },
  cancelled: { variant: 'error', labelFr: 'Annulée', labelEn: 'Cancelled' },
  adjusted: { variant: 'warning', labelFr: 'Ajustée', labelEn: 'Adjusted' },
};

interface StatusBadgeProps {
  status: AnyStatus;
  type: 'quote' | 'purchase_order' | 'campaign' | 'invoice';
  language?: 'fr' | 'en';
}

export function StatusBadge({ status, type, language = 'fr' }: StatusBadgeProps): JSX.Element {
  let mapping: Mapping;
  switch (type) {
    case 'quote':
      mapping = QUOTE_MAPPING[status as QuoteStatus] ?? {
        variant: 'neutral',
        labelFr: status,
        labelEn: status,
      };
      break;
    case 'purchase_order':
      mapping = PO_MAPPING[status as PurchaseOrderStatus] ?? {
        variant: 'neutral',
        labelFr: status,
        labelEn: status,
      };
      break;
    case 'campaign':
      mapping = CAMPAIGN_MAPPING[status as CampaignStatus] ?? {
        variant: 'neutral',
        labelFr: status,
        labelEn: status,
      };
      break;
    case 'invoice':
      mapping = INVOICE_MAPPING[status as InvoiceStatus] ?? {
        variant: 'neutral',
        labelFr: status,
        labelEn: status,
      };
      break;
  }

  return <Badge variant={mapping.variant}>{language === 'en' ? mapping.labelEn : mapping.labelFr}</Badge>;
}
