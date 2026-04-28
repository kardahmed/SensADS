-- =================================================================
-- Migration 019 — Agency Accounts + Media Plans + Platform Lock + Overshoot
-- =================================================================
-- Date         : 2026-04-28
-- Description  : Sprint 2 — features opérationnelles core :
--                1. agency_ad_accounts : comptes pub agence (multi-devises)
--                2. media_plans + items + comments : workflow brief client
--                3. Verrouillage plateforme à la validation
--                4. Overshoot management (buffer + statuts stopping/reconciling)
--                5. Lien KPI ↔ ad account (compte utilisé par jour)
--
-- Phase        : Sprint 2 — Core operations
--
-- Rollback     :
--   ALTER TABLE campaign_kpis DROP COLUMN ad_account_id;
--   ALTER TABLE campaigns DROP COLUMN allocated_usd, DROP COLUMN platform_cap_usd,
--     DROP COLUMN overshoot_buffer_usd, DROP COLUMN overshoot_buffer_pct,
--     DROP COLUMN reconciliation_started_at, DROP COLUMN reconciliation_completed_at,
--     DROP COLUMN final_reconciled_at, DROP COLUMN media_plan_item_id;
--   DROP TYPE campaign_status_v2;
--   DROP TABLE media_plan_validations CASCADE;
--   DROP TABLE media_plan_comments CASCADE;
--   DROP TABLE media_plan_items CASCADE;
--   DROP TABLE media_plans CASCADE;
--   DROP TABLE agency_ad_accounts CASCADE;
--   DROP TYPE media_plan_status; DROP TYPE creative_type; DROP TYPE billing_party;
-- =================================================================

-- =================================================================
-- 1) AGENCY AD ACCOUNTS
-- =================================================================
-- Comptes pub appartenant à l'agence (NOT au client).
-- L'agence peut avoir plusieurs comptes par devise (USD/INR/EUR/AED/...)
-- pour optimiser les coûts.

CREATE TABLE agency_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  platform text NOT NULL,
  external_account_id text,
  account_currency text NOT NULL DEFAULT 'USD'
    CHECK (account_currency IN ('USD', 'EUR', 'GBP', 'INR', 'AED', 'MAD', 'TND', 'SAR', 'QAR', 'CAD', 'CHF')),

  -- CPM moyen observé sur ce compte (estimatif, pour le simulator)
  observed_cpm_account_currency numeric(15, 4) NOT NULL DEFAULT 0
    CHECK (observed_cpm_account_currency >= 0),

  -- Statut
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'banned')),
  is_connected boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT agency_account_unique UNIQUE (platform, external_account_id, account_currency)
);

CREATE INDEX idx_agency_accounts_platform ON agency_ad_accounts(platform, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_agency_accounts_currency ON agency_ad_accounts(account_currency, status) WHERE deleted_at IS NULL;

CREATE TRIGGER agency_accounts_updated_at
  BEFORE UPDATE ON agency_ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE agency_ad_accounts IS
  'Comptes publicitaires de l''agence (multi-devises). Utilisés pour exécuter les campagnes
  client en optimisant les coûts. Réservé staff (RLS).';

-- RLS : staff seulement (jamais client)
ALTER TABLE agency_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_accounts_select_staff" ON agency_ad_accounts
  FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY "agency_accounts_modify_admin" ON agency_ad_accounts
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Seed initial (peut être nettoyé par le user via UI)
INSERT INTO agency_ad_accounts (name, platform, account_currency, observed_cpm_account_currency, notes, status)
VALUES
  ('sensads_usd_01', 'facebook', 'USD', 0.30, 'Compte USD principal', 'active'),
  ('sensads_inr_01', 'facebook', 'INR', 16.00, 'Compte indien — CPM bas', 'active'),
  ('sensads_eur_01', 'facebook', 'EUR', 0.25, 'Compte européen', 'active'),
  ('sensads_aed_01', 'facebook', 'AED', 0.90, 'Compte Émirats', 'active')
ON CONFLICT DO NOTHING;

-- =================================================================
-- 2) Liaison KPI ↔ ad_account (compte utilisé par jour)
-- =================================================================
ALTER TABLE campaign_kpis
  ADD COLUMN ad_account_id uuid REFERENCES agency_ad_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_kpis_ad_account ON campaign_kpis(ad_account_id) WHERE ad_account_id IS NOT NULL;

COMMENT ON COLUMN campaign_kpis.ad_account_id IS
  'Compte pub utilisé pour cette journée (peut changer entre jours d''une même campagne).';

