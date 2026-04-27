/**
 * usePurchaseOrders — CRUD des BDC (Bons de commande).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CACHE_TIMES,
  dbPoToPo,
  type PaginatedResult,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface PoFilters {
  page?: number;
  pageSize?: number;
  status?: PurchaseOrderStatus | '';
  organizationId?: string;
}

export function usePurchaseOrders(
  filters: PoFilters = {},
): ReturnType<typeof useQuery<PaginatedResult<PurchaseOrder>>> {
  const { page = 1, pageSize = 20, status, organizationId } = filters;
  return useQuery({
    queryKey: ['purchase-orders', { page, pageSize, status, organizationId }],
    staleTime: CACHE_TIMES.default,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from('purchase_orders')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (status) query = query.eq('status', status);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, count, error } = await query;
      if (error) throw error;
      const totalCount = count ?? 0;
      return {
        data: (data ?? []).map((row) => dbPoToPo(row as never)),
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        pageSize,
      };
    },
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return dbPoToPo(data as never);
    },
  });
}

export interface CreatePoInput {
  organizationId: string;
  quoteId?: string;
  parentPoId?: string;
  amountTtcDzd: number;
  fileUrl?: string;
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePoInput) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: input.organizationId,
          quote_id: input.quoteId ?? null,
          parent_po_id: input.parentPoId ?? null,
          amount_ttc_dzd: input.amountTtcDzd,
          file_url: input.fileUrl ?? null,
          status: 'active',
        })
        .select('*')
        .single();
      if (error) throw error;

      // Si lié à un devis : marquer le devis comme converti
      if (input.quoteId) {
        await supabase
          .from('quotes')
          .update({ status: 'converted', converted_to_po_id: data.id })
          .eq('id', input.quoteId);
      }
      return dbPoToPo(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      void qc.invalidateQueries({ queryKey: ['quote'] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: userData.user?.id,
          cancellation_reason: reason,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbPoToPo(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useMarkPoPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbPoToPo(data as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
