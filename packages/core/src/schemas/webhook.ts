import { z } from 'zod';
import { uuidSchema } from './common';

export const webhookEventSchema = z.enum([
  'campaign.submitted',
  'campaign.approved',
  'campaign.completed',
  'invoice.generated',
  'invoice.validated',
  'invoice.paid',
  'report.ready',
  'kpis.updated',
  'forecast.shared',
  'forecast.approved',
]);

export const createWebhookEndpointSchema = z.object({
  organizationId: uuidSchema,
  url: z.string().url().refine((u) => u.startsWith('https://'), 'HTTPS uniquement'),
  events: z.array(webhookEventSchema).min(1),
});

export const testWebhookSchema = z.object({
  endpointId: uuidSchema,
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;