-- =================================================================
-- 3) OVERSHOOT MANAGEMENT — extension de campaigns
-- =================================================================
-- Phase de réconciliation post-stop : Meta continue à dépenser 24-48h après pause.
-- Prévoir un buffer de sécurité pour éviter de dépasser le budget alloué.

ALTER TABLE campaigns
  ADD COLUMN allocated_usd numeric(15, 4) NOT NULL DEFAULT 0
    CHECK (allocated_usd >= 0),
  ADD COLUMN platform_cap_usd numeric(15, 4) NOT NULL DEFAULT 0
    CHECK (platform_cap_usd >= 0),
  ADD COLUMN overshoot_buffer_pct numeric(5, 4) NOT NULL DEFAULT 0.08
    CHECK (overshoot_buffer_pct >= 0 AND overshoot_buffer_pct <= 0.20),
  ADD COLUMN reconciliation_started_at timestamptz,
  ADD COLUMN reconciliation_completed_at timestamptz,
  ADD COLUMN final_reconciled_at timestamptz,
  -- Lien vers l'item de Media Plan d'origine (FK ajoutée plus bas)
  ADD COLUMN media_plan_item_id uuid;

COMMENT ON COLUMN campaigns.allocated_usd IS
  'Budget USD total alloué pour cette campagne (= executable_budget du BDC).';
COMMENT ON COLUMN campaigns.platform_cap_usd IS
  'Cap injecté sur Meta (= allocated × (1 - overshoot_buffer_pct)). Auto-pause à ce seuil.';
COMMENT ON COLUMN campaigns.overshoot_buffer_pct IS
  'Buffer de sécurité (default 8%) pour absorber le post-stop overshoot 24-48h.';
COMMENT ON COLUMN campaigns.reconciliation_started_at IS
  'Date de mise en pause Meta (début phase reconciling).';
COMMENT ON COLUMN campaigns.final_reconciled_at IS
  'Date de fin de réconciliation (T+48h). Marge finale calculée à partir de cette date.';

-- =================================================================
-- 4) Statuts campagne enrichis (stopping + reconciling)
-- =================================================================
-- Le type campaign_status existant ne contient pas 'stopping' / 'reconciling'.
-- Pour éviter de casser les enums (DROP TYPE difficile en prod), on ajoute juste les valeurs.

DO $$
BEGIN
  -- Ajouter 'stopping' si absent
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = 'campaign_status'::regtype AND enumlabel = 'stopping'
  ) THEN
    ALTER TYPE campaign_status ADD VALUE 'stopping';
  END IF;

  -- Ajouter 'reconciling' si absent
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = 'campaign_status'::regtype AND enumlabel = 'reconciling'
  ) THEN
    ALTER TYPE campaign_status ADD VALUE 'reconciling';
  END IF;
END $$;

-- =================================================================
-- 5) PLATFORM LOCK — verrouillage de la plateforme une fois la campagne validée
-- =================================================================
CREATE OR REPLACE FUNCTION lock_campaign_platform()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Plateforme et objectif ne peuvent pas changer après le statut 'draft'
  IF OLD.status::text != 'draft'
     AND OLD.status::text != 'rejected'
  THEN
    IF OLD.platform IS DISTINCT FROM NEW.platform THEN
      RAISE EXCEPTION 'Cannot change platform on campaign % (status: %). Annulez et créez une nouvelle campagne.',
        NEW.number, OLD.status;
    END IF;

    IF OLD.optimization_goal IS DISTINCT FROM NEW.optimization_goal THEN
      RAISE EXCEPTION 'Cannot change optimization_goal on campaign % (status: %).',
        NEW.number, OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER campaigns_platform_lock
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION lock_campaign_platform();

COMMENT ON FUNCTION lock_campaign_platform IS
  'Empêche la modification de platform et optimization_goal après que la campagne soit sortie du draft.
  Garantit la cohérence des coûts (chaque plateforme/objectif a son propre rate card).';

-- =================================================================
-- 6) MEDIA PLANS — workflow brief client bidirectionnel
-- =================================================================
CREATE TYPE media_plan_status AS ENUM (
  'draft',                     -- en cours d'édition par le créateur
  'pending_other_party',       -- soumis à l'autre partie pour review
  'changes_requested',         -- modifications demandées
  'approved',                  -- approuvé, prêt à être converti
  'converted',                 -- converti en campagnes
  'rejected'                   -- refusé
);

CREATE TYPE billing_party AS ENUM ('client', 'agency');

