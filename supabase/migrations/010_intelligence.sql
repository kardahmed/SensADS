-- =================================================================
-- Migration 010 — Intelligence (performance periods, analytics, suggestions)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Score de performance, agrégation périodes, suggestions
-- Phase        : 13
-- =================================================================

CREATE TYPE period_type AS ENUM ('daily', 'weekly', 'monthly');

CREATE TYPE performance_level AS ENUM ('low', 'normal', 'high', 'excellent');

CREATE TYPE suggestion_status AS ENUM (
  'pending',
  'sent_to_client',
  'approved',
  'rejected',
  'modified',
  'expired'
);

-- ============================================
-- TABLE : campaign_performance_periods
-- ============================================
CREATE TABLE campaign_performance_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform text NOT NULL,
  period_type period_type NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Agrégats KPIs
  total_spend_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  total_impressions bigint NOT NULL DEFAULT 0,
  total_clicks bigint NOT NULL DEFAULT 0,
  total_conversions bigint NOT NULL DEFAULT 0,
  avg_cpm decimal(12, 4) NOT NULL DEFAULT 0,
  avg_cpc decimal(12, 4) NOT NULL DEFAULT 0,
  avg_ctr decimal(8, 4) NOT NULL DEFAULT 0,
  avg_cpa decimal(12, 4) NOT NULL DEFAULT 0,
  -- Score 0-100
  performance_score int NOT NULL DEFAULT 50 CHECK (performance_score >= 0 AND performance_score <= 100),
  performance_level performance_level NOT NULL DEFAULT 'normal',
  metadata jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perf_periods_unique UNIQUE (campaign_id, period_type, period_start)
);

CREATE INDEX idx_perf_periods_org_platform ON campaign_performance_periods(
  organization_id, platform, period_type, period_start DESC
);

-- ============================================
-- TABLE : performance_analytics
-- ============================================
CREATE TABLE performance_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  metric_name text NOT NULL,
  metric_value decimal(15, 4) NOT NULL,
  benchmark_value decimal(15, 4),
  performance_level performance_level NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  z_score decimal(8, 4),
  metadata jsonb NOT NULL DEFAULT '{}',
  detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perf_analytics_lookup ON performance_analytics(
  organization_id, platform, metric_name, performance_level, period_start DESC
);

-- ============================================
-- TABLE : performance_suggestions
-- ============================================
CREATE TABLE performance_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  forecast_id uuid,  -- FK ajoutée à 011_forecasts
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  -- Contenu
  suggestion_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  recommended_action jsonb NOT NULL,
  expected_impact text,
  confidence_score decimal(5, 4) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  -- Workflow
  status suggestion_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  client_decision text,
  client_notes text,
  -- Audit
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX idx_suggestions_org_status ON performance_suggestions(organization_id, status, generated_at DESC);
CREATE INDEX idx_suggestions_forecast ON performance_suggestions(forecast_id) WHERE forecast_id IS NOT NULL;

-- ============================================
-- RLS POLICIES — campaign_performance_periods
-- ============================================
ALTER TABLE campaign_performance_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_periods_select_admin" ON campaign_performance_periods
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "perf_periods_select_tm" ON campaign_performance_periods
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "perf_periods_select_client" ON campaign_performance_periods
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

-- INSERT/UPDATE par Edge Function uniquement (service_role)

-- ============================================
-- RLS POLICIES — performance_analytics
-- ============================================
ALTER TABLE performance_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_analytics_select_staff" ON performance_analytics
  FOR SELECT TO authenticated
  USING (is_staff());

-- ============================================
-- RLS POLICIES — performance_suggestions
-- ============================================
ALTER TABLE performance_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_select_admin" ON performance_suggestions
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "suggestions_select_tm" ON performance_suggestions
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

-- Client voit uniquement les suggestions sent_to_client+
CREATE POLICY "suggestions_select_client" ON performance_suggestions
  FOR SELECT TO authenticated
  USING (
    organization_id = current_org_id()
    AND status IN ('sent_to_client', 'approved', 'rejected', 'modified', 'expired')
  );

CREATE POLICY "suggestions_modify_staff" ON performance_suggestions
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));
