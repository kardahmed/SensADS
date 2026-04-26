/**
 * useTariffOverrides — Tarifs spéciaux par client.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbOverrideToOverride } from '@sensads/core';
import type { ClientTariffOverride } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export function useTariffOverrides(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['tariff-overrides', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('client_tariff_overrides')
        .select('*, platform_tariffs(platform, optimization_goal, name)')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        override: dbOverrideToOverride(row as never),
        tariff: (row as unknown as { platform_tariffs: { platform: string; optimization_goal: string; name: string } | null }).platform_tariffs,
      }));
    },
  });
}

export interface UpsertOverrideInput {
  organizationId: string;
  tariffId: string;
  customPurchasePriceUsd?: number | null;
  customSellingPriceUsd?: number | null;
  notes?: string | null;
}

export function useUpsertTariffOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertOverrideInput): Promise<ClientTariffOverride> => {
      const { data, error } = await supabase
        .from('client_tariff_overrides')
        .upsert(
          {
            organization_id: input.organizationId,
            tariff_id: input.tariffId,
            custom_purchase_price_usd: input.customPurchasePriceUsd ?? null,
            custom_selling_price_usd: input.customSellingPriceUsd ?? null,
            notes: input.notes ?? null,
          },
          { onConflict: 'organization_id,tariff_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return dbOverrideToOverride(data as never);
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tariff-overrides', v.organizationId] });
    },
  });
}

export function useDeleteTariffOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; organizationId: string }) => {
      const { error } = await supabase.from('client_tariff_overrides').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tariff-overrides', v.organizationId] });
    },
  });
}
