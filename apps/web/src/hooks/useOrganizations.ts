/**
 * useOrganizations — Hooks pour gestion des clients (organizations).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TIMES, dbOrganizationToOrganization } from '@sensads/core';
import type { Organization, PaginatedResult } from '@sensads/core';
import { supabase } from '@/lib/supabase';

interface OrganizationsFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  assignedTmId?: string;
  sandboxOnly?: boolean;
}

export function useOrganizations(
  filters: OrganizationsFilters = {},
): ReturnType<typeof useQuery<PaginatedResult<Organization>>> {
  const { page = 1, pageSize = 20, search, assignedTmId, sandboxOnly } = filters;

  return useQuery({
    queryKey: ['organizations', { page, pageSize, search, assignedTmId, sandboxOnly }],
    staleTime: CACHE_TIMES.organizations,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('organizations')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (search?.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }
      if (assignedTmId) {
        query = query.eq('assigned_tm_id', assignedTmId);
      }
      if (sandboxOnly) {
        query = query.eq('sandbox_mode', true);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const totalCount = count ?? 0;
      return {
        data: (data ?? []).map((row) => dbOrganizationToOrganization(row as never)),
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: page,
        pageSize,
      };
    },
  });
}

export function useOrganization(id: string | undefined): ReturnType<typeof useQuery<Organization | null>> {
  return useQuery({
    queryKey: ['organization', id],
    enabled: !!id,
    staleTime: CACHE_TIMES.organizations,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return dbOrganizationToOrganization(data as never);
    },
  });
}

export interface CreateClientPayload {
  // Owner user
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName: string;
  // Org
  orgName: string;
  legalName?: string;
  nif?: string;
  nis?: string;
  rc?: string;
  vatId?: string;
  address?: string;
  wilaya?: string;
  country?: string;
  phone?: string;
  email?: string;
  assignedTmId?: string;
  maxSubAccounts?: number;
  sandboxMode?: boolean;
  // Default financial settings
  sourceCurrency?: 'USD' | 'EUR' | 'AED' | 'GBP' | 'MAD' | 'TND' | 'INR' | 'DZD';
  exchangeRate?: number;
  discountPercentage?: number;
}

/**
 * Crée un client complet (auth user + organization + financial settings).
 *
 * Passe par l'Edge Function `admin-create-client` qui fait tout
 * de manière atomique avec service_role.
 */
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateClientPayload) => {
      const { data, error } = await supabase.functions.invoke('admin-create-client', {
        body: payload,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error.message ?? 'Création échouée');
      return data as { organizationId: string; ownerUserId: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Organization>) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.legalName !== undefined) dbUpdates.legal_name = updates.legalName;
      if (updates.nif !== undefined) dbUpdates.nif = updates.nif;
      if (updates.nis !== undefined) dbUpdates.nis = updates.nis;
      if (updates.rc !== undefined) dbUpdates.rc = updates.rc;
      if (updates.vatId !== undefined) dbUpdates.vat_id = updates.vatId;
      if (updates.address !== undefined) dbUpdates.address = updates.address;
      if (updates.wilaya !== undefined) dbUpdates.wilaya = updates.wilaya;
      if (updates.country !== undefined) dbUpdates.country = updates.country;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.assignedTmId !== undefined) dbUpdates.assigned_tm_id = updates.assignedTmId;
      if (updates.sandboxMode !== undefined) dbUpdates.sandbox_mode = updates.sandboxMode;
      if (updates.maxSubAccounts !== undefined) dbUpdates.max_sub_accounts = updates.maxSubAccounts;

      const { data, error } = await supabase
        .from('organizations')
        .update(dbUpdates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return dbOrganizationToOrganization(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['organizations'] });
      void qc.invalidateQueries({ queryKey: ['organization', variables.id] });
    },
  });
}
