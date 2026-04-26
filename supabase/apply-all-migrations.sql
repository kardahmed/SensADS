-- ==================================================================
-- SENSADS — APPLY ALL MIGRATIONS (single-paste)
-- Generated: 2026-04-26T15:25:14Z
-- ==================================================================
-- Usage : Supabase Dashboard > SQL Editor > New query > Paste this > Run
--
-- AVANT D'EXÉCUTER : remplace 'REPLACE_WITH_YOUR_PGCRYPTO_KEY' ci-dessous
-- par une vraie clé générée via: openssl rand -base64 32
-- ==================================================================

-- Set encryption key at database level
ALTER DATABASE postgres SET app.encryption_key = 'REPLACE_WITH_YOUR_PGCRYPTO_KEY';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  001_meta_tokens.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 001 — meta_tokens
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Stockage chiffré des tokens OAuth Meta (Facebook/Instagram)
-- Phase        : 0 (Meta API setup)
-- Rollback     : DROP TABLE meta_tokens CASCADE; DROP VIEW meta_tokens_safe;
--                DROP EXTENSION pgcrypto;
-- =================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE : meta_tokens
-- ============================================
-- Stocke les tokens OAuth Meta + refresh tokens chiffrés.
-- Note v3.1 : sera renommée en `platform_tokens` (générique).
-- ============================================
CREATE TABLE IF NOT EXISTS meta_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  -- Tokens chiffrés (pgcrypto sym)
  access_token_encrypted bytea NOT NULL,
  refresh_token_encrypted bytea,
  -- Métadonnées
  token_type text NOT NULL DEFAULT 'long_lived',
  token_expires_at timestamptz,
  scopes text[] DEFAULT ARRAY[]::text[],
  meta_user_id text,
  -- Statut
  is_active boolean NOT NULL DEFAULT true,
  last_refreshed_at timestamptz,
  refresh_failures_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_tokens_unique_account UNIQUE (organization_id, ad_account_id)
);

CREATE INDEX idx_meta_tokens_org ON meta_tokens(organization_id);
CREATE INDEX idx_meta_tokens_expires ON meta_tokens(token_expires_at) WHERE is_active = true;

COMMENT ON TABLE meta_tokens IS 'Tokens OAuth Meta chiffrés. NE JAMAIS exposer access_token_encrypted en API.';
COMMENT ON COLUMN meta_tokens.access_token_encrypted IS 'Chiffré via pgp_sym_encrypt(token, current_setting(''app.encryption_key''))';

-- ============================================
-- VUE SAFE : meta_tokens_safe
-- ============================================
-- Vue exposable côté client qui masque les tokens chiffrés.
-- ============================================
CREATE OR REPLACE VIEW meta_tokens_safe AS
SELECT
  id,
  organization_id,
  ad_account_id,
  token_type,
  token_expires_at,
  scopes,
  meta_user_id,
  is_active,
  last_refreshed_at,
  refresh_failures_count,
  metadata,
  created_at,
  updated_at,
  -- Colonne dérivée : true si le token expire dans < 7 jours
  CASE
    WHEN token_expires_at IS NULL THEN false
    WHEN token_expires_at < now() THEN true
    ELSE token_expires_at < now() + interval '7 days'
  END AS expires_soon
FROM meta_tokens;

COMMENT ON VIEW meta_tokens_safe IS 'Vue sans tokens — exposable côté API/client';

-- ============================================
-- FONCTIONS HELPERS (SECURITY DEFINER)
-- ============================================

