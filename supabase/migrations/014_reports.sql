-- =================================================================
-- Migration 014 — Reports + Report Jobs Queue
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Rapports PDF (génération côté client via react-pdf)
-- Phase        : 10
-- =================================================================

CREATE TYPE report_job_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- ============================================
-- TABLE : reports
-- ============================================
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  -- Plage temporelle
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Méta
  title text NOT NULL,
  language language_code NOT NULL DEFAULT 'fr',
  -- Storage
  pdf_url text,
  pdf_size_bytes bigint,
  -- Audit
  generated_by uuid NOT NULL REFERENCES profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_reports_org ON reports(organization_id, generated_at DESC);
CREATE INDEX idx_reports_campaign ON reports(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================
-- TABLE : report_jobs (queue)
-- ============================================
CREATE TABLE report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  status report_job_status NOT NULL DEFAULT 'queued',
  priority int NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  -- Inputs
  period_start date NOT NULL,
  period_end date NOT NULL,
  language language_code NOT NULL DEFAULT 'fr',
  options jsonb NOT NULL DEFAULT '{}',
  -- Tracking
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  -- Output
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  -- Audit
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_jobs_status ON report_jobs(status, priority DESC, requested_at);
CREATE INDEX idx_report_jobs_org ON report_jobs(organization_id, requested_at DESC);

CREATE TRIGGER report_jobs_updated_at
  BEFORE UPDATE ON report_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- RLS POLICIES — reports
-- ============================================
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "reports_select_tm" ON reports
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "reports_select_client" ON reports
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "reports_insert_authorized" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff()
    OR (organization_id = current_org_id() AND generated_by = auth.uid())
  );

-- ============================================
-- RLS POLICIES — report_jobs
-- ============================================
ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_jobs_select_admin" ON report_jobs
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "report_jobs_select_tm" ON report_jobs
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "report_jobs_select_client" ON report_jobs
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id() AND requested_by = auth.uid());

CREATE POLICY "report_jobs_insert" ON report_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      is_staff()
      OR organization_id = current_org_id()
    )
  );
