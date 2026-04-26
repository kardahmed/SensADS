-- =================================================================
-- Migration 015 — Events (domain_events, webhooks, analytics_events)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Domain Events outbox + Webhooks sortants + Analytics
-- Phase        : 4 + 10
-- =================================================================

CREATE TYPE webhook_event_type AS ENUM (
  'campaign.submitted',
  'campaign.approved',
  'campaign.completed',
  'invoice.generated',
  'invoice.validated',
  'invoice.paid',
  'report.ready',
  'kpis.updated',
  'forecast.shared',
  'forecast.approved'
);

CREATE TYPE webhook_delivery_status AS ENUM (
  'pending',
  'in_progress',
  'success',
  'failed',
  'abandoned'
);

-- ============================================
-- TABLE : domain_events (outbox pattern)
-- ============================================
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL,
  -- Processing
  processed_at timestamptz,
  processing_attempts int NOT NULL DEFAULT 0,
  last_error text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_domain_events_pending ON domain_events(created_at)
  WHERE processed_at IS NULL;
CREATE INDEX idx_domain_events_org ON domain_events(organization_id, created_at DESC);
CREATE INDEX idx_domain_events_type ON domain_events(event_type, created_at DESC);

-- ============================================
-- HELPER : emit_event
-- ============================================
CREATE OR REPLACE FUNCTION emit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO domain_events (
    organization_id, event_type, entity_type, entity_id, payload
  ) VALUES (
    COALESCE(p_organization_id, current_org_id()),
    p_event_type, p_entity_type, p_entity_id, p_payload
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_event TO authenticated, service_role;

-- ============================================
-- TABLE : webhook_endpoints
-- ============================================
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  -- Secret chiffré (jamais exposé en API après création)
  secret_encrypted bytea NOT NULL,
  events jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  -- Tracking
  last_triggered_at timestamptz,
  last_status_code int,
  failure_count int NOT NULL DEFAULT 0,
  -- Audit
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(organization_id, is_active);

CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Vue safe sans le secret
CREATE OR REPLACE VIEW webhook_endpoints_safe AS
SELECT
  id, organization_id, url, events,
  is_active, last_triggered_at, last_status_code, failure_count,
  created_by, created_at, updated_at
FROM webhook_endpoints;

-- ============================================
-- TABLE : webhook_logs
-- ============================================
CREATE TABLE webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status_code int,
  response_body text,
  duration_ms int,
  attempt int NOT NULL DEFAULT 1,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_endpoint ON webhook_logs(endpoint_id, created_at DESC);

-- ============================================
-- TABLE : webhook_retry_queue (persistante)
-- ============================================
CREATE TABLE webhook_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_webhook_retry_pending ON webhook_retry_queue(next_retry_at)
  WHERE status IN ('pending', 'in_progress');

-- ============================================
-- TABLE : analytics_events
-- ============================================
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  session_id text,
  user_agent text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_user_time ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_analytics_event_time ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_org_time ON analytics_events(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- ============================================
-- RLS POLICIES
-- ============================================

-- domain_events : super_admin lecture, INSERT par helper
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_events_select_super_admin" ON domain_events
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- webhook_endpoints : ses propres endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON webhook_endpoints_safe TO authenticated;

CREATE POLICY "webhook_endpoints_select_own" ON webhook_endpoints
  FOR SELECT TO authenticated
  USING (
    organization_id = current_org_id()
    OR is_admin()
  );

CREATE POLICY "webhook_endpoints_modify_owner" ON webhook_endpoints
  FOR ALL TO authenticated
  USING (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
    AND created_by = auth.uid()
  );

-- webhook_logs : organisation lecture
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_select_via_endpoint" ON webhook_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints we
      WHERE we.id = webhook_logs.endpoint_id
        AND (we.organization_id = current_org_id() OR is_admin())
    )
  );

-- webhook_retry_queue : service_role uniquement
ALTER TABLE webhook_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_retry_select_admin" ON webhook_retry_queue
  FOR SELECT TO authenticated
  USING (is_admin());

-- analytics_events : INSERT par tous (côté front), lecture admin
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_insert_authenticated" ON analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );

CREATE POLICY "analytics_select_admin" ON analytics_events
  FOR SELECT TO authenticated
  USING (is_admin());
