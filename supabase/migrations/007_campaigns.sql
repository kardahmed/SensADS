-- =================================================================
-- Migration 007 — Campaigns + Ad Sets + Ads
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Schéma campagnes (avec special_ad_category, ABO/CBO)
-- Phase        : 6
-- =================================================================

CREATE TYPE campaign_status AS ENUM (
  'draft',
  'in_review',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
  'cancelled'
);

CREATE TYPE budget_mode AS ENUM ('cbo', 'abo');

CREATE TYPE special_ad_category AS ENUM (
  'none',
  'employment',
  'housing',
  'credit',
  'social_issues_elections'
);

CREATE TYPE targeting_gender AS ENUM ('all', 'male', 'female');

CREATE TYPE ad_format AS ENUM ('image', 'video', 'carousel', 'collection');

CREATE SEQUENCE campaign_number_seq START WITH 1 NO MAXVALUE;

-- ============================================
-- TABLE : campaigns
-- ============================================
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  platform text NOT NULL,
  optimization_goal text NOT NULL,
  budget_dzd decimal(15, 2) NOT NULL CHECK (budget_dzd > 0),
  budget_mode budget_mode NOT NULL,
  start_date date NOT NULL,
  end_date date,
  ad_account_id text NOT NULL,
  special_ad_category special_ad_category NOT NULL DEFAULT 'none',
  disclaimer_text text,
  status campaign_status NOT NULL DEFAULT 'draft',
  external_id text,  -- ID Meta / autre plateforme
  -- Tracking dépenses
  total_spent_source_currency decimal(15, 4) NOT NULL DEFAULT 0,
  total_spent_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  -- Workflow timestamps
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  completed_at timestamptz,
  rejected_reason text,
  -- Audit
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Contraintes
  CONSTRAINT campaigns_disclaimer_required CHECK (
    special_ad_category != 'social_issues_elections' OR disclaimer_text IS NOT NULL
  ),
  CONSTRAINT campaigns_dates_valid CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT campaigns_unique_ad_account UNIQUE (ad_account_id, name)
);

CREATE INDEX idx_campaigns_org_status ON campaigns(organization_id, status);
CREATE INDEX idx_campaigns_po ON campaigns(po_id);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_active ON campaigns(id) WHERE status IN ('active', 'paused');

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger numérotation
CREATE OR REPLACE FUNCTION set_campaign_number()
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
  next_seq := nextval('campaign_number_seq');
  NEW.number := 'CAM-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER campaigns_set_number
  BEFORE INSERT ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION set_campaign_number();

-- ============================================
-- TABLE : ad_sets
-- ============================================
CREATE TABLE ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  budget_dzd decimal(15, 2) CHECK (budget_dzd IS NULL OR budget_dzd > 0),
  -- NULL en mode CBO, requis en mode ABO
  start_date date NOT NULL,
  end_date date,
  optimization_goal text,
  bid_strategy text,
  -- Targeting
  targeting_age_min int CHECK (targeting_age_min IS NULL OR (targeting_age_min >= 13 AND targeting_age_min <= 65)),
  targeting_age_max int CHECK (targeting_age_max IS NULL OR (targeting_age_max >= 13 AND targeting_age_max <= 65)),
  targeting_gender targeting_gender NOT NULL DEFAULT 'all',
  targeting_locations jsonb NOT NULL DEFAULT '[]',
  targeting_interests jsonb NOT NULL DEFAULT '[]',
  targeting_custom jsonb NOT NULL DEFAULT '{}',
  -- External
  external_id text,
  status text NOT NULL DEFAULT 'draft',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_sets_age_range_valid CHECK (
    targeting_age_min IS NULL OR targeting_age_max IS NULL OR targeting_age_min <= targeting_age_max
  )
);

CREATE INDEX idx_ad_sets_campaign ON ad_sets(campaign_id);

CREATE TRIGGER ad_sets_updated_at
  BEFORE UPDATE ON ad_sets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : ads
-- ============================================
CREATE TABLE ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id uuid NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  format ad_format NOT NULL,
  media_url text NOT NULL,
  destination_url text NOT NULL,
  -- UTM tracking (généré auto, modifiable)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  -- Contenu
  primary_text text CHECK (length(primary_text) <= 2000),
  headline text CHECK (length(headline) <= 255),
  description text CHECK (length(description) <= 500),
  call_to_action text,
  -- External
  external_id text,
  status text NOT NULL DEFAULT 'draft',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ads_ad_set ON ads(ad_set_id);

CREATE TRIGGER ads_updated_at
  BEFORE UPDATE ON ads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TRIGGER : enforce_abo_budget
