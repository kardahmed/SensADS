/**
 * useInvoices — Lecture + génération auto-facture depuis campagne terminée.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CACHE_TIMES,
  dbInvoiceToInvoice,
  type InvoiceStatus,
  type Invoice,
  type PaginatedResult,
} from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface InvoicesFilters {
  page?: number;
  pageSize?: number;
  status?: InvoiceStatus | '';
  organizationId?: string;
}

export function useInvoices(
  filters: InvoicesFilters = {},
): ReturnType<typeof useQuery<PaginatedResult<Invoice>>> {
  const { page = 1, pageSize = 20, status, organizationId } = filters;
  return useQuery({
    queryKey: ['invoices', { page, pageSize, status, organizationId }],
    staleTime: CACHE_TIMES.default,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (status) query = query.eq('status', status);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, count, error } = await query;
      if (error) throw error;
      return {
        data: (data ?? []).map((r) => dbInvoiceToInvoice(r as never)),
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
        currentPage: page,
        pageSize,
      };
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return dbInvoiceToInvoice(data as never);
    },
  });
}

/**
 * Crée la facture depuis une campagne terminée via la fonction SQL `create_invoice_from_campaign`.
 */
export function useGenerateInvoiceFromCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId }: { campaignId: string }) => {
      const { data, error } = await supabase.rpc('create_invoice_from_campaign', {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useValidateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('invoices')
        .update({
          status: 'validated',
          validated_at: new Date().toISOString(),
          validated_by: userData.user?.id,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbInvoiceToInvoice(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paymentReference }: { id: string; paymentReference?: string }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_reference: paymentReference ?? null,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbInvoiceToInvoice(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