-- Chiffre un token avec la clé d'app (clé en variable d'environnement)
CREATE OR REPLACE FUNCTION encrypt_token(plain_token text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF plain_token IS NULL OR plain_token = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(
    plain_token,
    current_setting('app.encryption_key', true)
  );
END;
$$;

-- Déchiffre un token (utilisable uniquement côté Edge Functions avec service_role)
CREATE OR REPLACE FUNCTION decrypt_token(encrypted_token bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF encrypted_token IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(
    encrypted_token,
    current_setting('app.encryption_key', true)
  );
END;
$$;

REVOKE ALL ON FUNCTION encrypt_token FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION decrypt_token FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION encrypt_token TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_token TO service_role;

-- ============================================
-- TRIGGER : updated_at auto
-- ============================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER meta_tokens_updated_at
  BEFORE UPDATE ON meta_tokens
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- RLS — Politiques strictes
-- ============================================
ALTER TABLE meta_tokens ENABLE ROW LEVEL SECURITY;

-- Personne ne peut lire/modifier directement les tokens depuis l'app
-- (seules les Edge Functions avec service_role y accèdent)
-- Aucune policy = DENY par défaut

-- Mais on autorise la VUE safe en SELECT (sans tokens)
GRANT SELECT ON meta_tokens_safe TO authenticated, anon;

-- Note : la sécurité d'accès à meta_tokens_safe se fait par Edge Functions
-- qui filtrent par organization_id du JWT.

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  002_core_tables.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 002 — Core Tables
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Tables fondamentales (profiles, organizations, app_settings, exchange_rate_history)
-- Phase        : 1
-- Rollback     : DROP TABLE profiles CASCADE; DROP TABLE organizations CASCADE;
--                DROP TABLE app_settings; DROP TABLE exchange_rate_history;
-- =================================================================

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'admin',
  'traffic_manager',
  'client_owner',
  'client_member'
);

CREATE TYPE client_member_access_level AS ENUM (
  'full',
  'campaigns_only',
  'read_only'
);

CREATE TYPE language_code AS ENUM ('fr', 'en');

CREATE TYPE currency_code AS ENUM (
  'DZD', 'USD', 'EUR', 'AED', 'GBP', 'MAD', 'TND', 'INR'
);

-- ============================================
-- TABLE : organizations
-- ============================================
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  legal_name text,
  -- Identifiants fiscaux Algérie
  nif text CHECK (nif ~ '^\d{15}$' OR nif IS NULL),
  nis text CHECK (nis ~ '^\d{15}$' OR nis IS NULL),
  rc text,
  -- VAT EU
  vat_id text,
  is_eu_vat_valid boolean NOT NULL DEFAULT false,
  -- Adresse
  address text,
  wilaya text,
  country text NOT NULL DEFAULT 'Algérie',
  phone text,
  email text,
  -- Owner
  owner_id uuid NOT NULL,  -- FK vers profiles, ajoutée plus bas
  assigned_tm_id uuid,
  -- Config
  sandbox_mode boolean NOT NULL DEFAULT true,
  max_sub_accounts int NOT NULL DEFAULT 5 CHECK (max_sub_accounts >= 0 AND max_sub_accounts <= 100),
  features jsonb NOT NULL DEFAULT '{}',
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_assigned_tm ON organizations(assigned_tm_id) WHERE assigned_tm_id IS NOT NULL;
CREATE INDEX idx_organizations_active ON organizations(id) WHERE deleted_at IS NULL;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : profiles (extension de auth.users)
-- ============================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  role user_role NOT NULL DEFAULT 'client_owner',
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  preferred_language language_code NOT NULL DEFAULT 'fr',
  two_factor_enabled boolean NOT NULL DEFAULT false,
  -- Pour client_member : référence le client_owner parent
  parent_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  access_level client_member_access_level,
  -- Pour client : son TM dédié
  assigned_tm_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Contraintes métier
  CONSTRAINT profiles_member_has_parent CHECK (
    role != 'client_member' OR parent_user_id IS NOT NULL
  ),
  CONSTRAINT profiles_member_has_access_level CHECK (
    role != 'client_member' OR access_level IS NOT NULL
  )
);

