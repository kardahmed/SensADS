import { z } from 'zod';
import { uuidSchema } from './common';

export const createTariffSchema = z
  .object({
    platform: z.string().min(1),
    optimizationGoal: z.string().min(1),
    name: z.string().min(1).max(100),
    purchasePriceUsd: z.number().positive('Le prix d\'achat doit être > 0'),
    sellingPriceUsd: z.number().positive(),
    minBudgetDzd: z.number().nonnegative().default(0),
    status: z.enum(['active', 'archived']).default('active'),
  })
  .refine((data) => data.sellingPriceUsd >= data.purchasePriceUsd, {
    message: 'Le prix de vente doit être supérieur ou égal au prix d\'achat',
    path: ['sellingPriceUsd'],
  });

export const updateTariffSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    purchasePriceUsd: z.number().positive().optional(),
    sellingPriceUsd: z.number().positive().optional(),
    minBudgetDzd: z.number().nonnegative().optional(),
    status: z.enum(['active', 'archived']).optional(),
  });

export const createTariffOverrideSchema = z.object({
  organizationId: uuidSchema,
  tariffId: uuidSchema,
  customPurchasePriceUsd: z.number().positive().nullable(),
  customSellingPriceUsd: z.number().positive().nullable(),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateTariffInput = z.infer<typeof createTariffSchema>;
export type UpdateTariffInput = z.infer<typeof updateTariffSchema>;
export type CreateTariffOverrideInput = z.infer<typeof createTariffOverrideSchema>;
