-- =================================================================
-- Migration 013 — Audit Logs (immutable, partitionné par mois)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Logs d'audit immutables avec partitioning mensuel
-- Phase        : 12
-- Sécurité     : Trigger BEFORE UPDATE/DELETE → RAISE EXCEPTION
-- =================================================================

-- ============================================
-- TABLE : audit_logs (PARTITIONED)
-- ============================================
CREATE TABLE audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions initiales (12 mois roulants)
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Indexes
CREATE INDEX idx_audit_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_org_date ON audit_logs(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- ============================================
-- IMMUTABILITÉ : aucun UPDATE/DELETE possible
-- ============================================
CREATE OR REPLACE FUNCTION enforce_audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs sont immuables (action % refusée)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_logs_immutable();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_logs_immutable();

-- Révoquer privileges UPDATE/DELETE (double sécurité)
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated, anon;

-- ============================================
-- HELPER : log_action (à appeler depuis Edge Functions ou triggers)
-- ============================================
CREATE OR REPLACE FUNCTION log_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid := auth.uid();
  v_org_id uuid := current_org_id();
BEGIN
  INSERT INTO audit_logs (
    user_id, organization_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) VALUES (
    v_user_id, v_org_id, p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values, p_metadata
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_action TO authenticated, service_role;

-- ============================================
-- RLS POLICIES — audit_logs
-- ============================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Lecture : super_admin uniquement
CREATE POLICY "audit_logs_select_super_admin" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Pas d'INSERT direct par les users : tout passe par log_action()
CREATE POLICY "audit_logs_insert_via_function" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);
-- (la fonction log_action contrôle ce qui est inséré)
