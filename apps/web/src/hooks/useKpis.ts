/**
 * useKpis — CRUD des KPIs campagne.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES, dbKpiToKpi } from '@sensads/core';
import type { CampaignKpi } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export function useCampaignKpis(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['kpis', campaignId],
    enabled: !!campaignId,
    staleTime: CACHE_TIMES.kpis,
    queryFn: async () => {
      if (!campaignId) return [];
      const { data, error } = await supabase
        .from('campaign_kpis')
        .select('*')
        .eq('campaign_id', campaignId)
        .is('ad_set_id', null)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => dbKpiToKpi(r as never));
    },
  });
}

export interface UpsertKpiInput {
  campaignId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach?: number;
  frequency?: number;
  exchangeRateSnapshot: number;
  spendDzd: number;
  source?: 'manual' | 'api' | 'ga4';
}

export function useUpsertKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertKpiInput): Promise<CampaignKpi> => {
      const { data: userData } = await supabase.auth.getUser();
      const cpm = input.impressions > 0 ? (input.spend / input.impressions) * 1000 : 0;
      const cpc = input.clicks > 0 ? input.spend / input.clicks : 0;
      const ctr = input.impressions > 0 ? input.clicks / input.impressions : 0;
      const cpa = input.conversions > 0 ? input.spend / input.conversions : 0;

      const { data, error } = await supabase
        .from('campaign_kpis')
        .upsert(
          {
            campaign_id: input.campaignId,
            ad_set_id: null,
            date: input.date,
            spend: input.spend,
            impressions: input.impressions,
            clicks: input.clicks,
            conversions: input.conversions,
            reach: input.reach ?? 0,
            frequency: input.frequency ?? 0,
            cpm,
            cpc,
            ctr,
            cpa,
            exchange_rate_snapshot: input.exchangeRateSnapshot,
            spend_dzd: input.spendDzd,
            source: input.source ?? 'manual',
            created_by: userData.user?.id,
          },
          { onConflict: 'campaign_id,ad_set_id,date,source' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return dbKpiToKpi(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['kpis', variables.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaign', variables.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useDeleteKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; campaignId: string }) => {
      const { error } = await supabase.from('campaign_kpis').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['kpis', v.campaignId] });
    },
  });
}
