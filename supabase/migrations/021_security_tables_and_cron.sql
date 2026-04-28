-- =================================================================
-- Migration 021 — Security Tables + pg_cron Scheduled Jobs
-- =================================================================
-- Date         : 2026-04-28
-- Description  : Sprint 3 — sécurité critique :
--                1. Table `gdpr_deletion_queue` pour les hard-delete RGPD T+30j
--                2. Table `webhook_events` pour les events Meta validés HMAC
--                3. pg_cron jobs planifiés :
--                     - refresh-meta-tokens (chaque jour 02h)
--                     - check-budget-alerts (toutes les heures)
--                     - process-gdpr-deletion-queue (chaque jour 03h)
--                     - backup-financial-data (chaque jour 03h30)
--                     - compute-performance-periods (dimanche 03h)
--                     - expire-stale-suggestions (chaque jour 04h)
--
-- Phase        : Sprint 3 — Sécurité critique
--
-- Rollback     :
--   SELECT cron.unschedule('refresh-meta-tokens');
--   SELECT cron.unschedule('check-budget-alerts');
--   SELECT cron.unschedule('process-gdpr-deletion-queue');
--   SELECT cron.unschedule('backup-financial-data');
--   SELECT cron.unschedule('compute-performance-periods');
--   SELECT cron.unschedule('expire-stale-suggestions');
--   DROP TABLE webhook_events CASCADE;
--   DROP TABLE gdpr_deletion_queue CASCADE;
-- =================================================================

-- =================================================================
-- 1) TABLE gdpr_deletion_queue (queue des hard-delete T+30j)
-- =================================================================
CREATE TABLE gdpr_deletion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),

  requested_at timestamptz NOT NULL DEFAULT now(),
  execute_at timestamptz NOT NULL,
  completed_at timestamptz,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  reason text,
  failure_reason text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gdpr_queue_pending ON gdpr_deletion_queue(execute_at) WHERE status = 'pending';
CREATE INDEX idx_gdpr_queue_user ON gdpr_deletion_queue(target_user_id);

ALTER TABLE gdpr_deletion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gdpr_queue_select_admin" ON gdpr_deletion_queue
  FOR SELECT TO authenticated
  USING (is_admin() OR target_user_id = auth.uid());

CREATE POLICY "gdpr_queue_modify_admin" ON gdpr_deletion_queue
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =================================================================
-- 2) TABLE webhook_events (events entrants Meta/etc, déjà validés HMAC)
-- =================================================================
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source text NOT NULL CHECK (source IN ('meta', 'tiktok', 'google', 'manual')),
  event_type text NOT NULL,
  payload jsonb NOT NULL,

  signature_validated boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),

  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,

  -- Retention 90j puis archive
  expires_at timestamptz GENERATED ALWAYS AS (received_at + interval '90 days') STORED
);

CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(received_at) WHERE processed = false;
CREATE INDEX idx_webhook_events_source ON webhook_events(source, event_type, received_at DESC);
CREATE INDEX idx_webhook_events_expires ON webhook_events(expires_at) WHERE processed = true;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_select_admin" ON webhook_events
  FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT/UPDATE seulement via service_role (Edge Functions)

