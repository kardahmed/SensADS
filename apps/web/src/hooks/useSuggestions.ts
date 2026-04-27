/**
 * useSuggestions — Lecture/workflow des performance_suggestions.
 *
 * Génération via Edge Function `generate-suggestions` (rate-limité côté serveur).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export type SuggestionStatus =
  | 'pending'
  | 'sent_to_client'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'expired';

export interface PerformanceSuggestion {
  id: string;
  organizationId: string;
  campaignId: string | null;
  forecastId: string | null;
  suggestionType: string;
  title: string;
  description: string;
  recommendedAction: Record<string, unknown>;
  expectedImpact: string | null;
  confidenceScore: number | null;
  status: SuggestionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  clientDecision: string | null;
  clientNotes: string | null;
  generatedAt: string;
  expiresAt: string | null;
}

interface DbRow {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  forecast_id: string | null;
  suggestion_type: string;
  title: string;
  description: string;
  recommended_action: Record<string, unknown>;
  expected_impact: string | null;
  confidence_score: number | null;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  client_decision: string | null;
  client_notes: string | null;
  generated_at: string;
  expires_at: string | null;
}

function mapRow(row: DbRow): PerformanceSuggestion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    forecastId: row.forecast_id,
    suggestionType: row.suggestion_type,
    title: row.title,
    description: row.description,
    recommendedAction: row.recommended_action,
    expectedImpact: row.expected_impact,
    confidenceScore: row.confidence_score,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    clientDecision: row.client_decision,
    clientNotes: row.client_notes,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  };
}

export function useSuggestions(filters: { campaignId?: string; status?: SuggestionStatus | '' } = {}) {
  return useQuery({
    queryKey: ['suggestions', filters],
    staleTime: CACHE_TIMES.kpis,
    queryFn: async (): Promise<PerformanceSuggestion[]> => {
      let q = supabase.from('performance_suggestions').select('*').order('generated_at', { ascending: false }).limit(100);
      if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
      if (filters.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export function useGenerateSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campaignId?: string; forecastId?: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-suggestions', { body: input });
      if (error) throw error;
      return data as { generated: number };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });
}

export interface SuggestionDecisionInput {
  id: string;
  status: 'approved' | 'rejected' | 'sent_to_client' | 'modified';
  clientDecision?: string;
  clientNotes?: string;
}

export function useUpdateSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SuggestionDecisionInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = {
        status: input.status,
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      };
      if (input.clientDecision !== undefined) updates.client_decision = input.clientDecision;
      if (input.clientNotes !== undefined) updates.client_notes = input.clientNotes;
      const { error } = await supabase.from('performance_suggestions').update(updates).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });
}
