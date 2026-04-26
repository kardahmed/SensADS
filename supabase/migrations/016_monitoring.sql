-- =================================================================
-- Migration 016 — Monitoring (function_logs, error_logs, login_attempts)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Tables internes monitoring (Sentry/UptimeRobot remplacés)
-- Phase        : 12, 14
-- =================================================================

-- ============================================
-- TABLE : function_logs (logs Edge Functions)
-- ============================================
CREATE TABLE function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  request_id text,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  -- Status
  status text NOT NULL CHECK (status IN ('started', 'success', 'error')),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message text,
  -- Tracking
  duration_ms int,
  http_status int,
  params jsonb,
  error_message text,
  error_stack text,
  -- Audit
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_function_logs_function ON function_logs(function_name, started_at DESC);
CREATE INDEX idx_function_logs_errors ON function_logs(started_at DESC) WHERE status = 'error';
CREATE INDEX idx_function_logs_user ON function_logs(user_id, started_at DESC) WHERE user_id IS NOT NULL;

-- ============================================
-- TABLE : error_logs (erreurs frontend ErrorBoundary)
-- ============================================
CREATE TABLE error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  -- Error details
  message text NOT NULL,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  -- Context
  app_version text,
  environment text NOT NULL DEFAULT 'production',
  level text NOT NULL DEFAULT 'error' CHECK (level IN ('warn', 'error', 'fatal')),
  metadata jsonb NOT NULL DEFAULT '{}',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id)
);

CREATE INDEX idx_error_logs_unresolved ON error_logs(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_error_logs_user ON error_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ============================================
-- TABLE : login_attempts (rate limiting Auth)
-- ============================================
CREATE TABLE login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address inet,
  user_agent text,
  successful boolean NOT NULL,
  failure_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_email_recent ON login_attempts(email, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip_recent ON login_attempts(ip_address, attempted_at DESC) WHERE ip_address IS NOT NULL;

-- ============================================
-- HELPER : check_login_lockout
-- ============================================
CREATE OR REPLACE FUNCTION check_login_lockout(
  p_email text,
  p_max_attempts int DEFAULT 5,
  p_window_minutes int DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_failures int;
BEGIN
  SELECT count(*) INTO v_failures
  FROM login_attempts
  WHERE email = p_email
    AND successful = false
    AND attempted_at > now() - (p_window_minutes || ' minutes')::interval;

  RETURN v_failures >= p_max_attempts;
END;
$$;

GRANT EXECUTE ON FUNCTION check_login_lockout TO anon, authenticated, service_role;

-- ============================================
-- TABLE : edge_function_rate_limits
-- ============================================
CREATE TABLE edge_function_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ip_address inet,
  function_name text NOT NULL,
  resource_id uuid,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_user_function ON edge_function_rate_limits(
  user_id, function_name, attempted_at DESC
) WHERE user_id IS NOT NULL;

CREATE INDEX idx_rate_limits_resource ON edge_function_rate_limits(
  function_name, resource_id, attempted_at DESC
) WHERE resource_id IS NOT NULL;

-- Cleanup job : supprimer entries > 24h
-- (sera lancé par pg_cron dans Edge Function backup-financial-data)

-- ============================================
-- TABLE : compute_jobs (queue compute-performance)
-- ============================================
CREATE TABLE compute_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compute_jobs_pending ON compute_jobs(created_at) WHERE status = 'pending';
CREATE INDEX idx_compute_jobs_org ON compute_jobs(organization_id, created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE function_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_jobs ENABLE ROW LEVEL SECURITY;

-- function_logs : super_admin uniquement
CREATE POLICY "function_logs_select_super_admin" ON function_logs
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- error_logs : INSERT par tous (ErrorBoundary), lecture admin
CREATE POLICY "error_logs_insert" ON error_logs
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "error_logs_select_admin" ON error_logs
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "error_logs_resolve_admin" ON error_logs
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- login_attempts : INSERT par anon (login flow), lecture admin
CREATE POLICY "login_attempts_insert" ON login_attempts
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "login_attempts_select_admin" ON login_attempts
  FOR SELECT TO authenticated
  USING (is_admin());

-- edge_function_rate_limits : service_role uniquement
CREATE POLICY "rate_limits_select_admin" ON edge_function_rate_limits
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- compute_jobs : super_admin lecture
CREATE POLICY "compute_jobs_select_super_admin" ON compute_jobs
  FOR SELECT TO authenticated
  USING (is_super_admin());
