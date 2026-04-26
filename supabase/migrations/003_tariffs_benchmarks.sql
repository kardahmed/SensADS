-- =================================================================
-- Migration 003 — Platform Tariffs + Global Benchmarks
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Grille tarifaire (58 tarifs) en USD + benchmarks MENA
-- Phase        : 2
-- Note         : Tarifs en USD (devise stable), conversion DZD à la lecture
--                via getCurrentRate(). Évite la volatilité DZD.
-- =================================================================

-- ============================================
-- TABLE : platform_tariffs
-- ============================================
CREATE TABLE platform_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  optimization_goal text NOT NULL,
  name text NOT NULL,
  -- Prix en USD (référence stable)
  purchase_price_usd decimal(12, 4) NOT NULL CHECK (purchase_price_usd > 0),
  selling_price_usd decimal(12, 4) NOT NULL CHECK (selling_price_usd > 0),
  -- Marge calculée
  margin_percentage decimal(8, 4) GENERATED ALWAYS AS (
    CASE
      WHEN purchase_price_usd > 0
      THEN (selling_price_usd - purchase_price_usd) / purchase_price_usd
      ELSE 0
    END
  ) STORED,
  -- Budget min en DZD (pour validation côté wizard)
  min_budget_dzd decimal(12, 2) NOT NULL DEFAULT 0 CHECK (min_budget_dzd >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_tariffs_unique UNIQUE (platform, optimization_goal, status),
  CONSTRAINT platform_tariffs_selling_gte_purchase CHECK (selling_price_usd >= purchase_price_usd)
);

CREATE INDEX idx_tariffs_platform_status ON platform_tariffs(platform, status);

CREATE TRIGGER platform_tariffs_updated_at
  BEFORE UPDATE ON platform_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : global_benchmarks
-- ============================================
CREATE TABLE global_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  optimization_goal text NOT NULL,
  -- Benchmarks (en USD)
  cpm decimal(10, 4) NOT NULL DEFAULT 0,
  cpc decimal(10, 4) NOT NULL DEFAULT 0,
  ctr decimal(8, 4) NOT NULL DEFAULT 0,
  cpa decimal(10, 4) NOT NULL DEFAULT 0,
  roas decimal(8, 4) NOT NULL DEFAULT 0,
  -- Métadonnées
  region text NOT NULL DEFAULT 'MENA',
  industry text,
  sample_size int NOT NULL DEFAULT 0,
  source text,
  -- Audit
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT benchmarks_unique UNIQUE (platform, optimization_goal, region, industry)
);

CREATE INDEX idx_benchmarks_platform_goal ON global_benchmarks(platform, optimization_goal);

CREATE TRIGGER global_benchmarks_updated_at
  BEFORE UPDATE ON global_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- VIEW : tariffs_with_margin (pour UI)
-- ============================================
CREATE OR REPLACE VIEW tariffs_with_margin AS
SELECT
  t.*,
  CASE
    WHEN t.margin_percentage >= 1 THEN 'high'
    WHEN t.margin_percentage >= 0.5 THEN 'medium'
    WHEN t.margin_percentage > 0 THEN 'low'
    ELSE 'negative'
  END AS margin_category
FROM platform_tariffs t
WHERE t.status = 'active';

-- ============================================
-- SEED — 58 tarifs (USD)
-- ============================================
-- Note : prix indicatifs. À ajuster avec l'équipe commerciale.
-- ============================================

INSERT INTO platform_tariffs (platform, optimization_goal, name, purchase_price_usd, selling_price_usd, min_budget_dzd) VALUES

-- ============ Facebook (5)
('facebook', 'cpc',          'CPC',          0.50,  1.20,  5000),
('facebook', 'cpm',          'CPM',          5.00, 12.00,  5000),
('facebook', 'cpa',          'CPA',         15.00, 30.00, 10000),
('facebook', 'conversions',  'Conversions', 18.00, 35.00, 15000),
('facebook', 'engagement',   'Engagement',   0.30,  0.80,  3000),

