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
CREATE OR REPLACE FUNCTION current_role()
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
  SELECT current_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_role() IN ('super_admin', 'admin');
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_role() IN ('super_admin', 'admin', 'traffic_manager');
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
    current_role() = 'traffic_manager'
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
  USING (id = current_org_id() AND current_role() = 'client_owner')
  WITH CHECK (id = current_org_id() AND current_role() = 'client_owner');

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
