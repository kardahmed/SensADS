-- =================================================================
-- Migration 004 — Client Tables
-- =================================================================
-- Date         : 2026-01-15
-- Description  : client_financial_settings, client_ad_accounts, sub_account_requests
-- Phase        : 3
-- =================================================================

-- ============================================
-- TABLE : client_financial_settings
-- ============================================
CREATE TABLE client_financial_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  source_currency currency_code NOT NULL DEFAULT 'USD',
  exchange_rate decimal(15, 6) NOT NULL CHECK (exchange_rate > 0),
  discount_percentage decimal(5, 4) NOT NULL DEFAULT 0
    CHECK (discount_percentage >= 0 AND discount_percentage <= 1),
  custom_vat_rate decimal(5, 4)
    CHECK (custom_vat_rate IS NULL OR (custom_vat_rate >= 0 AND custom_vat_rate <= 1)),
  payment_terms_days int NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER client_financial_settings_updated_at
  BEFORE UPDATE ON client_financial_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TRIGGER : track_exchange_rate_change
-- ============================================
-- À chaque changement du taux, archive l'ancien dans exchange_rate_history.
CREATE OR REPLACE FUNCTION track_exchange_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.exchange_rate != NEW.exchange_rate THEN
    -- Ferme l'historique précédent
    UPDATE exchange_rate_history
    SET effective_to = now()
    WHERE organization_id = NEW.organization_id
      AND currency = NEW.source_currency
      AND effective_to IS NULL;

    -- Insère le nouveau
    INSERT INTO exchange_rate_history (organization_id, currency, rate, created_by)
    VALUES (NEW.organization_id, NEW.source_currency, NEW.exchange_rate, auth.uid());
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO exchange_rate_history (organization_id, currency, rate, created_by)
    VALUES (NEW.organization_id, NEW.source_currency, NEW.exchange_rate, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER track_exchange_rate
  AFTER INSERT OR UPDATE ON client_financial_settings
  FOR EACH ROW
  EXECUTE FUNCTION track_exchange_rate_change();

-- ============================================
-- TABLE : client_ad_accounts
-- ============================================
CREATE TABLE client_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_account_id text NOT NULL,
  account_name text,
  account_currency currency_code NOT NULL DEFAULT 'USD',
  -- Tracking (pixel / GTM / GA4) — v3.0-INT-2
  pixel_id text,
  pixel_type text CHECK (pixel_type IS NULL OR pixel_type IN (
    'meta_pixel', 'google_tag', 'tiktok_pixel', 'snapchat_pixel',
    'linkedin_tag', 'twitter_pixel', 'custom'
  )),
  gtm_container_id text,
  ga4_measurement_id text,
  tracking_notes text,
  -- OAuth status (pour Meta)
  is_connected boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_account_unique UNIQUE (organization_id, platform, external_account_id)
);

CREATE INDEX idx_ad_accounts_org ON client_ad_accounts(organization_id);
CREATE INDEX idx_ad_accounts_platform ON client_ad_accounts(platform, status);

CREATE TRIGGER client_ad_accounts_updated_at
  BEFORE UPDATE ON client_ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : sub_account_requests
-- ============================================
CREATE TABLE sub_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  reason text NOT NULL,
  requested_count int NOT NULL CHECK (requested_count > 0 AND requested_count <= 50),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_account_requests_org ON sub_account_requests(organization_id, status);

-- ============================================
-- RLS POLICIES — client_financial_settings
-- ============================================
ALTER TABLE client_financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_settings_select_admin" ON client_financial_settings
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "fin_settings_select_tm" ON client_financial_settings
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "fin_settings_select_client" ON client_financial_settings
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "fin_settings_modify_staff" ON client_financial_settings
  FOR ALL TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

-- ============================================
-- RLS POLICIES — client_ad_accounts
-- ============================================
ALTER TABLE client_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_accounts_select_admin" ON client_ad_accounts
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "ad_accounts_select_tm" ON client_ad_accounts
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "ad_accounts_select_client" ON client_ad_accounts
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "ad_accounts_modify_staff" ON client_ad_accounts
  FOR ALL TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

-- ============================================
-- RLS POLICIES — sub_account_requests
-- ============================================
ALTER TABLE sub_account_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_requests_select_admin" ON sub_account_requests
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "sub_requests_select_org" ON sub_account_requests
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "sub_requests_insert_owner" ON sub_account_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
    AND requested_by = auth.uid()
  );

CREATE POLICY "sub_requests_update_admin" ON sub_account_requests
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