CREATE TYPE creative_type AS ENUM (
  'drive_link',     -- lien Drive/Dropbox
  'post_url',       -- URL d'un post existant à sponsoriser
  'uploaded_files', -- fichiers uploadés Storage
  'mixed'           -- combinaison
);

CREATE SEQUENCE media_plan_number_seq START WITH 1 NO MAXVALUE;

CREATE TABLE media_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bdc_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,

  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,

  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),

  -- Direction de création : qui crée pour qui
  created_by_role billing_party NOT NULL,

  status media_plan_status NOT NULL DEFAULT 'draft',
  total_budget_dzd decimal(15, 2) NOT NULL DEFAULT 0 CHECK (total_budget_dzd >= 0),

  -- Audit
  created_by uuid NOT NULL REFERENCES profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  converted_at timestamptz,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_org ON media_plans(organization_id, status);
CREATE INDEX idx_mp_bdc ON media_plans(bdc_id);
CREATE INDEX idx_mp_status ON media_plans(status, created_at DESC);

-- Trigger numérotation MP-YYYY-NNNNN
CREATE OR REPLACE FUNCTION set_media_plan_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq bigint;
BEGIN
  IF NEW.number IS NOT NULL AND NEW.number != '' THEN
    RETURN NEW;
  END IF;
  next_seq := nextval('media_plan_number_seq');
  NEW.number := 'MP-' || EXTRACT(YEAR FROM now())::text || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER mp_set_number
  BEFORE INSERT ON media_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_media_plan_number();

