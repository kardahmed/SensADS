/**
 * client.ts — Factory pour client Supabase typé.
 *
 * Usage front (apps/web) :
 *   const supabase = createSupabaseClient({
 *     url: import.meta.env.VITE_SUPABASE_URL,
 *     anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
 *   });
 *
 * Usage Edge Function (server) : utilise SERVICE_ROLE_KEY uniquement.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface SupabaseClientOptions {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  persistSession?: boolean;
}

export function createSupabaseClient(options: SupabaseClientOptions): SupabaseClient<Database> {
  const key = options.serviceRoleKey ?? options.anonKey;
  return createClient<Database>(options.url, key, {
    auth: {
      persistSession: options.persistSession ?? true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-application-name': 'sensads' },
    },
  });
}

/**
 * Crée un client server-side avec service role key.
 * À utiliser UNIQUEMENT dans les Edge Functions.
 */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type { SupabaseClient };
