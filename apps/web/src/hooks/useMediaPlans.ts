/**
 * useMediaPlans — Workflow Media Plan bidirectionnel (client → agence OU agence → client).
 *
 * Le créateur (client OU staff) remplit un brief structuré, soumet à l'autre partie pour
 * validation, puis l'agence convertit en campagnes via Edge Function.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export type MediaPlanStatus =
  | 'draft'
  | 'pending_other_party'
  | 'changes_requested'
  | 'approved'
  | 'converted'
  | 'rejected';

export type CreativeType = 'drive_link' | 'post_url' | 'uploaded_files' | 'mixed';
export type BillingParty = 'client' | 'agency';

export interface MediaPlanItem {
  id: string;
  mediaPlanId: string;
  position: number;
  campaignName: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  startDate: string;
  endDate: string;
  audienceDescription: string | null;
  audienceData: Record<string, unknown>;
  creativeType: CreativeType;
  driveLink: string | null;
  postUrl: string | null;
  uploadedFilePaths: string[];
  landingUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  notes: string | null;
  convertedCampaignId: string | null;
  createdAt: string;
}

export interface MediaPlan {
  id: string;
  number: string;
  organizationId: string;
  bdcId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  createdByRole: BillingParty;
  status: MediaPlanStatus;
  totalBudgetDzd: number;
  createdBy: string;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdAt: string;
  items?: MediaPlanItem[];
}

interface DbItem {
  id: string;
  media_plan_id: string;
  position: number;
  campaign_name: string;
  platform: string;
  optimization_goal: string;
  budget_dzd: number;
  start_date: string;
  end_date: string;
  audience_description: string | null;
  audience_data: Record<string, unknown>;
  creative_type: CreativeType;
  drive_link: string | null;
  post_url: string | null;
  uploaded_file_paths: string[];
  landing_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  notes: string | null;
  converted_campaign_id: string | null;
  created_at: string;
}

interface DbPlan {
  id: string;
  number: string;
  organization_id: string;
  bdc_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_by_role: BillingParty;
  status: MediaPlanStatus;
  total_budget_dzd: number;
  created_by: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  converted_at: string | null;
  notes: string | null;
  created_at: string;
  media_plan_items?: DbItem[];
}

function mapItem(row: DbItem): MediaPlanItem {
  return {
    id: row.id,
    mediaPlanId: row.media_plan_id,
    position: row.position,
    campaignName: row.campaign_name,
    platform: row.platform,
    optimizationGoal: row.optimization_goal,
    budgetDzd: Number(row.budget_dzd),
    startDate: row.start_date,
    endDate: row.end_date,
    audienceDescription: row.audience_description,
    audienceData: row.audience_data ?? {},
    creativeType: row.creative_type,
    driveLink: row.drive_link,
    postUrl: row.post_url,
    uploadedFilePaths: Array.isArray(row.uploaded_file_paths) ? row.uploaded_file_paths : [],
    landingUrl: row.landing_url,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmTerm: row.utm_term,
    utmContent: row.utm_content,
    notes: row.notes,
    convertedCampaignId: row.converted_campaign_id,
    createdAt: row.created_at,
  };
}

function mapPlan(row: DbPlan): MediaPlan {
  return {
    id: row.id,
    number: row.number,
    organizationId: row.organization_id,
    bdcId: row.bdc_id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    createdByRole: row.created_by_role,
    status: row.status,
    totalBudgetDzd: Number(row.total_budget_dzd),
    createdBy: row.created_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
    convertedAt: row.converted_at,
    notes: row.notes,
    createdAt: row.created_at,
    items: (row.media_plan_items ?? []).map(mapItem).sort((a, b) => a.position - b.position),
  };
}

export function useMediaPlans(filters: { organizationId?: string; status?: MediaPlanStatus | '' } = {}) {
  return useQuery({
    queryKey: ['media-plans', filters],
    staleTime: CACHE_TIMES.default,
    queryFn: async (): Promise<MediaPlan[]> => {
      let q = supabase
        .from('media_plans')
        .select('*, media_plan_items(*)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.organizationId) q = q.eq('organization_id', filters.organizationId);
      if (filters.status) q = q.eq('status', filters.status);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapPlan(r as never));
    },
  });
}

export function useMediaPlan(id: string | undefined) {
  return useQuery({
    queryKey: ['media-plan', id],
    enabled: !!id,
    queryFn: async (): Promise<MediaPlan | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('media_plans')
        .select('*, media_plan_items(*)')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return mapPlan(data as never);
    },
  });
}

export interface CreateMediaPlanInput {
  organizationId: string;
  bdcId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  createdByRole: BillingParty;
  notes?: string;
}

export function useCreateMediaPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMediaPlanInput): Promise<MediaPlan> => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('media_plans')
        .insert({
          organization_id: input.organizationId,
          bdc_id: input.bdcId,
          title: input.title,
          description: input.description ?? null,
          start_date: input.startDate,
          end_date: input.endDate,
          created_by_role: input.createdByRole,
          notes: input.notes ?? null,
          created_by: userData.user?.id,
          status: 'draft',
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapPlan({ ...(data as DbPlan), media_plan_items: [] });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media-plans'] });
    },
  });
}

export interface UpsertMediaPlanItemInput {
  id?: string;
  mediaPlanId: string;
  position: number;
  campaignName: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  startDate: string;
  endDate: string;
  audienceDescription?: string;
  creativeType?: CreativeType;
  driveLink?: string;
  postUrl?: string;
  landingUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  notes?: string;
}

export function useUpsertMediaPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMediaPlanItemInput): Promise<MediaPlanItem> => {
      const payload = {
        media_plan_id: input.mediaPlanId,
        position: input.position,
        campaign_name: input.campaignName,
        platform: input.platform,
        optimization_goal: input.optimizationGoal,
        budget_dzd: input.budgetDzd,
        start_date: input.startDate,
        end_date: input.endDate,
        audience_description: input.audienceDescription ?? null,
        creative_type: input.creativeType ?? 'drive_link',
        drive_link: input.driveLink ?? null,
        post_url: input.postUrl ?? null,
        landing_url: input.landingUrl ?? null,
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        notes: input.notes ?? null,
      };

      const query = input.id
        ? supabase.from('media_plan_items').update(payload).eq('id', input.id).select('*').single()
        : supabase.from('media_plan_items').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error) throw error;

      // Refresh total_budget_dzd on the plan
      const { data: items } = await supabase
        .from('media_plan_items')
        .select('budget_dzd')
        .eq('media_plan_id', input.mediaPlanId);
      const total = (items ?? []).reduce((s, i) => s + Number(i.budget_dzd), 0);
      await supabase.from('media_plans').update({ total_budget_dzd: total }).eq('id', input.mediaPlanId);

      return mapItem(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['media-plan', variables.mediaPlanId] });
      void qc.invalidateQueries({ queryKey: ['media-plans'] });
    },
  });
}

export function useDeleteMediaPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; mediaPlanId: string }) => {
      const { error } = await supabase.from('media_plan_items').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['media-plan', v.mediaPlanId] });
      void qc.invalidateQueries({ queryKey: ['media-plans'] });
    },
  });
}

export function useUpdateMediaPlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: MediaPlanStatus }) => {
      const { data: userData } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === 'pending_other_party') updates.submitted_at = new Date().toISOString();
      if (input.status === 'approved') {
        updates.approved_at = new Date().toISOString();
        updates.reviewed_by = userData.user?.id;
        updates.reviewed_at = new Date().toISOString();
      }
      if (input.status === 'changes_requested' || input.status === 'rejected') {
        updates.reviewed_by = userData.user?.id;
        updates.reviewed_at = new Date().toISOString();
      }
      const { error } = await supabase.from('media_plans').update(updates).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['media-plan', v.id] });
      void qc.invalidateQueries({ queryKey: ['media-plans'] });
    },
  });
}

// =================================================================
// COMMENTS
// =================================================================
export interface MediaPlanComment {
  id: string;
  mediaPlanId: string;
  mediaPlanItemId: string | null;
  authorId: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

interface DbComment {
  id: string;
  media_plan_id: string;
  media_plan_item_id: string | null;
  author_id: string;
  body: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function useMediaPlanComments(mediaPlanId: string | undefined) {
  return useQuery({
    queryKey: ['media-plan-comments', mediaPlanId],
    enabled: !!mediaPlanId,
    queryFn: async (): Promise<MediaPlanComment[]> => {
      if (!mediaPlanId) return [];
      const { data, error } = await supabase
        .from('media_plan_comments')
        .select('*')
        .eq('media_plan_id', mediaPlanId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const c = r as DbComment;
        return {
          id: c.id,
          mediaPlanId: c.media_plan_id,
          mediaPlanItemId: c.media_plan_item_id,
          authorId: c.author_id,
          body: c.body,
          resolved: c.resolved,
          createdAt: c.created_at,
        };
      });
    },
  });
}

export function useAddMediaPlanComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mediaPlanId: string; mediaPlanItemId?: string; body: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('media_plan_comments').insert({
        media_plan_id: input.mediaPlanId,
        media_plan_item_id: input.mediaPlanItemId ?? null,
        author_id: userData.user?.id,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['media-plan-comments', v.mediaPlanId] });
    },
  });
}
