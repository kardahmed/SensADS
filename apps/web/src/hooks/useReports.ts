/**
 * useReports — Liste/insère des rapports campagne (table reports).
 *
 * Le PDF est généré côté client via @react-pdf/renderer ; on persiste seulement
 * la trace (qui a généré quoi, quand, sur quelle période) pour audit.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export interface Report {
  id: string;
  organizationId: string;
  campaignId: string | null;
  periodStart: string;
  periodEnd: string;
  title: string;
  language: 'fr' | 'en';
  pdfUrl: string | null;
  generatedBy: string;
  generatedAt: string;
}

interface DbRow {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  period_start: string;
  period_end: string;
  title: string;
  language: 'fr' | 'en';
  pdf_url: string | null;
  generated_by: string;
  generated_at: string;
}

function mapRow(row: DbRow): Report {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title,
    language: row.language,
    pdfUrl: row.pdf_url,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
  };
}

export function useReports(filters: { campaignId?: string } = {}) {
  return useQuery({
    queryKey: ['reports', filters],
    staleTime: CACHE_TIMES.invoices,
    queryFn: async (): Promise<Report[]> => {
      let q = supabase.from('reports').select('*').order('generated_at', { ascending: false }).limit(100);
      if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export interface CreateReportInput {
  organizationId: string;
  campaignId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  language: 'fr' | 'en';
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReportInput): Promise<Report> => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('reports')
        .insert({
          organization_id: input.organizationId,
          campaign_id: input.campaignId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          title: input.title,
          language: input.language,
          generated_by: userData.user?.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapRow(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
