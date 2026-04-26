/**
 * env.ts — Validation des variables d'environnement Vite.
 *
 * Fail-fast au démarrage si une variable critique manque.
 */

import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_APP_VERSION: z.string().default('0.1.0'),
  VITE_APP_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Variables d\'environnement invalides :', parsed.error.flatten().fieldErrors);
  throw new Error('Configuration env manquante. Voir apps/web/.env.example');
}

export const env = parsed.data;
export const isProduction = env.VITE_APP_ENV === 'production';
export const isDevelopment = env.VITE_APP_ENV === 'development';
