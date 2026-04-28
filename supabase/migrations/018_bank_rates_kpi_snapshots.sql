-- =================================================================
-- Migration 018 — Bank Exchange Rates + KPI Multi-Currency Snapshots
-- =================================================================
-- Date         : 2026-04-28
-- Description  : Support des comptes pub multi-devises (USD/INR/EUR/AED…).
--                Ajout de bank_exchange_rates (taux officiels par devise)
--                et de snapshots multi-devises sur campaign_kpis pour
--                garantir la traçabilité historique :
--                  spend_account_currency  : coût brut sur le compte pub
--                  bank_rate_to_usd_snap   : taux bank du jour figé
--                  parallel_rate_dzd_snap  : cours parallèle du jour figé
--                  total_markup_snap       : markup figé (du BDC)
--                  displayed_dzd_snap      : DZD final affiché client
--
-- Phase        : Sprint 1 — Foundation financière
--
-- Rollback     :
--   ALTER TABLE campaign_kpis DROP COLUMN account_currency,
--                              DROP COLUMN spend_account_currency,
--                              DROP COLUMN bank_rate_to_usd_snapshot,
--                              DROP COLUMN parallel_rate_dzd_snapshot,
--                              DROP COLUMN total_markup_snapshot,
--                              DROP COLUMN displayed_dzd_snapshot,
--                              DROP COLUMN po_id;
--   DROP TABLE bank_exchange_rates CASCADE;
-- =================================================================

-- ============================================
-- 1) TABLE : bank_exchange_rates
-- ============================================
-- Taux interbancaires officiels par devise vers USD.
-- Saisie manuelle par admin/super_admin (ou auto via Edge Function future).
-- Chaque KPI fige son bank rate du jour pour traçabilité historique.

CREATE TABLE bank_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  currency text NOT NULL CHECK (currency IN (
    'USD', 'EUR', 'GBP', 'INR', 'AED', 'MAD', 'TND', 'SAR', 'QAR', 'CAD', 'CHF'
  )),

  -- Taux : 1 unité de currency = rate_to_usd USD
  -- ex INR : 0.011 (1 INR = 0.011 USD)
  -- ex EUR : 1.08  (1 EUR = 1.08 USD)
  -- ex AED : 0.272 (1 AED = 0.272 USD)
  rate_to_usd decimal(15, 8) NOT NULL CHECK (rate_to_usd > 0),

  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'forex_api', 'meta_api', 'imported')),
  notes text,

  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bank_rates_unique_per_day UNIQUE (currency, effective_date)
);

CREATE INDEX idx_bank_rates_lookup ON bank_exchange_rates(currency, effective_date DESC);

COMMENT ON TABLE bank_exchange_rates IS
  'Taux officiels DEVISE → USD par jour. Servent à convertir le coût réel du compte pub
  (INR/EUR/AED/...) vers USD au moment de chaque KPI quotidien.';

COMMENT ON COLUMN bank_exchange_rates.rate_to_usd IS
  'Multiplicateur : montant_USD = montant_currency × rate_to_usd';

-- ============================================
-- 2) RLS — bank_exchange_rates
-- ============================================
ALTER TABLE bank_exchange_rates ENABLE ROW LEVEL SECURITY;

-- Lecture : tous les staff (admin, TM)
CREATE POLICY "bank_rates_select_staff" ON bank_exchange_rates
  FOR SELECT TO authenticated
  USING (is_staff());

-- Modification : admin / super_admin uniquement
CREATE POLICY "bank_rates_modify_admin" ON bank_exchange_rates
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Le client NE VOIT PAS cette table (info agence)

-- ============================================
-- 3) Helper SQL : récupérer le taux le plus récent ≤ date donnée
-- ============================================
CREATE OR REPLACE FUNCTION get_bank_rate_for_date(
  p_currency text,
  p_date date
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate numeric;
BEGIN
  -- Cas trivial : USD → USD = 1
  IF p_currency = 'USD' THEN
    RETURN 1;
  END IF;

  -- Chercher le taux le plus récent ≤ p_date
  SELECT rate_to_usd INTO v_rate
  FROM public.bank_exchange_rates
  WHERE currency = p_currency
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  -- Pas de taux trouvé : retourne NULL (caller décide quoi faire)
  RETURN v_rate;
END;
$$;

COMMENT ON FUNCTION get_bank_rate_for_date IS
  'Retourne le bank rate (devise → USD) en vigueur à la date donnée.
  Utilise le taux effectif le plus récent ≤ date. Retourne NULL si aucun taux disponible.';

-- ============================================
-- 4) Snapshots multi-devises sur campaign_kpis
-- ============================================
-- Chaque KPI quotidien fige TOUS les paramètres financiers utilisés
-- pour calculer son displayed_dzd. Ainsi, modifier la config du BDC
-- ou les bank rates n'altère JAMAIS les KPIs déjà enregistrés.

