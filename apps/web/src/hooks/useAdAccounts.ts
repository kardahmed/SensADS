/**
 * useAdAccounts — CRUD des ad accounts (Meta/Google/etc.) d'une org.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdAccountCurrency } from '@sensads/core';
import { supabase } from '@/lib/supabase';

export type PixelType =
  | 'meta_pixel'
  | 'google_tag'
  | 'tiktok_pixel'
  | 'snapchat_pixel'
  | 'linkedin_tag'
  | 'twitter_pixel'
  | 'custom';

export interface AdAccount {
  id: string;
  organizationId: string;
  platform: string;
  externalAccountId: string;
  accountName: string | null;
  accountCurrency: AdAccountCurrency;
  pixelId: string | null;
  pixelType: PixelType | null;
  gtmContainerId: string | null;
  ga4MeasurementId: string | null;
  trackingNotes: string | null;
  isConnected: boolean;
  lastSyncAt: string | null;
  status: 'active' | 'paused' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  organization_id: string;
  platform: string;
  external_account_id: string;
  account_name: string | null;
  account_currency: AdAccountCurrency;
  pixel_id: string | null;
  pixel_type: PixelType | null;
  gtm_container_id: string | null;
  ga4_measurement_id: string | null;
  tracking_notes: string | null;
  is_connected: boolean;
  last_sync_at: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbRow): AdAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    accountCurrency: row.account_currency,
    pixelId: row.pixel_id,
    pixelType: row.pixel_type,
    gtmContainerId: row.gtm_container_id,
    ga4MeasurementId: row.ga4_measurement_id,
    trackingNotes: row.tracking_notes,
    isConnected: row.is_connected,
    lastSyncAt: row.last_sync_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useAdAccounts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['ad-accounts', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('client_ad_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as never));
    },
  });
}

export interface CreateAdAccountInput {
  organizationId: string;
  platform: string;
  externalAccountId: string;
  accountName?: string;
  accountCurrency?: AdAccountCurrency;
  pixelId?: string;
  pixelType?: PixelType;
  gtmContainerId?: string;
  ga4MeasurementId?: string;
  trackingNotes?: string;
}

export function useCreateAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAdAccountInput) => {
      const { data, error } = await supabase
        .from('client_ad_accounts')
        .insert({
          organization_id: input.organizationId,
          platform: input.platform,
          external_account_id: input.externalAccountId,
          account_name: input.accountName ?? null,
          account_currency: input.accountCurrency ?? 'USD',
          pixel_id: input.pixelId ?? null,
          pixel_type: input.pixelType ?? null,
          gtm_container_id: input.gtmContainerId ?? null,
          ga4_measurement_id: input.ga4MeasurementId ?? null,
          tracking_notes: input.trackingNotes ?? null,
          status: 'active',
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapRow(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['ad-accounts', variables.organizationId] });
    },
  });
}

export function useUpdateAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      organizationId,
      ...input
    }: Partial<CreateAdAccountInput> & { id: string; organizationId: string }) => {
      const updates: Record<string, unknown> = {};
      if (input.accountName !== undefined) updates.account_name = input.accountName;
      if (input.accountCurrency !== undefined) updates.account_currency = input.accountCurrency;
      if (input.pixelId !== undefined) updates.pixel_id = input.pixelId;
      if (input.pixelType !== undefined) updates.pixel_type = input.pixelType;
      if (input.gtmContainerId !== undefined) updates.gtm_container_id = input.gtmContainerId;
      if (input.ga4MeasurementId !== undefined) updates.ga4_measurement_id = input.ga4MeasurementId;
      if (input.trackingNotes !== undefined) updates.tracking_notes = input.trackingNotes;

      const { data, error } = await supabase
        .from('client_ad_accounts')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapRow(data as never);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['ad-accounts', variables.organizationId] });
    },
  });
}

export function useArchiveAdAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; organizationId: string }) => {
      const { error } = await supabase
        .from('client_ad_accounts')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, variables) => {
      void qc.invalidateQueries({ queryKey: ['ad-accounts', variables.organizationId] });
    },
  });
}