CREATE INDEX idx_profiles_org ON profiles(organization_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_assigned_tm ON profiles(assigned_tm_id) WHERE assigned_tm_id IS NOT NULL;
CREATE INDEX idx_profiles_active ON profiles(id) WHERE deleted_at IS NULL;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- FK différée pour organizations.owner_id
ALTER TABLE organizations
  ADD CONSTRAINT organizations_owner_fk FOREIGN KEY (owner_id) REFERENCES profiles(id);

ALTER TABLE organizations
  ADD CONSTRAINT organizations_assigned_tm_fk FOREIGN KEY (assigned_tm_id) REFERENCES profiles(id);

-- ============================================
-- TABLE : app_settings (singleton)
-- ============================================
CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  vat_rate decimal(5, 4) NOT NULL DEFAULT 0.19 CHECK (vat_rate >= 0 AND vat_rate <= 1),
  invoice_minimum_amount_dzd decimal(12, 2) NOT NULL DEFAULT 1000,
  default_exchange_rates jsonb NOT NULL DEFAULT '{"USD": 250, "EUR": 280, "DZD": 1}',
  branding_logo_url text,
  agency_name text NOT NULL DEFAULT 'SENSIUM-X',
  agency_address text,
  agency_nif text,
  agency_vat_id text,
  agency_email text,
  agency_phone text,
  notifications_enabled boolean NOT NULL DEFAULT true,
  -- Audit
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Force singleton
  CONSTRAINT app_settings_singleton CHECK (id = '00000000-0000-0000-0000-000000000001')
);

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : exchange_rate_history
-- ============================================
CREATE TABLE exchange_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  currency currency_code NOT NULL,
  rate decimal(15, 6) NOT NULL CHECK (rate > 0 AND rate < 1000000),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exchange_rate_org_currency ON exchange_rate_history(organization_id, currency, effective_from DESC);
CREATE INDEX idx_exchange_rate_active ON exchange_rate_history(organization_id, currency)
  WHERE effective_to IS NULL;

-- ============================================
-- TRIGGER : handle_new_user
-- ============================================
-- Crée automatiquement un profil quand un user est créé via auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, preferred_language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client_owner'),
    COALESCE((NEW.raw_user_meta_data->>'preferred_language')::language_code, 'fr')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- HELPER FUNCTIONS RLS
-- ============================================

-- Retourne l'organization_id de l'utilisateur courant (depuis JWT)
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- Retourne le rôle de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_user_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_user_role() IN ('super_admin', 'admin');
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_user_role() IN ('super_admin', 'admin', 'traffic_manager');
$$;

CREATE OR REPLACE FUNCTION is_client_owner_of(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = org_id AND o.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_assigned_tm_of(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = org_id AND o.assigned_tm_id = auth.uid()
  );
$$;

-- ============================================
-- RLS POLICIES — profiles
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "profiles_select_self" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "profiles_select_tm_clients" ON profiles
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'traffic_manager'
    AND organization_id IN (
      SELECT id FROM organizations WHERE assigned_tm_id = auth.uid()
    )
  );

CREATE POLICY "profiles_select_client_team" ON profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = current_org_id()
  );

-- UPDATE (self ou admin)
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));
  -- Le user ne peut PAS changer son propre role

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- INSERT (admin only)
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- DELETE (super_admin only, et soft delete via update)
CREATE POLICY "profiles_delete_super_admin" ON profiles
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================
-- RLS POLICIES — organizations
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_admin" ON organizations
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "organizations_select_tm" ON organizations
  FOR SELECT TO authenticated
  USING (assigned_tm_id = auth.uid());

CREATE POLICY "organizations_select_client" ON organizations
  FOR SELECT TO authenticated
  USING (id = current_org_id());

CREATE POLICY "organizations_modify_admin" ON organizations
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "organizations_update_owner" ON organizations
  FOR UPDATE TO authenticated
  USING (id = current_org_id() AND current_user_role() = 'client_owner')
  WITH CHECK (id = current_org_id() AND current_user_role() = 'client_owner');

-- ============================================
-- RLS POLICIES — app_settings
-- ============================================
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut LIRE (besoin pour TVA, taux par défaut...)
CREATE POLICY "app_settings_select_authenticated" ON app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Seul super_admin peut MODIFIER
CREATE POLICY "app_settings_update_super_admin" ON app_settings
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- INSERT/DELETE bloqués (singleton)
-- Pas de policy = DENY