ALTER TABLE campaign_kpis
  -- Lien vers le BDC (pour récupérer les snapshots config)
  ADD COLUMN po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,

  -- Devise du compte pub utilisé pour cette journée
  ADD COLUMN account_currency text DEFAULT 'USD'
    CHECK (account_currency IS NULL OR account_currency IN (
      'USD', 'EUR', 'GBP', 'INR', 'AED', 'MAD', 'TND', 'SAR', 'QAR', 'CAD', 'CHF'
    )),

  -- Coût RÉEL dans la devise du compte pub (ex 15 000 INR)
  ADD COLUMN spend_account_currency decimal(15, 4) DEFAULT 0
    CHECK (spend_account_currency IS NULL OR spend_account_currency >= 0),

  -- 🔒 Taux bank devise→USD figé pour ce jour (ex 0.011 pour INR)
  ADD COLUMN bank_rate_to_usd_snapshot decimal(15, 8) DEFAULT 1
    CHECK (bank_rate_to_usd_snapshot IS NULL OR bank_rate_to_usd_snapshot > 0),

  -- 🔒 Cours parallèle DZD/USD figé pour ce jour (hérité du BDC)
  ADD COLUMN parallel_rate_dzd_snapshot decimal(15, 4) DEFAULT 260
    CHECK (parallel_rate_dzd_snapshot IS NULL OR parallel_rate_dzd_snapshot > 0),

  -- 🔒 Markup total figé (= divisor / (1 - fees))
  ADD COLUMN total_markup_snapshot decimal(10, 6) DEFAULT 1
    CHECK (total_markup_snapshot IS NULL OR total_markup_snapshot >= 1),

  -- 🔒 DZD displayed final pour ce KPI (calculé serveur, figé)
  ADD COLUMN displayed_dzd_snapshot decimal(15, 2) DEFAULT 0
    CHECK (displayed_dzd_snapshot IS NULL OR displayed_dzd_snapshot >= 0);

CREATE INDEX idx_kpis_po ON campaign_kpis(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX idx_kpis_account_currency ON campaign_kpis(account_currency) WHERE account_currency IS NOT NULL;

COMMENT ON COLUMN campaign_kpis.po_id IS
  'Référence au BDC (pour héritage des snapshots config). NULL si KPI orphelin.';
COMMENT ON COLUMN campaign_kpis.account_currency IS
  'Devise du compte pub utilisé pour cette journée (USD/INR/EUR/AED/...).';
COMMENT ON COLUMN campaign_kpis.spend_account_currency IS
  'Coût brut Meta API dans la devise du compte (ex 15 000 INR). NON converti.';
COMMENT ON COLUMN campaign_kpis.bank_rate_to_usd_snapshot IS
  '🔒 Taux bank du jour, figé. spend_usd = spend_account_currency × bank_rate_to_usd_snapshot.';
COMMENT ON COLUMN campaign_kpis.parallel_rate_dzd_snapshot IS
  '🔒 Cours parallèle du BDC, figé. spend_dzd_real = spend_usd × parallel_rate.';
COMMENT ON COLUMN campaign_kpis.total_markup_snapshot IS
  '🔒 Markup figé : divisor / (1 - fees). displayed_usd = real_usd × total_markup.';
COMMENT ON COLUMN campaign_kpis.displayed_dzd_snapshot IS
  '🔒 Montant final affiché client en DZD pour ce KPI.';

-- ============================================
-- 5) TRIGGER : protéger les snapshots (immutables une fois set)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_kpi_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Bloquer la modification des snapshots SI ils étaient déjà set
  IF OLD.bank_rate_to_usd_snapshot IS NOT NULL
     AND OLD.bank_rate_to_usd_snapshot IS DISTINCT FROM NEW.bank_rate_to_usd_snapshot
  THEN
    RAISE EXCEPTION 'bank_rate_to_usd_snapshot is immutable on KPI %', NEW.id;
  END IF;

  IF OLD.parallel_rate_dzd_snapshot IS NOT NULL
     AND OLD.parallel_rate_dzd_snapshot IS DISTINCT FROM NEW.parallel_rate_dzd_snapshot
  THEN
    RAISE EXCEPTION 'parallel_rate_dzd_snapshot is immutable on KPI %', NEW.id;
  END IF;

  IF OLD.total_markup_snapshot IS NOT NULL
     AND OLD.total_markup_snapshot IS DISTINCT FROM NEW.total_markup_snapshot
  THEN
    RAISE EXCEPTION 'total_markup_snapshot is immutable on KPI %', NEW.id;
  END IF;

  IF OLD.displayed_dzd_snapshot IS NOT NULL AND OLD.displayed_dzd_snapshot != 0
     AND OLD.displayed_dzd_snapshot IS DISTINCT FROM NEW.displayed_dzd_snapshot
  THEN
    RAISE EXCEPTION 'displayed_dzd_snapshot is immutable on KPI %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_snapshots_immutable
  BEFORE UPDATE ON campaign_kpis
  FOR EACH ROW
  EXECUTE FUNCTION enforce_kpi_snapshots_immutable();

