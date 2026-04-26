import { z } from 'zod';
import {
  emailSchema,
  nifSchema,
  nisSchema,
  phoneSchema,
  rcSchema,
  uuidSchema,
  vatIdSchema,
} from './common';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(200),
  legalName: z.string().min(2).max(200).optional().nullable(),
  nif: nifSchema,
  nis: nisSchema,
  rc: rcSchema,
  vatId: vatIdSchema,
  address: z.string().max(500).optional().nullable(),
  wilaya: z.string().max(100).optional().nullable(),
  country: z.string().min(2).max(100).default('Algérie'),
  phone: phoneSchema,
  email: emailSchema.optional(),
  ownerId: uuidSchema,
  assignedTmId: uuidSchema.nullable().optional(),
  maxSubAccounts: z.number().int().min(0).max(100).default(5),
});

export const updateOrganizationSchema = createOrganizationSchema.partial().omit({
  ownerId: true,
});

export const clientFinancialSettingsSchema = z.object({
  organizationId: uuidSchema,
  sourceCurrency: z.enum(['DZD', 'USD', 'EUR', 'AED', 'GBP', 'MAD', 'TND', 'INR']),
  exchangeRate: z.number().positive().finite(),
  discountPercentage: z.number().min(0).max(1).default(0),
  customVatRate: z.number().min(0).max(1).nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type ClientFinancialSettingsInput = z.infer<typeof clientFinancialSettingsSchema>;