CREATE TRIGGER mp_updated_at
  BEFORE UPDATE ON media_plans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON COLUMN media_plans.created_by_role IS
  '''client'' = client crée le brief → soumis à agence. ''agency'' = TM crée pour le client → soumis au client pour validation.';

-- =================================================================
-- 7) MEDIA PLAN ITEMS (1 item = 1 future campagne)
-- =================================================================
CREATE TABLE media_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_plan_id uuid NOT NULL REFERENCES media_plans(id) ON DELETE CASCADE,

  position int NOT NULL DEFAULT 0,

  -- Brief campagne
  campaign_name text NOT NULL CHECK (length(campaign_name) BETWEEN 1 AND 200),
  platform text NOT NULL,
  optimization_goal text NOT NULL,
  budget_dzd decimal(15, 2) NOT NULL CHECK (budget_dzd > 0),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),

  -- Audience
  audience_description text,
  audience_data jsonb NOT NULL DEFAULT '{}',

  -- Contenu créatif
  creative_type creative_type NOT NULL DEFAULT 'drive_link',
  drive_link text,
  post_url text,
  uploaded_file_paths jsonb NOT NULL DEFAULT '[]',

  -- Tracking
  landing_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,

  notes text,

  -- Conversion vers campagne réelle (FK différée)
  converted_campaign_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_items_plan ON media_plan_items(media_plan_id, position);

CREATE TRIGGER mp_items_updated_at
  BEFORE UPDATE ON media_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- FK différée : campaigns.media_plan_item_id → media_plan_items.id
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_media_plan_item_fk
  FOREIGN KEY (media_plan_item_id) REFERENCES media_plan_items(id) ON DELETE SET NULL;

ALTER TABLE media_plan_items
  ADD CONSTRAINT mp_items_converted_campaign_fk
  FOREIGN KEY (converted_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_campaigns_mp_item ON campaigns(media_plan_item_id) WHERE media_plan_item_id IS NOT NULL;

-- =================================================================
-- 8) MEDIA PLAN COMMENTS — collaboration
-- =================================================================
CREATE TABLE media_plan_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_plan_id uuid NOT NULL REFERENCES media_plans(id) ON DELETE CASCADE,
  media_plan_item_id uuid REFERENCES media_plan_items(id) ON DELETE CASCADE,

  author_id uuid NOT NULL REFERENCES profiles(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_comments_plan ON media_plan_comments(media_plan_id, created_at DESC);
CREATE INDEX idx_mp_comments_item ON media_plan_comments(media_plan_item_id, created_at DESC) WHERE media_plan_item_id IS NOT NULL;

-- =================================================================
-- 9) MEDIA PLAN VALIDATIONS — vérifs auto à la soumission
-- =================================================================
CREATE TABLE media_plan_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_plan_item_id uuid NOT NULL REFERENCES media_plan_items(id) ON DELETE CASCADE,

  check_type text NOT NULL CHECK (check_type IN (
    'landing_url_reachable',
    'post_url_accessible',
    'drive_link_accessible',
    'utm_format_valid',
    'budget_within_bdc',
    'creative_files_present',
    'platform_objective_compatible'
  )),
  status text NOT NULL CHECK (status IN ('passed', 'warning', 'failed', 'pending')),
  details text,

  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_validations_item ON media_plan_validations(media_plan_item_id, checked_at DESC);

-- =================================================================
-- 10) Trigger : platform locking sur media_plan_items après approbation
-- =================================================================
CREATE OR REPLACE FUNCTION lock_mp_item_platform()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  plan_status public.media_plan_status;
BEGIN
  SELECT status INTO plan_status
  FROM public.media_plans
  WHERE id = NEW.media_plan_id;

  IF plan_status IN ('approved', 'converted')
     AND OLD.platform IS DISTINCT FROM NEW.platform
  THEN
    RAISE EXCEPTION 'Platform locked: media plan is already %.', plan_status;
  END IF;

  IF plan_status IN ('approved', 'converted')
     AND OLD.optimization_goal IS DISTINCT FROM NEW.optimization_goal
  THEN
    RAISE EXCEPTION 'Optimization goal locked: media plan is already %.', plan_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER mp_items_platform_lock
  BEFORE UPDATE ON media_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION lock_mp_item_platform();

-- =================================================================
-- 11) RLS — media_plans
-- =================================================================
ALTER TABLE media_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_select_admin" ON media_plans
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "mp_select_tm" ON media_plans
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

CREATE POLICY "mp_select_client" ON media_plans
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "mp_insert_staff" ON media_plans
  FOR INSERT TO authenticated
  WITH CHECK (is_staff() OR organization_id = current_org_id());

CREATE POLICY "mp_update_creator_or_staff" ON media_plans
  FOR UPDATE TO authenticated
  USING (
    is_staff()
    OR (organization_id = current_org_id() AND created_by = auth.uid())
  )
  WITH CHECK (
    is_staff()
    OR (organization_id = current_org_id() AND created_by = auth.uid())
  );

-- =================================================================
-- 12) RLS — media_plan_items (hérite via media_plan_id)
-- =================================================================
ALTER TABLE media_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_items_select_via_plan" ON media_plan_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_plans mp
      WHERE mp.id = media_plan_items.media_plan_id
        AND (
          is_admin()
          OR is_assigned_tm_of(mp.organization_id)
          OR mp.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "mp_items_modify_via_plan" ON media_plan_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_plans mp
      WHERE mp.id = media_plan_items.media_plan_id
        AND (
          is_staff()
          OR (mp.organization_id = current_org_id() AND mp.created_by = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM media_plans mp
      WHERE mp.id = media_plan_items.media_plan_id
        AND (
          is_staff()
          OR (mp.organization_id = current_org_id() AND mp.created_by = auth.uid())
        )
    )
  );

-- =================================================================
-- 13) RLS — media_plan_comments
-- =================================================================
ALTER TABLE media_plan_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_comments_select_via_plan" ON media_plan_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_plans mp
      WHERE mp.id = media_plan_comments.media_plan_id
        AND (
          is_admin()
          OR is_assigned_tm_of(mp.organization_id)
          OR mp.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "mp_comments_insert" ON media_plan_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM media_plans mp
      WHERE mp.id = media_plan_comments.media_plan_id
        AND (
          is_staff()
          OR mp.organization_id = current_org_id()
        )
    )
  );

CREATE POLICY "mp_comments_update_author" ON media_plan_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR is_admin())
  WITH CHECK (author_id = auth.uid() OR is_admin());

-- =================================================================
-- 14) RLS — media_plan_validations
-- =================================================================
ALTER TABLE media_plan_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp_validations_select_staff" ON media_plan_validations
  FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY "mp_validations_modify_staff" ON media_plan_validations
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- =================================================================
-- 15) Helper : compute_executable_budget_for_bdc
-- =================================================================
CREATE OR REPLACE FUNCTION compute_executable_budget_for_bdc(p_bdc_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_bdc_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_po.parallel_rate_locked IS NULL OR v_po.fees_pct_locked IS NULL OR v_po.divisor_current IS NULL THEN
    RETURN 0;
  END IF;

  RETURN (v_po.amount_ttc_dzd * (1 - v_po.fees_pct_locked))
       / v_po.parallel_rate_locked
       / v_po.divisor_current;
END;
$$;

COMMENT ON FUNCTION compute_executable_budget_for_bdc IS
  'Retourne le budget USD exécutable d''un BDC selon sa config verrouillée.
  Formule : amount_dzd × (1 - fees) / parallel_rate / divisor.';

-- =================================================================
-- FIN MIGRATION 019
-- =================================================================