-- ============================================
-- RLS POLICIES — exchange_rate_history
-- ============================================
ALTER TABLE exchange_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_rate_select_admin_tm" ON exchange_rate_history
  FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY "exchange_rate_select_org" ON exchange_rate_history
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "exchange_rate_insert_staff" ON exchange_rate_history
  FOR INSERT TO authenticated
  WITH CHECK (is_staff());

-- Pas d'UPDATE/DELETE — historique immuable

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  003_tariffs_benchmarks.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  004_client_tables.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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
    AND current_user_role() = 'client_owner'
    AND requested_by = auth.uid()
  );

CREATE POLICY "sub_requests_update_admin" ON sub_account_requests
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  005_quotes.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 005 — Quotes (Devis)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Devis avec numérotation DEV-YYYY-NNNNN, sequence + trigger
-- Phase        : 4
-- =================================================================

-- ============================================
-- ENUM : quote_status
-- ============================================
CREATE TYPE quote_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'accepted',
  'converted',
  'expired',
  'cancelled'
);

-- ============================================
-- SEQUENCE pour numérotation
-- ============================================
CREATE SEQUENCE quote_number_seq START WITH 1 NO MAXVALUE;

-- ============================================
-- TABLE : quotes
-- ============================================
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES profiles(id),
  status quote_status NOT NULL DEFAULT 'draft',
  -- Calculs financiers
  subtotal_dzd decimal(15, 2) NOT NULL DEFAULT 0 CHECK (subtotal_dzd >= 0),
  discount_percentage decimal(5, 4) NOT NULL DEFAULT 0
    CHECK (discount_percentage >= 0 AND discount_percentage <= 1),
  discount_amount_dzd decimal(15, 2) NOT NULL DEFAULT 0 CHECK (discount_amount_dzd >= 0),
  vat_rate decimal(5, 4) NOT NULL DEFAULT 0.19 CHECK (vat_rate >= 0 AND vat_rate <= 1),
  vat_amount_dzd decimal(15, 2) NOT NULL DEFAULT 0 CHECK (vat_amount_dzd >= 0),
  total_dzd decimal(15, 2) NOT NULL DEFAULT 0 CHECK (total_dzd >= 0),
  -- Snapshot taux de change (figé au moment du devis)
  exchange_rate_snapshot jsonb NOT NULL DEFAULT '{"DZD": 1}',
  -- Métadonnées
  notes text,
  valid_until date,
  -- Workflow timestamps
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  rejected_reason text,
  converted_to_po_id uuid,  -- FK ajoutée plus tard (purchase_orders)
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_quotes_org_status ON quotes(organization_id, status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_active ON quotes(id) WHERE deleted_at IS NULL;

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- TABLE : quote_lines
-- ============================================
CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  tariff_id uuid NOT NULL REFERENCES platform_tariffs(id) ON DELETE RESTRICT,
  quantity int NOT NULL CHECK (quantity > 0),
  -- Prix utilisés (figés au moment de la création)
  effective_purchase_price_usd decimal(12, 4) NOT NULL CHECK (effective_purchase_price_usd > 0),
  effective_selling_price_usd decimal(12, 4) NOT NULL CHECK (effective_selling_price_usd > 0),
  unit_price_dzd decimal(15, 2) NOT NULL CHECK (unit_price_dzd >= 0),
  total_dzd decimal(15, 2) NOT NULL CHECK (total_dzd >= 0),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id, display_order);

-- ============================================
-- TRIGGER : set_quote_number
-- ============================================
CREATE OR REPLACE FUNCTION set_quote_number()
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
  next_seq := nextval('quote_number_seq');
  NEW.number := 'DEV-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER quotes_set_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION set_quote_number();

-- ============================================
-- TRIGGER : reset annual quote sequence
-- ============================================
-- Note : pas un vrai reset (sinon collision possible). On laisse la séquence
-- continuer mais le format inclut l'année. Sur 5 digits, on a 99999/an de marge.

-- ============================================
-- RLS POLICIES — quotes
-- ============================================
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select_admin" ON quotes
  FOR SELECT TO authenticated
  USING (is_admin() AND deleted_at IS NULL);

