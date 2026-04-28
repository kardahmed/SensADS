-- =================================================================
-- Migration 017 — BDC Locked Config + Client Rate Cards
-- =================================================================
-- Date         : 2026-04-28
-- Description  : Configuration financière verrouillée par BDC.
--                Le BDC devient l'ancre comptable : parallel_rate et fees
--                sont figés à la création (impossibles à modifier après),
--                seul le divisor reste modifiable (avec note obligatoire).
--                Ajout de client_rate_cards pour le pricing par
--                (client × plateforme × objectif).
--
-- Phase        : Sprint 1 — Foundation financière
--
-- Rollback     :
--   DROP TABLE client_rate_cards CASCADE;
--   DROP TRIGGER bdc_enforce_rate_lock ON purchase_orders;
--   DROP TRIGGER bdc_log_divisor_change ON purchase_orders;
--   DROP FUNCTION enforce_bdc_rate_lock();
--   DROP FUNCTION log_divisor_change();
--   ALTER TABLE purchase_orders DROP COLUMN parallel_rate_locked,
--                                DROP COLUMN fees_pct_locked,
--                                DROP COLUMN divisor_current,
--                                DROP COLUMN divisor_history;
--   ALTER TABLE organizations DROP COLUMN parallel_rate_default,
--                              DROP COLUMN fees_pct_default,
--                              DROP COLUMN divisor_default,
--                              DROP COLUMN preferred_display_currency;
--   ALTER TABLE app_settings DROP COLUMN default_parallel_rate,
--                             DROP COLUMN default_transaction_fees_pct,
--                             DROP COLUMN default_allocation_divisor;
-- =================================================================

-- ============================================
-- 1) DEFAULTS AGENCE (app_settings)
-- ============================================
ALTER TABLE app_settings
  ADD COLUMN default_parallel_rate decimal(15, 4) NOT NULL DEFAULT 260
    CHECK (default_parallel_rate > 0),
  ADD COLUMN default_transaction_fees_pct decimal(5, 4) NOT NULL DEFAULT 0.06
    CHECK (default_transaction_fees_pct >= 0 AND default_transaction_fees_pct < 1),
  ADD COLUMN default_allocation_divisor decimal(8, 4) NOT NULL DEFAULT 2.6
    CHECK (default_allocation_divisor >= 1);

COMMENT ON COLUMN app_settings.default_parallel_rate IS
  'Cours parallèle DZD/USD par défaut pour les nouveaux BDC.';
COMMENT ON COLUMN app_settings.default_transaction_fees_pct IS
  'Frais transaction par défaut (0.06 = 6%) appliqués aux nouveaux BDC.';
COMMENT ON COLUMN app_settings.default_allocation_divisor IS
  'Diviseur d''allocation par défaut. markup = divisor / (1 - fees).';

-- ============================================
-- 2) DEFAULTS PAR CLIENT (organizations)
-- ============================================
ALTER TABLE organizations
  ADD COLUMN parallel_rate_default decimal(15, 4)
    CHECK (parallel_rate_default IS NULL OR parallel_rate_default > 0),
  ADD COLUMN fees_pct_default decimal(5, 4)
    CHECK (fees_pct_default IS NULL OR (fees_pct_default >= 0 AND fees_pct_default < 1)),
  ADD COLUMN divisor_default decimal(8, 4)
    CHECK (divisor_default IS NULL OR divisor_default >= 1),
  ADD COLUMN preferred_display_currency text NOT NULL DEFAULT 'DZD'
    CHECK (preferred_display_currency IN ('DZD', 'USD'));

COMMENT ON COLUMN organizations.parallel_rate_default IS
  'Cours parallèle pré-rempli pour les futurs BDC de ce client. NULL = utilise le default agence.';
COMMENT ON COLUMN organizations.fees_pct_default IS
  'Frais transaction pré-remplis pour les futurs BDC. NULL = default agence.';
