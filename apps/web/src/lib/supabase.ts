/**
 * supabase.ts — Singleton Supabase client.
 *
 * Utilise le anon key (RLS appliquée). Le service_role n'est JAMAIS côté client.
 */

import { createSupabaseClient } from '@sensads/db';
import { env } from './env';

export const supabase = createSupabaseClient({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
  persistSession: true,
});

export type Supabase = typeof supabase;
