/**
 * useOrgMembers — Liste des profils (owner + members) d'une organisation.
 */

import { useQuery } from '@tanstack/react-query';
import { dbProfileToProfile } from '@sensads/core';
import type { Profile } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export function useOrgMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .in('role', ['client_owner', 'client_member'])
        .order('role')
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((row) => dbProfileToProfile(row as never));
    },
  });
}

export function useSubAccountRequests(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['sub-account-requests', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Array<{
      id: string;
      reason: string;
      requestedCount: number;
      status: 'pending' | 'approved' | 'rejected';
      createdAt: string;
    }>> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('sub_account_requests')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: (r as unknown as { id: string }).id,
        reason: (r as unknown as { reason: string }).reason,
        requestedCount: (r as unknown as { requested_count: number }).requested_count,
        status: (r as unknown as { status: 'pending' | 'approved' | 'rejected' }).status,
        createdAt: (r as unknown as { created_at: string }).created_at,
      }));
    },
  });
}

export type { Profile };