COMMENT ON COLUMN organizations.divisor_default IS
  'Diviseur pré-rempli. NULL = default agence.';
COMMENT ON COLUMN organizations.preferred_display_currency IS
  'Devise d''affichage par défaut côté client (DZD ou USD).';

-- ============================================
-- 3) BDC : config verrouillée à la création
-- ============================================
ALTER TABLE purchase_orders
  ADD COLUMN parallel_rate_locked decimal(15, 4)
    CHECK (parallel_rate_locked IS NULL OR parallel_rate_locked > 0),
  ADD COLUMN fees_pct_locked decimal(5, 4)
    CHECK (fees_pct_locked IS NULL OR (fees_pct_locked >= 0 AND fees_pct_locked < 1)),
  ADD COLUMN divisor_current decimal(8, 4)
    CHECK (divisor_current IS NULL OR divisor_current >= 1),
  ADD COLUMN divisor_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN purchase_orders.parallel_rate_locked IS
  '🔒 Cours parallèle DZD/USD. FIGÉ à la création du BDC, ne peut pas changer
  tant qu''il reste du budget à consommer. Garantit la cohérence comptable.';

COMMENT ON COLUMN purchase_orders.fees_pct_locked IS
  '🔒 Frais transaction (0.06 = 6%). FIGÉ à la création.';

COMMENT ON COLUMN purchase_orders.divisor_current IS
  '🔓 Diviseur courant (modifiable avec note obligatoire).
  markup_total = divisor_current / (1 - fees_pct_locked).';

COMMENT ON COLUMN purchase_orders.divisor_history IS
  'Historique des modifications du divisor.
  Format: [{ changed_at, from, to, note, changed_by, margin_impact_dzd }]';

-- Index pour performance sur les requêtes "BDC actifs avec budget restant"
CREATE INDEX idx_pos_active_with_budget ON purchase_orders(organization_id, status)
  WHERE status = 'active' AND remaining_amount_dzd > 0;

-- ============================================
-- 4) TRIGGER : verrouillage parallel_rate_locked + fees_pct_locked
-- ============================================
CREATE OR REPLACE FUNCTION enforce_bdc_rate_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Si parallel_rate_locked ou fees_pct_locked tentent de changer
  -- ALORS on vérifie si le BDC a encore du budget à consommer
  IF (OLD.parallel_rate_locked IS DISTINCT FROM NEW.parallel_rate_locked
      OR OLD.fees_pct_locked IS DISTINCT FROM NEW.fees_pct_locked)
  THEN
    -- Permettre la première initialisation (NULL → valeur)
    IF OLD.parallel_rate_locked IS NOT NULL OR OLD.fees_pct_locked IS NOT NULL THEN
      -- Bloquer la modification si budget restant > 0
      IF NEW.remaining_amount_dzd > 0 AND NEW.status NOT IN ('cancelled', 'paid') THEN
        RAISE EXCEPTION 'Cannot modify parallel_rate_locked or fees_pct_locked on active BDC % (remaining: % DZD)',
          NEW.number, NEW.remaining_amount_dzd
          USING HINT = 'Wait for the BDC to be fully consumed, cancelled, or paid.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bdc_enforce_rate_lock
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_bdc_rate_lock();

-- ============================================
-- 5) TRIGGER : log changement de divisor avec note obligatoire
-- ============================================
CREATE OR REPLACE FUNCTION log_divisor_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  last_entry jsonb;
  entry_note text;
BEGIN
  -- Si le divisor change, exiger qu'une note ait été ajoutée à divisor_history
  IF OLD.divisor_current IS DISTINCT FROM NEW.divisor_current
     AND OLD.divisor_current IS NOT NULL  -- skip first init
  THEN
    -- Récupérer la dernière entrée de l'historique
    last_entry := NEW.divisor_history -> -1;

    IF last_entry IS NULL THEN
      RAISE EXCEPTION 'Divisor change requires an entry in divisor_history';
    END IF;

    entry_note := last_entry ->> 'note';

    IF entry_note IS NULL OR length(trim(entry_note)) < 5 THEN
      RAISE EXCEPTION 'Divisor change requires a note (min 5 characters) in divisor_history.note';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bdc_log_divisor_change
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_divisor_change();

