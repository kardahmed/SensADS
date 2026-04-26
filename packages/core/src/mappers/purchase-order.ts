import type { PurchaseOrderStatus } from '../constants';
import type { PurchaseOrder } from '../types';

export interface DbPurchaseOrder {
  id: string;
  number: string;
  organization_id: string;
  quote_id: string | null;
  parent_po_id: string | null;
  amount_ttc_dzd: number;
  consumed_amount_dzd: number;
  remaining_amount_dzd: number;
  status: PurchaseOrderStatus;
  file_url: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

export function dbPoToPo(db: DbPurchaseOrder): PurchaseOrder {
  return {
    id: db.id,
    number: db.number,
    organizationId: db.organization_id,
    quoteId: db.quote_id,
    parentPoId: db.parent_po_id,
    amountTtcDzd: db.amount_ttc_dzd,
    consumedAmountDzd: db.consumed_amount_dzd,
    remainingAmountDzd: db.remaining_amount_dzd,
    status: db.status,
    fileUrl: db.file_url,
    cancelledAt: db.cancelled_at,
    cancelledBy: db.cancelled_by,
    cancellationReason: db.cancellation_reason,
    paidAt: db.paid_at,
    createdAt: db.created_at,
  };
}