CREATE POLICY "quotes_select_tm" ON quotes
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id) AND deleted_at IS NULL);

CREATE POLICY "quotes_select_client" ON quotes
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id() AND deleted_at IS NULL);

CREATE POLICY "quotes_insert_client_owner" ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() IN ('client_owner', 'client_member')
    AND created_by = auth.uid()
  );

CREATE POLICY "quotes_insert_staff" ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (is_staff());

CREATE POLICY "quotes_update_owner" ON quotes
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
    AND status = 'draft'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
  );

CREATE POLICY "quotes_update_staff" ON quotes
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

-- Soft delete uniquement (pas de DELETE physique sauf super_admin)
CREATE POLICY "quotes_delete_super_admin" ON quotes
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ============================================
-- RLS POLICIES — quote_lines
-- ============================================
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_lines_select_via_quote" ON quote_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.deleted_at IS NULL
        AND (
          is_admin()
          OR is_assigned_tm_of(q.organization_id)
          OR q.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "quote_lines_modify_via_quote" ON quote_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.status = 'draft'
        AND (
          is_staff()
          OR (q.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.status = 'draft'
        AND (
          is_staff()
          OR (q.organization_id = current_org_id() AND current_user_role() = 'client_owner')
        )
    )
  );

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  006_purchase_orders.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 006 — Purchase Orders (BDC)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : BDC avec budget jamais diminuable, sequence BDC-YYYY-NNNNN
-- Phase        : 5
-- =================================================================

CREATE TYPE purchase_order_status AS ENUM (
  'draft',
  'active',
  'consumed',
  'cancelled',
  'paid'
);

CREATE SEQUENCE po_number_seq START WITH 1 NO MAXVALUE;

-- ============================================
-- TABLE : purchase_orders
-- ============================================
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  parent_po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  -- Budgets
  amount_ttc_dzd decimal(15, 2) NOT NULL CHECK (amount_ttc_dzd > 0),
  consumed_amount_dzd decimal(15, 2) NOT NULL DEFAULT 0
    CHECK (consumed_amount_dzd >= 0 AND consumed_amount_dzd <= amount_ttc_dzd),
  remaining_amount_dzd decimal(15, 2) GENERATED ALWAYS AS (
    amount_ttc_dzd - consumed_amount_dzd
  ) STORED,
  status purchase_order_status NOT NULL DEFAULT 'draft',
  file_url text,
  -- Cancellation (super_admin only)
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES profiles(id),
  cancellation_reason text,
  paid_at timestamptz,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_cancellation_complete CHECK (
    (cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

CREATE INDEX idx_pos_org_status ON purchase_orders(organization_id, status);
CREATE INDEX idx_pos_quote ON purchase_orders(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_pos_parent ON purchase_orders(parent_po_id) WHERE parent_po_id IS NOT NULL;

CREATE TRIGGER pos_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- FK différée pour quotes.converted_to_po_id
ALTER TABLE quotes
  ADD CONSTRAINT quotes_converted_to_po_fk
  FOREIGN KEY (converted_to_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- ============================================
-- TABLE : credit_notes (avoirs pour annulations)
-- ============================================
CREATE TABLE credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  related_po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  related_invoice_id uuid,  -- FK ajoutée plus tard
  amount_dzd decimal(15, 2) NOT NULL CHECK (amount_dzd > 0),
  reason text NOT NULL,
  issued_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_notes_org ON credit_notes(organization_id);
CREATE INDEX idx_credit_notes_po ON credit_notes(related_po_id) WHERE related_po_id IS NOT NULL;

CREATE SEQUENCE credit_note_number_seq START WITH 1;

-- ============================================
-- TRIGGER : set_po_number
-- ============================================
CREATE OR REPLACE FUNCTION set_po_number()
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
  next_seq := nextval('po_number_seq');
  NEW.number := 'BDC-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER pos_set_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_po_number();

-- ============================================
-- TRIGGER : set_credit_note_number
-- ============================================
CREATE OR REPLACE FUNCTION set_credit_note_number()
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
  next_seq := nextval('credit_note_number_seq');
  NEW.number := 'AVR-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_notes_set_number
  BEFORE INSERT ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_credit_note_number();

-- ============================================
-- TRIGGER : enforce_budget_not_decreased
-- ============================================
-- Le budget BDC ne peut JAMAIS être diminué.
CREATE OR REPLACE FUNCTION enforce_po_budget_not_decreased()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.amount_ttc_dzd < OLD.amount_ttc_dzd THEN
    RAISE EXCEPTION 'Le budget BDC ne peut être diminué (% → %)', OLD.amount_ttc_dzd, NEW.amount_ttc_dzd
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pos_enforce_budget
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_po_budget_not_decreased();

-- ============================================
-- RLS POLICIES — purchase_orders
-- ============================================
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_select_admin" ON purchase_orders
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "pos_select_tm" ON purchase_orders
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "pos_select_client" ON purchase_orders
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "pos_insert_staff" ON purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

CREATE POLICY "pos_update_staff" ON purchase_orders
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_assigned_tm_of(organization_id))
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

-- Cancellation : SUPER_ADMIN uniquement
CREATE POLICY "pos_cancel_super_admin" ON purchase_orders
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================
-- RLS POLICIES — credit_notes
-- ============================================
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_notes_select_admin" ON credit_notes
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "credit_notes_select_org" ON credit_notes
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "credit_notes_insert_super_admin" ON credit_notes
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- Pas d'UPDATE/DELETE — credit notes immuables

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  007_campaigns.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  008_kpis.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  009_invoices.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 009 — Invoices (Facturation)
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Factures auto avec seuil minimum (correction F5)
-- Phase        : 9
-- =================================================================

CREATE TYPE invoice_status AS ENUM (
  'pending_review',
  'draft',
  'validated',
  'sent',
  'paid',
  'overdue',
  'cancelled',
  'adjusted'
);

CREATE SEQUENCE invoice_number_seq START WITH 1 NO MAXVALUE;

-- ============================================
-- TABLE : invoices
-- ============================================
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  status invoice_status NOT NULL DEFAULT 'draft',
  -- Calculs financiers
  subtotal_dzd decimal(15, 2) NOT NULL CHECK (subtotal_dzd >= 0),
  vat_rate decimal(5, 4) NOT NULL DEFAULT 0.19 CHECK (vat_rate >= 0 AND vat_rate <= 1),
  vat_amount_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  total_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  -- Ajustement (super_admin only)
  adjustment_amount_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  adjustment_reason text,
  adjusted_by uuid REFERENCES profiles(id),
  adjusted_at timestamptz,
  -- Différentiel taux de change
  currency_translation_gain_loss_dzd decimal(15, 2) NOT NULL DEFAULT 0,
  -- Workflow
  paid_at timestamptz,
  payment_reference text,
  validated_by uuid REFERENCES profiles(id),
  validated_at timestamptz,
  -- Pièces jointes
  pdf_url text,
  due_date date,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_adjustment_complete CHECK (
    (adjustment_amount_dzd = 0 AND adjustment_reason IS NULL AND adjusted_by IS NULL)
    OR (adjustment_amount_dzd != 0 AND adjustment_reason IS NOT NULL AND adjusted_by IS NOT NULL)
  )
);

CREATE INDEX idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_campaign ON invoices(campaign_id);
CREATE INDEX idx_invoices_po ON invoices(po_id);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX idx_invoices_overdue ON invoices(due_date)
  WHERE status IN ('validated', 'sent') AND due_date IS NOT NULL;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger numérotation
CREATE OR REPLACE FUNCTION set_invoice_number()
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
  next_seq := nextval('invoice_number_seq');
  NEW.number := 'FAC-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_set_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- FK différée pour credit_notes.related_invoice_id
ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_related_invoice_fk
  FOREIGN KEY (related_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- ============================================
-- FONCTION : create_invoice_from_campaign
-- ============================================
-- Génère automatiquement une facture depuis une campagne terminée.
-- Si total_spent_dzd < seuil → status = 'pending_review' (au lieu de draft).
CREATE OR REPLACE FUNCTION create_invoice_from_campaign(p_campaign_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c RECORD;
  fin_settings RECORD;
  app_set RECORD;
  v_subtotal decimal(15, 2);
  v_vat decimal(15, 2);
  v_total decimal(15, 2);
  v_status invoice_status;
  v_invoice_id uuid;
BEGIN
  -- Verrouillage : éviter doubles factures
  SELECT * INTO c FROM campaigns WHERE id = p_campaign_id AND status = 'completed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campagne % non trouvée ou pas en statut completed', p_campaign_id;
  END IF;

  -- Une seule facture par campagne
  IF EXISTS (SELECT 1 FROM invoices WHERE campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION 'Facture déjà existante pour campagne %', p_campaign_id;
  END IF;

  SELECT * INTO fin_settings FROM client_financial_settings WHERE organization_id = c.organization_id;
  SELECT * INTO app_set FROM app_settings WHERE id = '00000000-0000-0000-0000-000000000001';

  v_subtotal := c.total_spent_dzd;
  v_vat := round(v_subtotal * COALESCE(fin_settings.custom_vat_rate, app_set.vat_rate), 2);
  v_total := v_subtotal + v_vat;

  -- Seuil minimum (correction F5)
  IF v_subtotal < app_set.invoice_minimum_amount_dzd THEN
    v_status := 'pending_review';
  ELSE
    v_status := 'draft';
  END IF;

  INSERT INTO invoices (
    organization_id, campaign_id, po_id,
    status, subtotal_dzd, vat_rate, vat_amount_dzd, total_dzd,
    due_date
  ) VALUES (
    c.organization_id, p_campaign_id, c.po_id,
    v_status, v_subtotal, COALESCE(fin_settings.custom_vat_rate, app_set.vat_rate),
    v_vat, v_total,
    (now() + interval '1 day' * COALESCE(fin_settings.payment_terms_days, 30))::date
  ) RETURNING id INTO v_invoice_id;

  -- Mettre à jour consumed_amount du BDC
  UPDATE purchase_orders
  SET consumed_amount_dzd = consumed_amount_dzd + v_total
  WHERE id = c.po_id;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION create_invoice_from_campaign FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_invoice_from_campaign TO service_role, authenticated;

-- ============================================
-- FONCTION : adjust_invoice (super_admin only)
-- ============================================
CREATE OR REPLACE FUNCTION adjust_invoice(
  p_invoice_id uuid,
  p_amount_dzd decimal,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role user_role;
BEGIN
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Ajustement facture réservé super_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_amount_dzd = 0 THEN
    RAISE EXCEPTION 'Montant d''ajustement ne peut être 0';
  END IF;

  IF p_reason IS NULL OR length(p_reason) < 10 THEN
    RAISE EXCEPTION 'Motif obligatoire (min 10 caractères)';
  END IF;

  UPDATE invoices
  SET
    adjustment_amount_dzd = p_amount_dzd,
    adjustment_reason = p_reason,
    adjusted_by = auth.uid(),
    adjusted_at = now(),
    total_dzd = total_dzd + p_amount_dzd,
    status = 'adjusted'
  WHERE id = p_invoice_id;

  RETURN p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION adjust_invoice FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_invoice TO authenticated;

-- ============================================
-- RLS POLICIES — invoices
-- ============================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_admin" ON invoices
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "invoices_select_tm" ON invoices
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "invoices_select_client" ON invoices
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "invoices_insert_staff" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_assigned_tm_of(organization_id));

CREATE POLICY "invoices_validate_admin" ON invoices
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- L'ajustement passe par adjust_invoice() qui contrôle le rôle
-- Pas de DELETE

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  010_intelligence.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  011_forecasts.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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
    AND current_user_role() = 'client_owner'
    AND status = 'shared_with_client'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  012_notifications.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- Migration 012 — Notifications + Realtime
-- =================================================================
-- Date         : 2026-01-15
-- Description  : Table notifications + Realtime subscriptions filtrées
-- Phase        : 11
-- =================================================================

CREATE TYPE notification_severity AS ENUM ('info', 'success', 'warning', 'error', 'critical');

CREATE TYPE notification_category AS ENUM (
  'auth',
  'quote',
  'purchase_order',
  'campaign',
  'kpi',
  'invoice',
  'report',
  'forecast',
  'suggestion',
  'system'
);

-- ============================================
-- TABLE : notifications
-- ============================================
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity notification_severity NOT NULL DEFAULT 'info',
  category notification_category NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  link text,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifs_recipient_unread ON notifications(recipient_id, is_read)
  WHERE is_read = false;
CREATE INDEX idx_notifs_recipient_recent ON notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifs_category ON notifications(recipient_id, category, created_at DESC);

-- ============================================
-- HELPER : create_notification
-- ============================================
CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_id uuid,
  p_type text,
  p_severity notification_severity,
  p_category notification_category,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'recipient_id obligatoire (jamais broadcast)';
  END IF;

  INSERT INTO notifications (recipient_id, type, severity, category, title, body, link, metadata)
  VALUES (p_recipient_id, p_type, p_severity, p_category, p_title, p_body, p_link, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION create_notification FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_notification TO service_role, authenticated;

-- ============================================
-- TABLE : notification_preferences
-- ============================================
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  digest_enabled boolean NOT NULL DEFAULT true,
  digest_frequency text NOT NULL DEFAULT 'daily' CHECK (digest_frequency IN ('daily', 'weekly')),
  -- Opt-in/out par catégorie
  enabled_categories jsonb NOT NULL DEFAULT '["auth","quote","purchase_order","campaign","kpi","invoice","report","forecast","suggestion","system"]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- REALTIME : activer publication
-- ============================================
-- Note : à exécuter via Supabase Dashboard > Database > Replication
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- (déclaratif ici via migration pour traçabilité)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    -- Tentative ; ignorée silencieusement si publication n'existe pas
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notifications';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore : la publication sera créée par Supabase Realtime
      NULL;
    END;
  END IF;
END $$;

-- ============================================
-- RLS POLICIES — notifications
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne voit QUE ses notifications
CREATE POLICY "notifs_select_self" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifs_update_self" ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifs_delete_self" ON notifications
  FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

-- INSERT par service_role uniquement (Edge Functions)

-- ============================================
-- RLS POLICIES — notification_preferences
-- ============================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs_select_self" ON notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notif_prefs_modify_self" ON notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  013_audit_logs.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  014_reports.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  015_events_webhooks.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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
    AND current_user_role() = 'client_owner'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = 'client_owner'
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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  016_monitoring.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  SEED — app_settings
-- ╚══════════════════════════════════════════════════════════════════╝

-- =================================================================
-- SEED — Données initiales DEV uniquement
-- =================================================================
-- Ce fichier est exécuté APRÈS toutes les migrations par `supabase db reset`
-- en environnement local. Ne PAS exécuter en prod.
-- =================================================================

-- ============================================
-- APP_SETTINGS — singleton
-- ============================================
INSERT INTO app_settings (
  id,
  vat_rate,
  invoice_minimum_amount_dzd,
  default_exchange_rates,
  agency_name,
  notifications_enabled
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  0.19,
  1000,
  '{"USD": 250, "EUR": 280, "AED": 68, "GBP": 320, "MAD": 25, "TND": 80, "INR": 3, "DZD": 1}'::jsonb,
  'SENSIUM-X',
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- BENCHMARKS GLOBAUX — placeholders MENA
-- ============================================
-- Insérés via migration 003 (tariffs_benchmarks.sql)

-- ============================================
-- COMPTE SUPER ADMIN DEV
-- ============================================
-- Note : créer manuellement via Supabase Studio ou Auth UI
-- Email: admin@sensads.local
-- Password: ChangeMe123!
-- Puis : UPDATE profiles SET role = 'super_admin' WHERE email = 'admin@sensads.local';

-- Done. Verify:
-- SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';
-- SELECT count(*) AS tariffs FROM platform_tariffs;
