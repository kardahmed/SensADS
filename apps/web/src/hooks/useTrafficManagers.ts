/**
 * useTrafficManagers — Liste des TMs pour dropdowns d'assignation.
 */

import { useQuery } from '@tanstack/react-query';
import { CACHE_TIMES, dbProfileToProfile } from '@sensads/core';
import type { Profile } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export function useTrafficManagers(): ReturnType<typeof useQuery<Profile[]>> {
  return useQuery({
    queryKey: ['profiles', 'traffic_managers'],
    staleTime: CACHE_TIMES.organizations,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'traffic_manager')
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((row) => dbProfileToProfile(row as never));
    },
  });
}
