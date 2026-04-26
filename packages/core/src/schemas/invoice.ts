import { z } from 'zod';
import { uuidSchema } from './common';

export const adjustInvoiceSchema = z.object({
  invoiceId: uuidSchema,
  adjustmentAmountDzd: z.number().refine((n) => n !== 0, 'Le montant ne peut être 0'),
  reason: z.string().min(10, 'Motif obligatoire (min 10 caractères)').max(1000),
});

export const validateInvoiceSchema = z.object({
  invoiceId: uuidSchema,
});

export const markInvoicePaidSchema = z.object({
  invoiceId: uuidSchema,
  paidAt: z.string().datetime(),
  paymentReference: z.string().max(100).optional(),
});

export type AdjustInvoiceInput = z.infer<typeof adjustInvoiceSchema>;
export type ValidateInvoiceInput = z.infer<typeof validateInvoiceSchema>;
export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;
