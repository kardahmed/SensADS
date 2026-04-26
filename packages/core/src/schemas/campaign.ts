import { z } from 'zod';
import { dateSchema, uuidSchema } from './common';

export const specialAdCategorySchema = z.enum([
  'none',
  'employment',
  'housing',
  'credit',
  'social_issues_elections',
]);

export const adSetSchema = z.object({
  name: z.string().min(1).max(200),
  budgetDzd: z.number().positive(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  targetingAge: z
    .object({
      min: z.number().int().min(13).max(65),
      max: z.number().int().min(13).max(65),
    })
    .refine((d) => d.min <= d.max, { message: 'age min <= age max' }),
  targetingGender: z.enum(['all', 'male', 'female']).default('all'),
  targetingLocations: z.array(z.string()).default([]),
  targetingInterests: z.array(z.string()).default([]),
  optimizationGoal: z.string(),
  bidStrategy: z.string().optional(),
});

export const adSchema = z.object({
  name: z.string().min(1).max(200),
  format: z.enum(['image', 'video', 'carousel', 'collection']),
  mediaUrl: z.string().url(),
  destinationUrl: z.string().url(),
  primaryText: z.string().max(2000).optional(),
  headline: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  callToAction: z.string().max(50).optional(),
});

export const createCampaignSchema = z
  .object({
    organizationId: uuidSchema,
    poId: uuidSchema,
    name: z.string().min(1).max(200),
    platform: z.string().min(1),
    optimizationGoal: z.string().min(1),
    budgetDzd: z.number().positive(),
    budgetMode: z.enum(['cbo', 'abo']),
    startDate: dateSchema,
    endDate: dateSchema.nullable().optional(),
    adAccountId: z.string().min(1),
    specialAdCategory: specialAdCategorySchema.default('none'),
    disclaimerText: z.string().max(500).nullable().optional(),
    adSets: z.array(adSetSchema).min(1, 'Au moins un ad set requis'),
    ads: z.array(adSchema).min(1, 'Au moins une annonce requise'),
  })
  .refine(
    (data) => {
      // Si catégorie spéciale = social/élections → disclaimer obligatoire
      if (
        data.specialAdCategory === 'social_issues_elections' &&
        (!data.disclaimerText || data.disclaimerText.trim().length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Disclaimer obligatoire pour catégorie social/élections',
      path: ['disclaimerText'],
    },
  )
  .refine(
    (data) => {
      // Mode ABO : somme(adsets.budget) <= campaign.budget
      if (data.budgetMode === 'abo') {
        const sum = data.adSets.reduce((acc, as) => acc + as.budgetDzd, 0);
        return sum <= data.budgetDzd;
      }
      return true;
    },
    {
      message: 'En mode ABO, la somme des budgets ad sets ne peut excéder le budget campagne',
      path: ['adSets'],
    },
  );

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type AdSetInput = z.infer<typeof adSetSchema>;
export type AdInput = z.infer<typeof adSchema>;
