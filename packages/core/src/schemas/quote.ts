import { z } from 'zod';
import { QUOTE_STATUSES } from '../constants';
import { dateSchema, uuidSchema } from './common';

export const quoteLineSchema = z.object({
  tariffId: uuidSchema,
  quantity: z.number().int().positive(),
  customSellingPriceUsd: z.number().positive().nullable().optional(),
});

export const createQuoteSchema = z.object({
  organizationId: uuidSchema,
  lines: z.array(quoteLineSchema).min(1, 'Au moins une ligne requise'),
  notes: z.string().max(2000).nullable().optional(),
  validUntil: dateSchema.nullable().optional(),
});

export const updateQuoteStatusSchema = z.object({
  quoteId: uuidSchema,
  newStatus: z.enum(QUOTE_STATUSES),
  reason: z.string().max(500).optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;
export type UpdateQuoteStatusInput = z.infer<typeof updateQuoteStatusSchema>;