-- ============================================
-- Mode ABO : somme(adsets.budget) <= campaign.budget
CREATE OR REPLACE FUNCTION enforce_abo_budget()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_campaign RECORD;
  total_adsets_budget decimal(15, 2);
BEGIN
  SELECT id, budget_dzd, budget_mode INTO parent_campaign
  FROM campaigns WHERE id = NEW.campaign_id;

  IF parent_campaign.budget_mode = 'abo' THEN
    IF NEW.budget_dzd IS NULL THEN
      RAISE EXCEPTION 'Mode ABO requiert un budget par ad set' USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(budget_dzd), 0) INTO total_adsets_budget
    FROM ad_sets
    WHERE campaign_id = NEW.campaign_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF total_adsets_budget + NEW.budget_dzd > parent_campaign.budget_dzd THEN
      RAISE EXCEPTION 'Somme des budgets ad sets (%) > budget campagne (%)',
        total_adsets_budget + NEW.budget_dzd, parent_campaign.budget_dzd
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ad_sets_enforce_abo
  BEFORE INSERT OR UPDATE ON ad_sets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_abo_budget();

-- ============================================
-- TRIGGER : enforce_special_category_constraints
-- ============================================
-- Catégorie spéciale Meta : force genre=all, age_min=18, pas d'intérêts
CREATE OR REPLACE FUNCTION enforce_special_category_constraints()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  campaign_category special_ad_category;
BEGIN
  SELECT special_ad_category INTO campaign_category
  FROM campaigns WHERE id = NEW.campaign_id;

  IF campaign_category != 'none' THEN
    -- Force genre = 'all'
    IF NEW.targeting_gender != 'all' THEN
      RAISE EXCEPTION 'Catégorie spéciale (%) impose targeting_gender = all', campaign_category
        USING ERRCODE = 'check_violation';
    END IF;
    -- Force age_min >= 18
    IF NEW.targeting_age_min IS NOT NULL AND NEW.targeting_age_min < 18 THEN
      RAISE EXCEPTION 'Catégorie spéciale (%) impose targeting_age_min >= 18', campaign_category
        USING ERRCODE = 'check_violation';
    END IF;
    -- Pas d'intérêts ciblés
    IF jsonb_array_length(NEW.targeting_interests) > 0 THEN
      RAISE EXCEPTION 'Catégorie spéciale (%) interdit le ciblage par intérêts', campaign_category
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ad_sets_enforce_special_category
  BEFORE INSERT OR UPDATE ON ad_sets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_special_category_constraints();

-- ============================================
-- RLS POLICIES — campaigns
-- ============================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_admin" ON campaigns
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "campaigns_select_tm" ON campaigns
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "campaigns_select_client" ON campaigns
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "campaigns_insert" ON campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_staff()) OR
    (organization_id = current_org_id()
      AND current_user_role() IN ('client_owner', 'client_member')
      AND created_by = auth.uid())
  );

CREATE POLICY "campaigns_update_staff" ON campaigns
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

CREATE POLICY "campaigns_update_owner_draft" ON campaigns
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
    AND status = 'draft'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
    AND status IN ('draft', 'in_review')
  );

-- ============================================
-- RLS POLICIES — ad_sets
-- ============================================
ALTER TABLE ad_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_sets_select_via_campaign" ON ad_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = ad_sets.campaign_id
        AND (
          is_admin()
          OR is_assigned_tm_of(c.organization_id)
          OR c.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "ad_sets_modify_via_campaign" ON ad_sets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = ad_sets.campaign_id
        AND c.status IN ('draft', 'in_review')
        AND (
          is_staff()
          OR (c.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = ad_sets.campaign_id
        AND c.status IN ('draft', 'in_review')
        AND (
          is_staff()
          OR (c.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  );

-- ============================================
-- RLS POLICIES — ads
-- ============================================
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ads_select_via_ad_set" ON ads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ad_sets ads_inner
      JOIN campaigns c ON c.id = ads_inner.campaign_id
      WHERE ads_inner.id = ads.ad_set_id
        AND (
          is_admin()
          OR is_assigned_tm_of(c.organization_id)
          OR c.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "ads_modify_via_ad_set" ON ads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ad_sets ads_inner
      JOIN campaigns c ON c.id = ads_inner.campaign_id
      WHERE ads_inner.id = ads.ad_set_id
        AND c.status IN ('draft', 'in_review')
        AND (
          is_staff()
          OR (c.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ad_sets ads_inner
      JOIN campaigns c ON c.id = ads_inner.campaign_id
      WHERE ads_inner.id = ads.ad_set_id
        AND c.status IN ('draft', 'in_review')
        AND (
          is_staff()
          OR (c.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  );
