/**
 * useNotifications — Lecture + Realtime sur la table notifications.
 *
 * Filtre côté serveur via RLS (recipient_id = auth.uid()).
 * Realtime channel filtré (correction audit SC3) pour éviter broadcast.
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbNotificationToNotification } from '@sensads/core';
import type { Notification } from '@sensads/core';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export function useNotifications() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ['notifications', profile?.id],
    enabled: !!profile?.id,
    staleTime: 0,
    queryFn: async (): Promise<Notification[]> => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => dbNotificationToNotification(row as never));
    },
  });

  // Realtime subscription (silent fail si Realtime pas activé sur la table)
  useEffect(() => {
    if (!profile?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel(`notif-${profile.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${profile.id}`,
          },
          () => {
            void qc.invalidateQueries({ queryKey: ['notifications', profile.id] });
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || err) {
            // Realtime non disponible — silently fail
            // L'utilisateur devra refresh pour voir les nouvelles notifs
          }
        });
    } catch {
      // Pas de Realtime — pas grave, polling possible via React Query
    }

    return () => {
      if (channel) {
        void supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [profile?.id, qc]);

  return query;
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.isRead).length;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', profile?.id] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', profile.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', profile?.id] });
    },
  });
}
