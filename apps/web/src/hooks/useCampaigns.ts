/**
 * useCampaigns — CRUD campagnes + ad_sets + ads.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CACHE_TIMES,
  dbCampaignToCampaign,
  type CampaignStatus,
  type PaginatedResult,
  type Campaign,
  type SpecialAdCategory,
} from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface CampaignsFilters {
  page?: number;
  pageSize?: number;
  status?: CampaignStatus | '';
  organizationId?: string;
  platform?: string;
}

export function useCampaigns(
  filters: CampaignsFilters = {},
): ReturnType<typeof useQuery<PaginatedResult<Campaign>>> {
  const { page = 1, pageSize = 20, status, organizationId, platform } = filters;
  return useQuery({
    queryKey: ['campaigns', { page, pageSize, status, organizationId, platform }],
    staleTime: CACHE_TIMES.campaigns,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from('campaigns')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (status) query = query.eq('status', status);
      if (organizationId) query = query.eq('organization_id', organizationId);
      if (platform) query = query.eq('platform', platform);
      const { data, count, error } = await query;
      if (error) throw error;
      return {
        data: (data ?? []).map((row) => dbCampaignToCampaign(row as never)),
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
        currentPage: page,
        pageSize,
      };
    },
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaign', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('campaigns')
        .select('*, ad_sets(*, ads(*))')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    },
  });
}

export interface AdSetInput {
  name: string;
  budgetDzd?: number | null;
  startDate: string;
  endDate?: string | null;
  optimizationGoal?: string;
  bidStrategy?: string;
  targetingAgeMin?: number | null;
  targetingAgeMax?: number | null;
  targetingGender?: 'all' | 'male' | 'female';
  targetingLocations?: string[];
  targetingInterests?: string[];
}

export interface AdInput {
  name: string;
  format: 'image' | 'video' | 'carousel' | 'collection';
  mediaUrl: string;
  destinationUrl: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
}

export interface CreateCampaignInput {
  organizationId: string;
  poId: string;
  name: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  budgetMode: 'cbo' | 'abo';
  startDate: string;
  endDate?: string | null;
  adAccountId: string;
  specialAdCategory?: SpecialAdCategory;
  disclaimerText?: string | null;
  adSets: Array<AdSetInput & { ads: AdInput[] }>;
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Non authentifié');

      // Insert campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          organization_id: input.organizationId,
          po_id: input.poId,
          name: input.name,
          platform: input.platform,
          optimization_goal: input.optimizationGoal,
          budget_dzd: input.budgetDzd,
          budget_mode: input.budgetMode,
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          ad_account_id: input.adAccountId,
          special_ad_category: input.specialAdCategory ?? 'none',
          disclaimer_text: input.disclaimerText ?? null,
          status: 'in_review',
          submitted_at: new Date().toISOString(),
          created_by: userId,
        })
        .select('id')
        .single();

      if (campaignError || !campaign) {
        throw new Error(`Échec création campagne : ${campaignError?.message}`);
      }

      const campaignId = campaign.id as string;

      // Insert ad_sets + ads
      try {
        for (const adSet of input.adSets) {
          const { data: adSetRow, error: adSetError } = await supabase
            .from('ad_sets')
            .insert({
              campaign_id: campaignId,
              name: adSet.name,
              budget_dzd: adSet.budgetDzd ?? null,
              start_date: adSet.startDate,
              end_date: adSet.endDate ?? null,
              optimization_goal: adSet.optimizationGoal ?? null,
              bid_strategy: adSet.bidStrategy ?? null,
              targeting_age_min: adSet.targetingAgeMin ?? null,
              targeting_age_max: adSet.targetingAgeMax ?? null,
              targeting_gender: adSet.targetingGender ?? 'all',
              targeting_locations: adSet.targetingLocations ?? [],
              targeting_interests: adSet.targetingInterests ?? [],
            })
            .select('id')
            .single();
          if (adSetError || !adSetRow) {
            throw new Error(`Échec création ad_set "${adSet.name}" : ${adSetError?.message}`);
          }

          if (adSet.ads.length > 0) {
            const adsToInsert = adSet.ads.map((ad) => ({
              ad_set_id: adSetRow.id,
              name: ad.name,
              format: ad.format,
              media_url: ad.mediaUrl,
              destination_url: ad.destinationUrl,
              utm_source: ad.utmSource ?? null,
              utm_medium: ad.utmMedium ?? null,
              utm_campaign: ad.utmCampaign ?? null,
              utm_content: ad.utmContent ?? null,
              utm_term: ad.utmTerm ?? null,
              primary_text: ad.primaryText ?? null,
              headline: ad.headline ?? null,
              description: ad.description ?? null,
              call_to_action: ad.callToAction ?? null,
            }));
            const { error: adsError } = await supabase.from('ads').insert(adsToInsert);
            if (adsError) {
              throw new Error(`Échec création ads : ${adsError.message}`);
            }
          }
        }
      } catch (err) {
        // Rollback : delete campaign (cascade ad_sets + ads)
        await supabase.from('campaigns').delete().eq('id', campaignId);
        throw err;
      }

      return campaignId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useUpdateCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      newStatus,
      reason,
      externalId,
    }: {
      id: string;
      newStatus: CampaignStatus;
      reason?: string;
      externalId?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = { status: newStatus };
      const now = new Date().toISOString();
      if (newStatus === 'approved' || newStatus === 'active') {
        updates.approved_at = now;
        updates.approved_by = userData.user?.id;
      }
      if (newStatus === 'completed') updates.completed_at = now;
      if (newStatus === 'rejected' && reason) updates.rejected_reason = reason;
      if (externalId) updates.external_id = externalId;

      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbCampaignToCampaign(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaign', variables.id] });
    },
  });
}
