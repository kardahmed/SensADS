/**
 * useClientFinancialSettings — Lecture + update des params financiers d'une org.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES, type ClientFinancialSettings, type CurrencyCode } from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface DbRow {
  organization_id: string;
  source_currency: CurrencyCode;
  exchange_rate: number;
  discount_percentage: number;
  custom_vat_rate: number | null;
  payment_terms_days: number;
  updated_at: string;
}

function mapRow(row: DbRow): ClientFinancialSettings {
  return {
    organizationId: row.organization_id,
    sourceCurrency: row.source_currency,
    exchangeRate: row.exchange_rate,
    discountPercentage: row.discount_percentage,
    customVatRate: row.custom_vat_rate,
    paymentTermsDays: row.payment_terms_days,
    updatedAt: row.updated_at,
  };
}

export function useClientFinancialSettings(
  organizationId: string | undefined,
): ReturnType<typeof useQuery<ClientFinancialSettings | null>> {
  return useQuery({
    queryKey: ['client-financial-settings', organizationId],
    enabled: !!organizationId,
    staleTime: CACHE_TIMES.organizations,
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('client_financial_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as never) : null;
    },
  });
}

export function useUpdateClientFinancialSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ClientFinancialSettings> & { organizationId: string }) => {
      const updates: Record<string, unknown> = {};
      if (input.sourceCurrency !== undefined) updates.source_currency = input.sourceCurrency;
      if (input.exchangeRate !== undefined) updates.exchange_rate = input.exchangeRate;
      if (input.discountPercentage !== undefined)
        updates.discount_percentage = input.discountPercentage;
      if (input.customVatRate !== undefined) updates.custom_vat_rate = input.customVatRate;
      if (input.paymentTermsDays !== undefined)
        updates.payment_terms_days = input.paymentTermsDays;

      const { data, error } = await supabase
        .from('client_financial_settings')
        .update(updates)
        .eq('organization_id', input.organizationId)
        .select('*')
        .single();
      if (error) throw error;
      return mapRow(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ['client-financial-settings', variables.organizationId],
      });
      void qc.invalidateQueries({ queryKey: ['exchange-rate-history', variables.organizationId] });
    },
  });
}

export function useExchangeRateHistory(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['exchange-rate-history', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('exchange_rate_history')
        .select('*')
        .eq('organization_id', organizationId)
        .order('effective_from', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}
