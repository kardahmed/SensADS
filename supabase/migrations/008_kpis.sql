-- =================================================================
-- Migration 008 — Campaign KPIs (JSONB pattern)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : KPIs avec colonnes universelles + JSONB platform_metrics
-- Phase        : 8
-- Critique     : exchange_rate_snapshot figé à la saisie (audit F1)
-- =================================================================

CREATE TYPE kpi_source AS ENUM ('manual', 'api', 'ga4');

-- ============================================
-- TABLE : campaign_kpis
-- ============================================
CREATE TABLE campaign_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_set_id uuid REFERENCES ad_sets(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- ============================================
  -- KPIs UNIVERSELS (15 colonnes, présents sur toutes plateformes)
  -- ============================================
  spend decimal(15, 4) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  conversions bigint NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  reach bigint NOT NULL DEFAULT 0 CHECK (reach >= 0),
  frequency decimal(8, 4) NOT NULL DEFAULT 0 CHECK (frequency >= 0),
  cpm decimal(12, 4) NOT NULL DEFAULT 0,
  cpc decimal(12, 4) NOT NULL DEFAULT 0,
  ctr decimal(8, 4) NOT NULL DEFAULT 0,
  cpa decimal(12, 4) NOT NULL DEFAULT 0,
  conversion_value decimal(15, 4) NOT NULL DEFAULT 0,
  roas decimal(10, 4) NOT NULL DEFAULT 0,
  cost_per_result decimal(12, 4) NOT NULL DEFAULT 0,
  results bigint NOT NULL DEFAULT 0,
  video_views bigint NOT NULL DEFAULT 0,
  -- ============================================
  -- KPIs SPÉCIFIQUES PLATEFORME (JSONB extensible)
  -- ============================================
  platform_metrics jsonb NOT NULL DEFAULT '{}',
  -- ============================================
  -- CONVERSION DZD (snapshot figé)
  -- ============================================
  exchange_rate_snapshot decimal(15, 6) NOT NULL CHECK (exchange_rate_snapshot > 0),
  spend_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  conversion_value_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  -- ============================================
  -- SOURCE & AUDIT
  -- ============================================
  source kpi_source NOT NULL DEFAULT 'manual',
  external_id text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Unicité : un KPI par jour par (campaign, ad_set, source)
  CONSTRAINT campaign_kpis_unique_per_day UNIQUE (campaign_id, ad_set_id, date, source)
);

-- ============================================
-- INDEX critiques
-- ============================================
CREATE INDEX idx_kpis_campaign_date ON campaign_kpis(campaign_id, date DESC);
CREATE INDEX idx_kpis_ad_set_date ON campaign_kpis(ad_set_id, date DESC) WHERE ad_set_id IS NOT NULL;
CREATE INDEX idx_kpis_date ON campaign_kpis(date DESC);
-- Index GIN sur le JSONB pour requêtes sur platform_metrics
CREATE INDEX idx_kpis_platform_metrics ON campaign_kpis USING GIN (platform_metrics);

CREATE TRIGGER campaign_kpis_updated_at
  BEFORE UPDATE ON campaign_kpis
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TRIGGER : update campaign.total_spent_dzd
-- ============================================
-- À chaque insert/update KPI au niveau campagne, mettre à jour le total
-- de la campagne pour faciliter les requêtes sans agrégation.
CREATE OR REPLACE FUNCTION update_campaign_total_spent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  campaign_total_dzd decimal(15, 2);
  campaign_total_source decimal(15, 4);
BEGIN
  -- Recalculer uniquement si KPI au niveau campaign (pas ad_set)
  IF NEW.ad_set_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(spend_dzd), 0),
    COALESCE(SUM(spend), 0)
  INTO campaign_total_dzd, campaign_total_source
  FROM campaign_kpis
  WHERE campaign_id = NEW.campaign_id AND ad_set_id IS NULL;

  UPDATE campaigns
  SET total_spent_dzd = campaign_total_dzd,
      total_spent_source_currency = campaign_total_source
  WHERE id = NEW.campaign_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpis_update_campaign_total
  AFTER INSERT OR UPDATE ON campaign_kpis
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_total_spent();

