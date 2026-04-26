-- =================================================================
-- Migration 011 — Budget Forecasts (Prévisions)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Prévisions budgétaires + 3 scénarios pess/réa/opt
-- Phase        : 13
-- =================================================================

CREATE TYPE forecast_status AS ENUM (
  'draft',
  'shared_with_client',
  'approved',
  'converted_to_quote',
  'expired'
);

CREATE TYPE forecast_scenario AS ENUM ('pessimistic', 'realistic', 'optimistic');

CREATE SEQUENCE forecast_number_seq START WITH 1;

-- ============================================
-- TABLE : budget_forecasts
-- ============================================
CREATE TABLE budget_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  -- Période prévisionnelle
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  -- Plateformes ciblées
  platforms jsonb NOT NULL DEFAULT '[]',
  total_budget_dzd decimal(15, 2) NOT NULL CHECK (total_budget_dzd > 0),
  -- Workflow
  status forecast_status NOT NULL DEFAULT 'draft',
  shared_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  converted_to_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  -- Compteurs
  suggestions_count int NOT NULL DEFAULT 0,
  suggestions_validated int NOT NULL DEFAULT 0,
  -- Snapshot
  exchange_rate_snapshot jsonb NOT NULL DEFAULT '{"DZD": 1}',
  metadata jsonb NOT NULL DEFAULT '{}',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecasts_org_status ON budget_forecasts(organization_id, status);
CREATE INDEX idx_forecasts_dates ON budget_forecasts(start_date, end_date);

CREATE TRIGGER budget_forecasts_updated_at
  BEFORE UPDATE ON budget_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger numérotation
CREATE OR REPLACE FUNCTION set_forecast_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq bigint;
  current_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number != '' THEN
    RETURN NEW;
  END IF;
  next_seq := nextval('forecast_number_seq');
  NEW.number := 'PREV-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER forecasts_set_number
  BEFORE INSERT ON budget_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION set_forecast_number();

-- ============================================
-- TABLE : forecast_scenarios (3 par forecast)
-- ============================================
CREATE TABLE forecast_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES budget_forecasts(id) ON DELETE CASCADE,
  scenario forecast_scenario NOT NULL,
  -- Projections
  estimated_impressions bigint NOT NULL DEFAULT 0,
  estimated_clicks bigint NOT NULL DEFAULT 0,
  estimated_conversions bigint NOT NULL DEFAULT 0,
  estimated_cpm decimal(12, 4) NOT NULL DEFAULT 0,
  estimated_cpc decimal(12, 4) NOT NULL DEFAULT 0,
  estimated_ctr decimal(8, 4) NOT NULL DEFAULT 0,
  estimated_cpa decimal(12, 4) NOT NULL DEFAULT 0,
  estimated_revenue_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecast_scenarios_unique UNIQUE (forecast_id, scenario)
);

CREATE INDEX idx_forecast_scenarios_forecast ON forecast_scenarios(forecast_id);

-- FK différée pour performance_suggestions.forecast_id
ALTER TABLE performance_suggestions
  ADD CONSTRAINT suggestions_forecast_fk
  FOREIGN KEY (forecast_id) REFERENCES budget_forecasts(id) ON DELETE CASCADE;

-- ============================================
-- TRIGGER : update suggestions_count
-- ============================================
CREATE OR REPLACE FUNCTION update_forecast_suggestions_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.forecast_id IS NOT NULL THEN
    UPDATE budget_forecasts
    SET
      suggestions_count = (
        SELECT count(*) FROM performance_suggestions WHERE forecast_id = NEW.forecast_id
      ),
      suggestions_validated = (
        SELECT count(*) FROM performance_suggestions
        WHERE forecast_id = NEW.forecast_id AND status = 'approved'
      )
    WHERE id = NEW.forecast_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER suggestions_update_forecast_counts
  AFTER INSERT OR UPDATE OF status ON performance_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_forecast_suggestions_counts();

-- ============================================
-- RLS POLICIES — budget_forecasts
-- ============================================
ALTER TABLE budget_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecasts_select_admin" ON budget_forecasts
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "forecasts_select_tm" ON budget_forecasts
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

-- Client voit ses forecasts shared+
CREATE POLICY "forecasts_select_client" ON budget_forecasts
  FOR SELECT TO authenticated
  USING (
    organization_id = current_org_id()
    AND status IN ('shared_with_client', 'approved', 'converted_to_quote')
  );

CREATE POLICY "forecasts_insert_staff" ON budget_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff()
    AND created_by = auth.uid()
    AND (is_admin() OR is_assigned_tm_of(organization_id))
  );

CREATE POLICY "forecasts_update_staff" ON budget_forecasts
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

-- Client peut approuver un forecast partagé
CREATE POLICY "forecasts_approve_client" ON budget_forecasts
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
    AND status = 'shared_with_client'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
    AND status IN ('approved', 'shared_with_client')
  );

-- ============================================
-- RLS POLICIES — forecast_scenarios
-- ============================================
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_scenarios_select" ON forecast_scenarios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_forecasts f
      WHERE f.id = forecast_scenarios.forecast_id
        AND (
          is_admin()
          OR is_assigned_tm_of(f.organization_id)
          OR (f.organization_id = current_org_id()
              AND f.status IN ('shared_with_client', 'approved', 'converted_to_quote'))
        )
    )
  );

CREATE POLICY "forecast_scenarios_modify_staff" ON forecast_scenarios
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_forecasts f
      WHERE f.id = forecast_scenarios.forecast_id
        AND (is_admin() OR is_assigned_tm_of(f.organization_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_forecasts f
      WHERE f.id = forecast_scenarios.forecast_id
        AND (is_admin() OR is_assigned_tm_of(f.organization_id))
    )
  );
