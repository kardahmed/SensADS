/**
 * useBankExchangeRates — CRUD des taux interbancaires par devise.
 *
 * Réservé staff. Utilisé pour figer le taux du jour dans chaque KPI quotidien
 * (snapshot bank_rate_to_usd_snapshot) lors de la conversion compte pub → USD.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export interface BankExchangeRate {
  id: string;
  currency: string;
  rateToUsd: number;
  effectiveDate: string;
  source: 'manual' | 'forex_api' | 'meta_api' | 'imported';
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface DbRow {
  id: string;
  currency: string;
  rate_to_usd: number;
  effective_date: string;
  source: 'manual' | 'forex_api' | 'meta_api' | 'imported';
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

function mapRow(row: DbRow): BankExchangeRate {
  return {
    id: row.id,
    currency: row.currency,
    rateToUsd: Number(row.rate_to_usd),
    effectiveDate: row.effective_date,
    source: row.source,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function useBankExchangeRates(filters: { currency?: string } = {}) {
  return useQuery({
    queryKey: ['bank-exchange-rates', filters],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<BankExchangeRate[]> => {
      let q = supabase
        .from('bank_exchange_rates')
        .select('*')
        .order('currency')
        .order('effective_date', { ascending: false });
      if (filters.currency) q = q.eq('currency', filters.currency);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export function useLatestRatesByCurrency() {
  return useQuery({
    queryKey: ['bank-exchange-rates-latest'],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<Record<string, BankExchangeRate>> => {
      const { data, error } = await supabase
        .from('bank_exchange_rates')
        .select('*')
        .order('effective_date', { ascending: false });
      if (error) throw error;

      const result: Record<string, BankExchangeRate> = {};
      for (const row of (data ?? []) as DbRow[]) {
        if (!result[row.currency]) {
          result[row.currency] = mapRow(row);
        }
      }
      return result;
    },
  });
}

export interface CreateBankRateInput {
  currency: string;
  rateToUsd: number;
  effectiveDate?: string;
  notes?: string;
}

export function useCreateBankRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBankRateInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('bank_exchange_rates').insert({
        currency: input.currency,
        rate_to_usd: input.rateToUsd,
        effective_date: input.effectiveDate ?? new Date().toISOString().slice(0, 10),
        source: 'manual',
        notes: input.notes ?? null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bank-exchange-rates'] });
      void qc.invalidateQueries({ queryKey: ['bank-exchange-rates-latest'] });
    },
  });
}

export function useDeleteBankRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bank_exchange_rates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bank-exchange-rates'] });
      void qc.invalidateQueries({ queryKey: ['bank-exchange-rates-latest'] });
    },
  });
}