-- ============ Instagram (5)
('instagram', 'cpc',          'CPC',          0.55,  1.30,  5000),
('instagram', 'cpm',          'CPM',          5.50, 13.00,  5000),
('instagram', 'cpa',          'CPA',         16.00, 32.00, 10000),
('instagram', 'conversions',  'Conversions', 19.00, 36.00, 15000),
('instagram', 'engagement',   'Engagement',   0.35,  0.90,  3000),

-- ============ Google Search (5)
('google_search', 'cpc',          'CPC',          0.60,  1.50,  5000),
('google_search', 'cpa',          'CPA',         18.00, 36.00, 10000),
('google_search', 'conversions',  'Conversions', 22.00, 42.00, 15000),
('google_search', 'leads',        'Leads',       12.00, 25.00,  8000),
('google_search', 'sales',        'Sales',       25.00, 50.00, 20000),

-- ============ Google Display (5)
('google_display', 'cpc',          'CPC',         0.30,  0.80,  3000),
('google_display', 'cpm',          'CPM',         3.00,  8.00,  3000),
('google_display', 'cpa',          'CPA',        12.00, 25.00,  8000),
('google_display', 'awareness',    'Awareness',   2.50,  6.00,  3000),
('google_display', 'traffic',      'Traffic',     0.40,  1.00,  3000),

-- ============ YouTube (5)
('youtube', 'cpv',          'CPV',          0.05,  0.15,  3000),
('youtube', 'cpm',          'CPM',          4.00, 10.00,  5000),
('youtube', 'awareness',    'Awareness',    3.50,  9.00,  5000),
('youtube', 'traffic',      'Traffic',      0.50,  1.20,  3000),
('youtube', 'engagement',   'Engagement',   0.40,  1.00,  3000),

-- ============ Performance Max (5)
('performance_max', 'sales',        'Sales',       28.00, 55.00, 20000),
('performance_max', 'leads',        'Leads',       15.00, 30.00, 10000),
('performance_max', 'conversions',  'Conversions', 22.00, 44.00, 15000),
('performance_max', 'traffic',      'Traffic',      0.55,  1.30,  5000),
('performance_max', 'awareness',    'Awareness',    3.50,  9.00,  5000),

-- ============ Demand Gen (5)
('demand_gen', 'cpc',          'CPC',          0.45,  1.10,  5000),
('demand_gen', 'cpm',          'CPM',          4.00, 10.00,  5000),
('demand_gen', 'awareness',    'Awareness',    3.00,  7.50,  3000),
('demand_gen', 'traffic',      'Traffic',      0.50,  1.20,  5000),
('demand_gen', 'leads',        'Leads',       14.00, 28.00,  8000),

-- ============ TikTok (5)
('tiktok', 'cpc',          'CPC',          0.40,  1.00,  5000),
('tiktok', 'cpm',          'CPM',          4.50, 11.00,  5000),
('tiktok', 'cpa',          'CPA',         15.00, 30.00, 10000),
('tiktok', 'conversions',  'Conversions', 20.00, 38.00, 15000),
('tiktok', 'engagement',   'Engagement',   0.30,  0.80,  3000),

-- ============ Snapchat (5)
('snapchat', 'cpc',          'CPC',          0.45,  1.15,  5000),
('snapchat', 'cpm',          'CPM',          5.00, 12.00,  5000),
('snapchat', 'cpa',          'CPA',         16.00, 32.00, 10000),
('snapchat', 'conversions',  'Conversions', 21.00, 40.00, 15000),
('snapchat', 'awareness',    'Awareness',    4.00, 10.00,  5000),

-- ============ LinkedIn (4)
('linkedin', 'cpc',          'CPC',          5.00, 12.00, 10000),
('linkedin', 'cpm',          'CPM',         15.00, 35.00, 15000),
('linkedin', 'leads',        'Leads',       40.00, 80.00, 25000),
('linkedin', 'engagement',   'Engagement',   2.00,  5.00,  8000),

