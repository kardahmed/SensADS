/**
 * useAppSettings — Singleton app_settings (TVA, devises, branding agence).
 */

import { useQuery } from '@tanstack/react-query';
import { CACHE_TIMES, dbAppSettingsToAppSettings } from '@sensads/core';
import type { AppSettings } from '@sensads/core';
import { supabase } from '@/lib/supabase';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function useAppSettings(): ReturnType<typeof useQuery<AppSettings | null>> {
  return useQuery({
    queryKey: ['app-settings'],
    staleTime: CACHE_TIMES.appSettings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', SETTINGS_ID)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return dbAppSettingsToAppSettings(data as never);
    },
  });
}