-- =================================================================
-- 3) pg_cron extension
-- =================================================================
-- Vérifier que pg_cron est activé (sur Supabase Cloud Pro c'est OK)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =================================================================
-- 4) Helper : invoke Edge Function depuis pg_cron
-- =================================================================
-- pg_cron ne peut pas faire de HTTP par défaut. On utilise pg_net
-- pour invoquer les Edge Functions.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =================================================================
-- 5) JOBS pg_cron (configurer SUPABASE_URL + service_role en variable d'env)
-- =================================================================
-- Note : ces jobs nécessitent que les variables suivantes soient définies
-- côté Supabase (Settings → Database → Custom config) :
--   app.supabase_url      : https://wpzgkameosseflakslze.supabase.co
--   app.service_role_key  : (clé service_role secrète)
--
-- Si les variables ne sont pas définies, les jobs échoueront silencieusement.
-- À chaque déploiement, vérifier que les vars sont à jour.

-- Helper : invoque une Edge Function via pg_net
CREATE OR REPLACE FUNCTION invoke_edge_function(
  p_function_name text,
  p_body jsonb DEFAULT '{}'
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id bigint;
  v_supabase_url text;
  v_service_key text;
BEGIN
  v_supabase_url := COALESCE(current_setting('app.supabase_url', true), '');
  v_service_key := COALESCE(current_setting('app.service_role_key', true), '');

  IF v_supabase_url = '' OR v_service_key = '' THEN
    RAISE NOTICE 'app.supabase_url / app.service_role_key not configured. Skipping invoke_edge_function(%).', p_function_name;
    RETURN 0;
  END IF;

  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := p_body
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Job 1 : Refresh Meta tokens (chaque jour 02h)
SELECT cron.schedule(
  'refresh-meta-tokens',
  '0 2 * * *',
  $$
    SELECT public.invoke_edge_function('meta-refresh-tokens', '{}'::jsonb);
  $$
);

-- Job 2 : Vérifier les alertes budget (toutes les heures)
SELECT cron.schedule(
  'check-budget-alerts',
  '0 * * * *',
  $$
    SELECT public.invoke_edge_function('check-budget-alerts', '{}'::jsonb);
  $$
);

-- Job 3 : Processer la queue GDPR (chaque jour 03h)
SELECT cron.schedule(
  'process-gdpr-deletion-queue',
  '0 3 * * *',
  $$
    -- Appeler gdpr-delete-user-account avec mode=hard pour chaque entrée prête
    DO $cron$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT target_user_id FROM public.gdpr_deletion_queue
        WHERE status = 'pending' AND execute_at <= now()
        LIMIT 50
      LOOP
        PERFORM public.invoke_edge_function(
          'gdpr-delete-user-account',
          jsonb_build_object('mode', 'hard', 'userId', r.target_user_id::text)
        );
      END LOOP;
    END;
    $cron$;
  $$
);

-- Job 4 : Backup financial data (chaque jour 03h30)
SELECT cron.schedule(
  'backup-financial-data',
  '30 3 * * *',
  $$
    SELECT public.invoke_edge_function('backup-financial-data', '{}'::jsonb);
  $$
);

-- Job 5 : Compute performance periods (dimanche 03h)
SELECT cron.schedule(
  'compute-performance-periods',
  '0 3 * * 0',
  $$
    SELECT public.invoke_edge_function('compute-performance-periods', '{}'::jsonb);
  $$
);

-- Job 6 : Expire stale suggestions (chaque jour 04h)
SELECT cron.schedule(
  'expire-stale-suggestions',
  '0 4 * * *',
  $$
    UPDATE public.performance_suggestions
    SET status = 'expired'
    WHERE status IN ('pending', 'sent_to_client')
      AND expires_at IS NOT NULL
      AND expires_at < now();
  $$
);

-- Job 7 : Cleanup old webhook_events (chaque dimanche 04h)
SELECT cron.schedule(
  'cleanup-webhook-events',
  '0 4 * * 0',
  $$
    DELETE FROM public.webhook_events
    WHERE processed = true AND expires_at < now();
  $$
);

-- =================================================================
-- 6) Commentaires
-- =================================================================
COMMENT ON TABLE gdpr_deletion_queue IS
  'Queue des hard-delete RGPD à T+30j. Le cron job process-gdpr-deletion-queue
  appelle gdpr-delete-user-account?mode=hard pour chaque entrée prête.';

COMMENT ON TABLE webhook_events IS
  'Events entrants Meta/TikTok/Google déjà validés HMAC par les Edge Functions
  webhook. Rétention 90j puis cleanup auto.';

COMMENT ON FUNCTION invoke_edge_function IS
  'Helper pour invoker une Edge Function depuis pg_cron via pg_net.
  Utilise app.supabase_url + app.service_role_key (à configurer côté Supabase).';

-- =================================================================
-- FIN MIGRATION 021
-- =================================================================