-- ============================================
-- TABLE : kpi_display_settings (config par client)
-- ============================================
CREATE TABLE kpi_display_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- 9 catégories de KPIs (configurable par TM/Admin)
  show_engagement boolean NOT NULL DEFAULT true,
  show_video boolean NOT NULL DEFAULT true,
  show_conversions boolean NOT NULL DEFAULT true,
  show_audience boolean NOT NULL DEFAULT true,
  show_platform_specific boolean NOT NULL DEFAULT true,
  show_cost_metrics boolean NOT NULL DEFAULT true,
  show_revenue boolean NOT NULL DEFAULT true,
  show_quality_score boolean NOT NULL DEFAULT false,
  show_demographics boolean NOT NULL DEFAULT false,
  -- Liste blanche/noire de KPIs spécifiques (overrides catégories)
  enabled_kpis jsonb NOT NULL DEFAULT '[]',
  disabled_kpis jsonb NOT NULL DEFAULT '[]',
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER kpi_display_settings_updated_at
  BEFORE UPDATE ON kpi_display_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- VIEW : kpis_aggregated_per_campaign
-- ============================================
CREATE OR REPLACE VIEW kpis_aggregated_per_campaign AS
SELECT
  c.id AS campaign_id,
  c.organization_id,
  c.platform,
  COUNT(k.id) AS days_with_data,
  SUM(k.spend) AS total_spend_source,
  SUM(k.spend_dzd) AS total_spend_dzd,
  SUM(k.impressions) AS total_impressions,
  SUM(k.clicks) AS total_clicks,
  SUM(k.conversions) AS total_conversions,
  CASE WHEN SUM(k.impressions) > 0
    THEN ROUND((SUM(k.spend) / SUM(k.impressions) * 1000)::numeric, 4)
    ELSE 0
  END AS avg_cpm,
  CASE WHEN SUM(k.clicks) > 0
    THEN ROUND((SUM(k.spend) / SUM(k.clicks))::numeric, 4)
    ELSE 0
  END AS avg_cpc,
  CASE WHEN SUM(k.impressions) > 0
    THEN ROUND((SUM(k.clicks)::decimal / SUM(k.impressions) * 100)::numeric, 4)
    ELSE 0
  END AS avg_ctr,
  CASE WHEN SUM(k.conversions) > 0
    THEN ROUND((SUM(k.spend) / SUM(k.conversions))::numeric, 4)
    ELSE 0
  END AS avg_cpa
FROM campaigns c
LEFT JOIN campaign_kpis k ON k.campaign_id = c.id AND k.ad_set_id IS NULL
GROUP BY c.id, c.organization_id, c.platform;

-- ============================================
-- RLS POLICIES — campaign_kpis
-- ============================================
ALTER TABLE campaign_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpis_select_via_campaign" ON campaign_kpis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_kpis.campaign_id
        AND (
          is_admin()
          OR is_assigned_tm_of(c.organization_id)
          OR c.organization_id = current_org_id()
        )
    )
  );

-- INSERT : staff uniquement (clients ne saisissent JAMAIS de KPIs)
CREATE POLICY "kpis_insert_staff" ON campaign_kpis
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
        AND (is_admin() OR is_assigned_tm_of(c.organization_id))
    )
  );

CREATE POLICY "kpis_update_staff" ON campaign_kpis
  FOR UPDATE TO authenticated
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_kpis.campaign_id
        AND (is_admin() OR is_assigned_tm_of(c.organization_id))
    )
  )
  WITH CHECK (is_staff());

-- Pas de DELETE (on archive les KPIs)
-- ============================================
-- RLS POLICIES — kpi_display_settings
-- ============================================
ALTER TABLE kpi_display_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_display_select" ON kpi_display_settings
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR is_assigned_tm_of(organization_id)
    OR organization_id = current_org_id()
  );

CREATE POLICY "kpi_display_modify_staff" ON kpi_display_settings
  FOR ALL TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));