-- ============ Twitter / X (4)
('twitter', 'cpc',          'CPC',          0.55,  1.40,  5000),
('twitter', 'cpm',          'CPM',          5.50, 13.50,  5000),
('twitter', 'engagement',   'Engagement',   0.35,  0.90,  3000),
('twitter', 'awareness',    'Awareness',    4.00, 10.00,  5000);

-- Vérification
DO $$
DECLARE
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM platform_tariffs;
  IF cnt < 50 THEN
    RAISE EXCEPTION 'Seed tarifs incomplet : seulement % tarifs', cnt;
  END IF;
END $$;

-- ============================================
-- SEED — Benchmarks MENA placeholders
-- ============================================
-- Sample_size = 0 jusqu'à collecte de vraies données
INSERT INTO global_benchmarks (platform, optimization_goal, cpm, cpc, ctr, cpa, sample_size, region) VALUES
('facebook',        'cpc',          8,  0.65, 1.8,  18, 0, 'MENA'),
('facebook',        'conversions', 12,  1.20, 2.5,  25, 0, 'MENA'),
('instagram',       'cpc',          9,  0.70, 1.5,  20, 0, 'MENA'),
('google_search',   'cpc',         15,  0.85, 4.2,  22, 0, 'MENA'),
('google_display',  'cpm',          5,  0.40, 1.0,  15, 0, 'MENA'),
('youtube',         'cpv',          4,  0.10, 5.0,   0, 0, 'MENA'),
('tiktok',          'cpc',          7,  0.55, 2.2,  18, 0, 'MENA'),
('snapchat',        'cpc',          8,  0.60, 1.9,  20, 0, 'MENA'),
('linkedin',        'cpc',         20,  6.50, 0.8,  50, 0, 'MENA'),
('twitter',         'cpc',          9,  0.75, 1.6,  22, 0, 'MENA');

-- ============================================
-- TABLE : client_tariff_overrides (déclarée ici, RLS plus bas)
-- ============================================
CREATE TABLE client_tariff_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tariff_id uuid NOT NULL REFERENCES platform_tariffs(id) ON DELETE CASCADE,
  custom_purchase_price_usd decimal(12, 4)
    CHECK (custom_purchase_price_usd IS NULL OR custom_purchase_price_usd > 0),
  custom_selling_price_usd decimal(12, 4)
    CHECK (custom_selling_price_usd IS NULL OR custom_selling_price_usd > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_tariff_unique UNIQUE (organization_id, tariff_id),
  CONSTRAINT client_tariff_selling_gte_purchase CHECK (
    custom_selling_price_usd IS NULL
    OR custom_purchase_price_usd IS NULL
    OR custom_selling_price_usd >= custom_purchase_price_usd
  )
);

CREATE INDEX idx_client_overrides_org ON client_tariff_overrides(organization_id);

-- ============================================
-- RLS POLICIES — platform_tariffs
-- ============================================
ALTER TABLE platform_tariffs ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut LIRE les tarifs actifs
CREATE POLICY "tariffs_select_active" ON platform_tariffs
  FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY "tariffs_select_admin" ON platform_tariffs
  FOR SELECT TO authenticated
  USING (is_admin());

-- Seul super_admin peut INSERT/UPDATE/DELETE
CREATE POLICY "tariffs_modify_super_admin" ON platform_tariffs
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================
-- RLS POLICIES — global_benchmarks
-- ============================================
ALTER TABLE global_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmarks_select_authenticated" ON global_benchmarks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "benchmarks_modify_admin" ON global_benchmarks
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- RLS POLICIES — client_tariff_overrides
-- ============================================
ALTER TABLE client_tariff_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overrides_select_admin" ON client_tariff_overrides
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "overrides_select_tm" ON client_tariff_overrides
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "overrides_select_client" ON client_tariff_overrides
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "overrides_modify_staff" ON client_tariff_overrides
  FOR ALL TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));
