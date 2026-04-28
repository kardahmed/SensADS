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
  // Config financière verrouillée à la création (Sprint 1)
  parallelRateLocked: number;
  feesPctLocked: number;
  divisorCurrent: number;
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePoInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: input.organizationId,
          quote_id: input.quoteId ?? null,
          parent_po_id: input.parentPoId ?? null,
          amount_ttc_dzd: input.amountTtcDzd,
          file_url: input.fileUrl ?? null,
          status: 'active',
          parallel_rate_locked: input.parallelRateLocked,
          fees_pct_locked: input.feesPctLocked,
          divisor_current: input.divisorCurrent,
          divisor_history: [
            {
              changed_at: new Date().toISOString(),
              from: null,
              to: input.divisorCurrent,
              note: 'Configuration initiale à la création du BDC',
              changed_by: userData.user?.id ?? null,
            },
          ],
        })
        .select('*')
        .single();
      if (error) throw error;

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

/**
 * Modifier le divisor d'un BDC en cours (avec note obligatoire).
 * Le trigger DB log_divisor_change exige une note >= 5 caractères.
 */
export function useUpdateBdcDivisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; newDivisor: number; note: string; marginImpactDzd?: number }) => {
      const { data: userData } = await supabase.auth.getUser();

      // Charger le BDC actuel pour récupérer divisor_history existant
      const { data: po, error: errLoad } = await supabase
        .from('purchase_orders')
        .select('divisor_current, divisor_history')
        .eq('id', input.id)
        .single();
      if (errLoad) throw errLoad;

      const oldDivisor = (po as { divisor_current: number }).divisor_current;
      const history = ((po as { divisor_history: unknown[] }).divisor_history ?? []) as unknown[];

      const newEntry = {
        changed_at: new Date().toISOString(),
        from: oldDivisor,
        to: input.newDivisor,
        note: input.note,
        changed_by: userData.user?.id ?? null,
        margin_impact_dzd: input.marginImpactDzd ?? null,
      };

      const { error } = await supabase
        .from('purchase_orders')
        .update({
          divisor_current: input.newDivisor,
          divisor_history: [...history, newEntry],
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['purchase-order', v.id] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

/**
 * Récupère le BDC avec sa config verrouillée + l'historique du divisor.
 * Utilise une requête raw car les colonnes Sprint 1 ne sont pas encore dans le mapper.
 */
export function useBdcWithConfig(id: string | undefined) {
  return useQuery({
    queryKey: ['bdc-config', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, number, parallel_rate_locked, fees_pct_locked, divisor_current, divisor_history, amount_ttc_dzd, consumed_amount_dzd, remaining_amount_dzd, status')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as {
        id: string;
        number: string;
        parallel_rate_locked: number | null;
        fees_pct_locked: number | null;
        divisor_current: number | null;
        divisor_history: Array<{
          changed_at: string;
          from: number | null;
          to: number;
          note: string;
          changed_by: string | null;
          margin_impact_dzd?: number | null;
        }>;
        amount_ttc_dzd: number;
        consumed_amount_dzd: number;
        remaining_amount_dzd: number;
        status: string;
      };
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
