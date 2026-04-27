/**
 * useQuotes — Hooks pour la gestion des devis.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CACHE_TIMES,
  dbQuoteToQuote,
  type CurrencyCode,
  type PaginatedResult,
  type Quote,
  type QuoteStatus,
} from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface QuotesFilters {
  page?: number;
  pageSize?: number;
  status?: QuoteStatus | '';
  organizationId?: string;
}

export function useQuotes(
  filters: QuotesFilters = {},
): ReturnType<typeof useQuery<PaginatedResult<Quote>>> {
  const { page = 1, pageSize = 20, status, organizationId } = filters;

  return useQuery({
    queryKey: ['quotes', { page, pageSize, status, organizationId }],
    staleTime: CACHE_TIMES.default,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('quotes')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (status) query = query.eq('status', status);
      if (organizationId) query = query.eq('organization_id', organizationId);

      const { data, count, error } = await query;
      if (error) throw error;

      const totalCount = count ?? 0;
      return {
        data: (data ?? []).map((row) => dbQuoteToQuote(row as never)),
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        pageSize,
      };
    },
  });
}

export interface QuoteWithLines extends Quote {
  lines: Array<{
    id: string;
    tariffId: string;
    quantity: number;
    effectivePurchasePriceUsd: number;
    effectiveSellingPriceUsd: number;
    unitPriceDzd: number;
    totalDzd: number;
    displayOrder: number;
    tariff: {
      platform: string;
      optimizationGoal: string;
      name: string;
    } | null;
  }>;
}

export function useQuote(id: string | undefined): ReturnType<typeof useQuery<QuoteWithLines | null>> {
  return useQuery({
    queryKey: ['quote', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('quotes')
        .select('*, quote_lines(*, platform_tariffs(platform, optimization_goal, name))')
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      const quote = dbQuoteToQuote(data as never);
      const linesRaw = (data as unknown as {
        quote_lines: Array<{
          id: string;
          tariff_id: string;
          quantity: number;
          effective_purchase_price_usd: number;
          effective_selling_price_usd: number;
          unit_price_dzd: number;
          total_dzd: number;
          display_order: number;
          platform_tariffs: { platform: string; optimization_goal: string; name: string } | null;
        }>;
      }).quote_lines;

      const lines = (linesRaw ?? [])
        .map((l) => ({
          id: l.id,
          tariffId: l.tariff_id,
          quantity: l.quantity,
          effectivePurchasePriceUsd: l.effective_purchase_price_usd,
          effectiveSellingPriceUsd: l.effective_selling_price_usd,
          unitPriceDzd: l.unit_price_dzd,
          totalDzd: l.total_dzd,
          displayOrder: l.display_order,
          tariff: l.platform_tariffs,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return { ...quote, lines };
    },
  });
}

export interface CreateQuoteInput {
  organizationId: string;
  notes?: string | null;
  validUntil?: string | null;
  lines: Array<{
    tariffId: string;
    quantity: number;
    effectivePurchasePriceUsd: number;
    effectiveSellingPriceUsd: number;
    unitPriceDzd: number;
    totalDzd: number;
  }>;
  subtotalDzd: number;
  discountPercentage: number;
  discountAmountDzd: number;
  vatRate: number;
  vatAmountDzd: number;
  totalDzd: number;
  exchangeRateSnapshot: Partial<Record<CurrencyCode, number>>;
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Non authentifié');

      // Insert quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          organization_id: input.organizationId,
          created_by: userId,
          status: 'draft',
          subtotal_dzd: input.subtotalDzd,
          discount_percentage: input.discountPercentage,
          discount_amount_dzd: input.discountAmountDzd,
          vat_rate: input.vatRate,
          vat_amount_dzd: input.vatAmountDzd,
          total_dzd: input.totalDzd,
          exchange_rate_snapshot: input.exchangeRateSnapshot,
          notes: input.notes ?? null,
          valid_until: input.validUntil ?? null,
        })
        .select('id')
        .single();

      if (quoteError || !quote) {
        throw new Error(`Échec création devis : ${quoteError?.message}`);
      }

      const quoteId = quote.id as string;

      // Insert lines
      if (input.lines.length > 0) {
        const linesToInsert = input.lines.map((line, index) => ({
          quote_id: quoteId,
          tariff_id: line.tariffId,
          quantity: line.quantity,
          effective_purchase_price_usd: line.effectivePurchasePriceUsd,
          effective_selling_price_usd: line.effectiveSellingPriceUsd,
          unit_price_dzd: line.unitPriceDzd,
          total_dzd: line.totalDzd,
          display_order: index,
        }));

        const { error: linesError } = await supabase.from('quote_lines').insert(linesToInsert);
        if (linesError) {
          // Rollback : delete quote
          await supabase.from('quotes').delete().eq('id', quoteId);
          throw new Error(`Échec ajout lignes : ${linesError.message}`);
        }
      }

      return quoteId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      newStatus,
      reason,
    }: {
      id: string;
      newStatus: QuoteStatus;
      reason?: string;
    }) => {
      const updates: Record<string, unknown> = { status: newStatus };
      const now = new Date().toISOString();

      if (newStatus === 'submitted') updates.submitted_at = now;
      if (newStatus === 'approved') updates.approved_at = now;
      if (newStatus === 'accepted') updates.accepted_at = now;
      if (newStatus === 'rejected' && reason) updates.rejected_reason = reason;

      const { data, error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbQuoteToQuote(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      void qc.invalidateQueries({ queryKey: ['quote', variables.id] });
    },
  });
}
