/**
 * useAgencyAdAccounts — Comptes publicitaires de l'agence (multi-devises).
 *
 * Réservé staff (RLS). Utilisés pour exécuter les campagnes en optimisant les coûts
 * (compte INR pour CPM bas, USD pour standard, etc.).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export interface AgencyAdAccount {
  id: string;
  name: string;
  platform: string;
  externalAccountId: string | null;
  accountCurrency: string;
  observedCpmAccountCurrency: number;
  status: 'active' | 'paused' | 'archived' | 'banned';
  isConnected: boolean;
  lastSyncAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  name: string;
  platform: string;
  external_account_id: string | null;
  account_currency: string;
  observed_cpm_account_currency: number;
  status: 'active' | 'paused' | 'archived' | 'banned';
  is_connected: boolean;
  last_sync_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapRow(row: DbRow): AgencyAdAccount {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    accountCurrency: row.account_currency,
    observedCpmAccountCurrency: Number(row.observed_cpm_account_currency),
    status: row.status,
    isConnected: row.is_connected,
    lastSyncAt: row.last_sync_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useAgencyAdAccounts(filters: { platform?: string; activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ['agency-ad-accounts', filters],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<AgencyAdAccount[]> => {
      let q = supabase
        .from('agency_ad_accounts')
        .select('*')
        .is('deleted_at', null)
        .order('account_currency')
        .order('name');

      if (filters.platform) q = q.eq('platform', filters.platform);
      if (filters.activeOnly) q = q.eq('status', 'active');

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export interface CreateAgencyAccountInput {
  name: string;
  platform: string;
  accountCurrency: string;
  observedCpmAccountCurrency: number;
  externalAccountId?: string;
  notes?: string;
}

export function useCreateAgencyAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgencyAccountInput): Promise<AgencyAdAccount> => {
      const { data, error } = await supabase
        .from('agency_ad_accounts')
        .insert({
          name: input.name,
          platform: input.platform,
          account_currency: input.accountCurrency,
          observed_cpm_account_currency: input.observedCpmAccountCurrency,
          external_account_id: input.externalAccountId ?? null,
          notes: input.notes ?? null,
          status: 'active',
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapRow(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agency-ad-accounts'] });
    },
  });
}

export function useUpdateAgencyAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      observedCpmAccountCurrency?: number;
      status?: 'active' | 'paused' | 'archived' | 'banned';
      notes?: string;
    }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.observedCpmAccountCurrency !== undefined)
        updates.observed_cpm_account_currency = input.observedCpmAccountCurrency;
      if (input.status !== undefined) updates.status = input.status;
      if (input.notes !== undefined) updates.notes = input.notes;

      const { error } = await supabase.from('agency_ad_accounts').update(updates).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agency-ad-accounts'] });
    },
  });
}

export function useDeleteAgencyAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agency_ad_accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agency-ad-accounts'] });
    },
  });
}
