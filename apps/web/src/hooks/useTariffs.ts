/**
 * useTariffs — Hook React Query pour la grille tarifaire.
 *
 * Lit la VIEW `tariffs_with_margin` (tarifs actifs + catégorie de marge).
 * staleTime long (10 min) car les tarifs changent rarement.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES, dbTariffToTariff } from '@sensads/core';
import type { CreateTariffInput, PlatformTariff, UpdateTariffInput } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export function useTariffs(): ReturnType<typeof useQuery<PlatformTariff[]>> {
  return useQuery({
    queryKey: ['tariffs'],
    staleTime: CACHE_TIMES.tariffs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_tariffs')
        .select('*')
        .eq('status', 'active')
        .order('platform')
        .order('optimization_goal');

      if (error) throw error;
      return (data ?? []).map((row) => dbTariffToTariff(row as never));
    },
  });
}

export function useArchivedTariffs(): ReturnType<typeof useQuery<PlatformTariff[]>> {
  return useQuery({
    queryKey: ['tariffs', 'archived'],
    staleTime: CACHE_TIMES.tariffs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_tariffs')
        .select('*')
        .eq('status', 'archived')
        .order('platform');
      if (error) throw error;
      return (data ?? []).map((row) => dbTariffToTariff(row as never));
    },
  });
}

export function useCreateTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTariffInput) => {
      const { data, error } = await supabase
        .from('platform_tariffs')
        .insert({
          platform: input.platform,
          optimization_goal: input.optimizationGoal,
          name: input.name,
          purchase_price_usd: input.purchasePriceUsd,
          selling_price_usd: input.sellingPriceUsd,
          min_budget_dzd: input.minBudgetDzd,
          status: input.status,
        })
        .select('*')
        .single();
      if (error) throw error;
      return dbTariffToTariff(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tariffs'] });
    },
  });
}

export function useUpdateTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTariffInput & { id: string }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.purchasePriceUsd !== undefined) updates.purchase_price_usd = input.purchasePriceUsd;
      if (input.sellingPriceUsd !== undefined) updates.selling_price_usd = input.sellingPriceUsd;
      if (input.minBudgetDzd !== undefined) updates.min_budget_dzd = input.minBudgetDzd;
      if (input.status !== undefined) updates.status = input.status;

      const { data, error } = await supabase
        .from('platform_tariffs')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbTariffToTariff(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tariffs'] });
    },
  });
}

export function useArchiveTariff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_tariffs')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tariffs'] });
    },
  });
}