-- ============================================
-- 6) Trigger AUTO-FILL des snapshots à l'INSERT
-- ============================================
-- À l'insertion d'un KPI, si les snapshots ne sont pas explicitement remplis,
-- on les fige automatiquement à partir du BDC + bank_exchange_rates du jour.

CREATE OR REPLACE FUNCTION autofill_kpi_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_bank_rate numeric;
  v_markup numeric;
BEGIN
  -- Si po_id n'est pas fourni, dérive depuis la campagne
  IF NEW.po_id IS NULL THEN
    SELECT po_id INTO NEW.po_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;

  -- Charge le BDC pour récupérer les snapshots
  IF NEW.po_id IS NOT NULL THEN
    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = NEW.po_id;

    -- Hériter parallel_rate du BDC si non fourni
    IF NEW.parallel_rate_dzd_snapshot IS NULL OR NEW.parallel_rate_dzd_snapshot = 260 THEN
      NEW.parallel_rate_dzd_snapshot := COALESCE(v_po.parallel_rate_locked, 260);
    END IF;

    -- Calculer markup figé depuis le BDC
    IF v_po.divisor_current IS NOT NULL AND v_po.fees_pct_locked IS NOT NULL THEN
      v_markup := v_po.divisor_current / NULLIF(1 - v_po.fees_pct_locked, 0);
      IF NEW.total_markup_snapshot IS NULL OR NEW.total_markup_snapshot = 1 THEN
        NEW.total_markup_snapshot := v_markup;
      END IF;
    END IF;
  END IF;

  -- Bank rate du jour (devise compte → USD)
  IF NEW.account_currency IS NOT NULL
     AND (NEW.bank_rate_to_usd_snapshot IS NULL OR NEW.bank_rate_to_usd_snapshot = 1)
     AND NEW.account_currency != 'USD'
  THEN
    v_bank_rate := public.get_bank_rate_for_date(NEW.account_currency, NEW.date);
    IF v_bank_rate IS NOT NULL THEN
      NEW.bank_rate_to_usd_snapshot := v_bank_rate;
    END IF;
  END IF;

  -- Calcul auto displayed_dzd si pas encore fait
  -- displayed_dzd = spend_account_currency × bank_rate × markup × parallel_rate
  IF (NEW.displayed_dzd_snapshot IS NULL OR NEW.displayed_dzd_snapshot = 0)
     AND NEW.spend_account_currency IS NOT NULL
     AND NEW.bank_rate_to_usd_snapshot IS NOT NULL
     AND NEW.total_markup_snapshot IS NOT NULL
     AND NEW.parallel_rate_dzd_snapshot IS NOT NULL
  THEN
    NEW.displayed_dzd_snapshot := round(
      (NEW.spend_account_currency
        * NEW.bank_rate_to_usd_snapshot
        * NEW.total_markup_snapshot
        * NEW.parallel_rate_dzd_snapshot)::numeric,
      2
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_autofill_snapshots
  BEFORE INSERT ON campaign_kpis
  FOR EACH ROW
  EXECUTE FUNCTION autofill_kpi_snapshots();

COMMENT ON FUNCTION autofill_kpi_snapshots IS
  'À l''insertion d''un KPI, fige automatiquement bank_rate, parallel_rate, markup et calcule displayed_dzd
  à partir du BDC lié et du bank_exchange_rate du jour.';

-- ============================================
-- 7) Seed initial — bank rates de référence
-- ============================================
-- Valeurs approximatives au 28/04/2026 (à mettre à jour côté admin)
INSERT INTO bank_exchange_rates (currency, rate_to_usd, effective_date, source, notes)
VALUES
  ('USD', 1.000000, '2026-01-01', 'imported', 'Référence : 1 USD = 1 USD (constant)'),
  ('EUR', 1.080000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('GBP', 1.260000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('INR', 0.012000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('AED', 0.272000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('MAD', 0.099000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('TND', 0.320000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('SAR', 0.266000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('QAR', 0.275000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('CAD', 0.730000, '2026-01-01', 'imported', 'Seed initial — à actualiser'),
  ('CHF', 1.120000, '2026-01-01', 'imported', 'Seed initial — à actualiser')
ON CONFLICT (currency, effective_date) DO NOTHING;

-- =================================================================
-- FIN MIGRATION 018
-- =================================================================
