/**
 * useBenchmarks — Lecture des benchmarks marché par plateforme.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export interface Benchmark {
  id: string;
  platform: string;
  optimizationGoal: string;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas: number;
  region: string;
  industry: string | null;
  sampleSize: number;
}

interface DbRow {
  id: string;
  platform: string;
  optimization_goal: string;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas: number;
  region: string;
  industry: string | null;
  sample_size: number;
}

function mapRow(row: DbRow): Benchmark {
  return {
    id: row.id,
    platform: row.platform,
    optimizationGoal: row.optimization_goal,
    cpm: row.cpm,
    cpc: row.cpc,
    ctr: row.ctr,
    cpa: row.cpa,
    roas: row.roas,
    region: row.region,
    industry: row.industry,
    sampleSize: row.sample_size,
  };
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks'],
    staleTime: CACHE_TIMES.benchmarks,
    queryFn: async (): Promise<Benchmark[]> => {
      const { data, error } = await supabase
        .from('global_benchmarks')
        .select('*')
        .order('platform')
        .order('optimization_goal');
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export function useUpdateBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Benchmark> & { id: string }) => {
      const updates: Record<string, unknown> = {};
      if (input.cpm !== undefined) updates.cpm = input.cpm;
      if (input.cpc !== undefined) updates.cpc = input.cpc;
      if (input.ctr !== undefined) updates.ctr = input.ctr;
      if (input.cpa !== undefined) updates.cpa = input.cpa;
      if (input.roas !== undefined) updates.roas = input.roas;
      if (input.sampleSize !== undefined) updates.sample_size = input.sampleSize;
      const { error } = await supabase.from('global_benchmarks').update(updates).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['benchmarks'] });
    },
  });
}