-- ============================================
-- 6) Helper : compute total markup
-- ============================================
CREATE OR REPLACE FUNCTION compute_total_markup(p_divisor numeric, p_fees_pct numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_fees_pct >= 1 OR p_fees_pct < 0 THEN
    RAISE EXCEPTION 'fees_pct must be in [0, 1)';
  END IF;
  IF p_divisor < 1 THEN
    RAISE EXCEPTION 'divisor must be >= 1';
  END IF;
  RETURN p_divisor / (1 - p_fees_pct);
END;
$$;

COMMENT ON FUNCTION compute_total_markup IS
  'Markup total = divisor / (1 - fees). Garantit que displayed_DZD ≈ deposit_DZD à l''unité près.';

-- ============================================
-- 7) TABLE : client_rate_cards
-- ============================================
-- Grille tarifaire par (organisation × plateforme × objectif).
-- Une seule "unité de facturation" par couple (CPM/CPC/CPA/cost_per_thruplay/etc.)
-- Toutes les autres métriques de coût sont dérivées via le markup.

CREATE TYPE billing_unit AS ENUM (
  'cpm',           -- 1000 impressions
  'cpc',           -- par clic
  'cpv',           -- vue vidéo (3s typiquement)
  'thruplay',      -- vue vidéo ≥ 15s ou complète
  'cpl',           -- par lead
  'cpa',           -- par conversion
  'cpi',           -- par install app
  'cpmsg'          -- par message
);

CREATE TABLE client_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  optimization_goal text NOT NULL,

  -- L'unité facturable principale pour ce couple (platform × goal)
  billing_unit billing_unit NOT NULL,
  billing_rate_usd decimal(12, 6) NOT NULL CHECK (billing_rate_usd > 0),

  notes text,

  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rate_cards_unique UNIQUE (organization_id, platform, optimization_goal)
);

CREATE INDEX idx_rate_cards_org ON client_rate_cards(organization_id);
CREATE INDEX idx_rate_cards_lookup ON client_rate_cards(organization_id, platform, optimization_goal);

CREATE TRIGGER rate_cards_updated_at
  BEFORE UPDATE ON client_rate_cards
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE client_rate_cards IS
  'Grille tarifaire client : 1 unité de facturation (CPM/CPC/...) par (org × plateforme × objectif).
  Toutes les autres métriques de coût sont dérivées via le markup.';

-- ============================================
-- 8) RLS — client_rate_cards
-- ============================================
ALTER TABLE client_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_cards_select_admin" ON client_rate_cards
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "rate_cards_select_tm" ON client_rate_cards
  FOR SELECT TO authenticated
  USING (is_assigned_tm_of(organization_id));

-- Le client NE VOIT PAS ses rate cards (info agence uniquement)
-- Pas de policy SELECT pour client_owner / client_member

CREATE POLICY "rate_cards_modify_admin" ON client_rate_cards
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- 9) Audit log automatique sur client_rate_cards
-- ============================================
CREATE OR REPLACE FUNCTION audit_rate_card_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, organization_id, action, entity_type, entity_id,
    diff_before, diff_after
  )
  VALUES (
    auth.uid(),
    COALESCE(NEW.organization_id, OLD.organization_id),
    TG_OP,
    'client_rate_card',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER rate_cards_audit
  AFTER INSERT OR UPDATE OR DELETE ON client_rate_cards
  FOR EACH ROW
  EXECUTE FUNCTION audit_rate_card_change();

-- =================================================================
-- FIN MIGRATION 017
-- =================================================================
