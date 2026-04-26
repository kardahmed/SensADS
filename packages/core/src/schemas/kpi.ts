import { z } from 'zod';
import { dateSchema, nonNegativeDecimalSchema, uuidSchema } from './common';

export const createKpiSchema = z.object({
  campaignId: uuidSchema,
  adSetId: uuidSchema.nullable().optional(),
  date: dateSchema,
  spend: nonNegativeDecimalSchema,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  reach: z.number().int().nonnegative().default(0),
  frequency: nonNegativeDecimalSchema.default(0),
  platformMetrics: z.record(z.string(), z.number()).default({}),
  source: z.enum(['manual', 'api', 'ga4']).default('manual'),
});

export const bulkKpisSchema = z.object({
  campaignId: uuidSchema,
  rows: z.array(createKpiSchema.omit({ campaignId: true })).min(1).max(365),
});

export type CreateKpiInput = z.infer<typeof createKpiSchema>;
export type BulkKpisInput = z.infer<typeof bulkKpisSchema>;
