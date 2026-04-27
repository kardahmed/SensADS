/**
 * useForecasts — CRUD prévisions budgétaires + scénarios (pessimiste/réaliste/optimiste).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export type ForecastStatus =
  | 'draft'
  | 'shared_with_client'
  | 'approved'
  | 'converted_to_quote'
  | 'expired';

export type ForecastScenarioType = 'pessimistic' | 'realistic' | 'optimistic';

export interface ForecastScenario {
  id: string;
  forecastId: string;
  scenario: ForecastScenarioType;
  estimatedImpressions: number;
  estimatedClicks: number;
  estimatedConversions: number;
  estimatedCpm: number;
  estimatedCpc: number;
  estimatedCtr: number;
  estimatedCpa: number;
  estimatedRevenueDzd: number;
}

export interface BudgetForecast {
  id: string;
  number: string;
  organizationId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  platforms: string[];
  totalBudgetDzd: number;
  status: ForecastStatus;
  sharedAt: string | null;
  approvedAt: string | null;
  convertedToQuoteId: string | null;
  suggestionsCount: number;
  suggestionsValidated: number;
  createdAt: string;
  scenarios?: ForecastScenario[];
}

interface DbForecast {
  id: string;
  number: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  platforms: string[];
  total_budget_dzd: number;
  status: ForecastStatus;
  shared_at: string | null;
  approved_at: string | null;
  converted_to_quote_id: string | null;
  suggestions_count: number;
  suggestions_validated: number;
  created_at: string;
  forecast_scenarios?: DbScenario[];
}

interface DbScenario {
  id: string;
  forecast_id: string;
  scenario: ForecastScenarioType;
  estimated_impressions: number;
  estimated_clicks: number;
  estimated_conversions: number;
  estimated_cpm: number;
  estimated_cpc: number;
  estimated_ctr: number;
  estimated_cpa: number;
  estimated_revenue_dzd: number;
}

function mapScenario(row: DbScenario): ForecastScenario {
  return {
    id: row.id,
    forecastId: row.forecast_id,
    scenario: row.scenario,
    estimatedImpressions: Number(row.estimated_impressions),
    estimatedClicks: Number(row.estimated_clicks),
    estimatedConversions: Number(row.estimated_conversions),
    estimatedCpm: Number(row.estimated_cpm),
    estimatedCpc: Number(row.estimated_cpc),
    estimatedCtr: Number(row.estimated_ctr),
    estimatedCpa: Number(row.estimated_cpa),
    estimatedRevenueDzd: Number(row.estimated_revenue_dzd),
  };
}

function mapForecast(row: DbForecast): BudgetForecast {
  return {
    id: row.id,
    number: row.number,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    totalBudgetDzd: Number(row.total_budget_dzd),
    status: row.status,
    sharedAt: row.shared_at,
    approvedAt: row.approved_at,
    convertedToQuoteId: row.converted_to_quote_id,
    suggestionsCount: row.suggestions_count,
    suggestionsValidated: row.suggestions_validated,
    createdAt: row.created_at,
    scenarios: (row.forecast_scenarios ?? []).map(mapScenario),
  };
}

export function useForecasts() {
  return useQuery({
    queryKey: ['forecasts'],
    staleTime: CACHE_TIMES.kpis,
    queryFn: async (): Promise<BudgetForecast[]> => {
      const { data, error } = await supabase
        .from('budget_forecasts')
        .select('*, forecast_scenarios(*)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r) => mapForecast(r as never));
    },
  });
}

export function useForecast(id: string | undefined) {
  return useQuery({
    queryKey: ['forecast', id],
    enabled: !!id,
    queryFn: async (): Promise<BudgetForecast | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('budget_forecasts')
        .select('*, forecast_scenarios(*)')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return mapForecast(data as never);
    },
  });
}

export interface CreateForecastInput {
  organizationId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  platforms: string[];
  totalBudgetDzd: number;
  scenarios: {
    scenario: ForecastScenarioType;
    estimatedImpressions: number;
    estimatedClicks: number;
    estimatedConversions: number;
    estimatedCpm: number;
    estimatedCpc: number;
    estimatedCtr: number;
    estimatedCpa: number;
    estimatedRevenueDzd: number;
  }[];
}

export function useCreateForecast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateForecastInput): Promise<BudgetForecast> => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: forecast, error } = await supabase
        .from('budget_forecasts')
        .insert({
          organization_id: input.organizationId,
          created_by: userData.user?.id,
          title: input.title,
          description: input.description ?? null,
          start_date: input.startDate,
          end_date: input.endDate,
          platforms: input.platforms,
          total_budget_dzd: input.totalBudgetDzd,
        })
        .select('*')
        .single();
      if (error) throw error;

      if (input.scenarios.length > 0) {
        const { error: scErr } = await supabase.from('forecast_scenarios').insert(
          input.scenarios.map((s) => ({
            forecast_id: forecast.id,
            scenario: s.scenario,
            estimated_impressions: s.estimatedImpressions,
            estimated_clicks: s.estimatedClicks,
            estimated_conversions: s.estimatedConversions,
            estimated_cpm: s.estimatedCpm,
            estimated_cpc: s.estimatedCpc,
            estimated_ctr: s.estimatedCtr,
            estimated_cpa: s.estimatedCpa,
            estimated_revenue_dzd: s.estimatedRevenueDzd,
          })),
        );
        if (scErr) throw scErr;
      }

      const { data: full } = await supabase
        .from('budget_forecasts')
        .select('*, forecast_scenarios(*)')
        .eq('id', forecast.id)
        .single();
      return mapForecast(full as never);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['forecasts'] });
    },
  });
}

export function useUpdateForecastStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ForecastStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === 'shared_with_client') updates.shared_at = new Date().toISOString();
      if (status === 'approved') updates.approved_at = new Date().toISOString();
      const { error } = await supabase.from('budget_forecasts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['forecasts'] });
      void qc.invalidateQueries({ queryKey: ['forecast', v.id] });
    },
  });
}
