/**
 * schemas/index.ts — Validation Zod (forms front + Edge Functions).
 *
 * Source unique pour valider les inputs côté client ET serveur.
 * Importée par formulaires React Hook Form + Edge Functions Deno.
 */

export * from './common';
export * from './profile';
export * from './organization';
export * from './tariff';
export * from './quote';
export * from './campaign';
export * from './kpi';
export * from './invoice';
export * from './webhook';
