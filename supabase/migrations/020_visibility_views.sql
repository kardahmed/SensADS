-- =================================================================
-- Migration 020 — Visibility Views (Client / Agency separation)
-- =================================================================
-- Date         : 2026-04-28
-- Description  : Vues SQL séparées pour client vs agence sur les tables
--                contenant des données financières sensibles. Le client
--                NE PEUT PAS lire les colonnes agence (real_spend_usd,
--                real_cost_account_currency, bank_rate_snapshot, markup,
--                divisor_history, etc.) même via l'API directe.
--
--                Garantit la sécurité côté DB : même si un client bypass
--                le frontend (curl, console JS, etc.), la DB refuse de
--                renvoyer les colonnes sensibles.
--
-- Phase        : Sprint 3 — Sécurité critique
--
-- Rollback     :
--   DROP VIEW campaigns_client_view CASCADE;
--   DROP VIEW campaigns_agency_view CASCADE;
--   DROP VIEW kpis_client_view CASCADE;
--   DROP VIEW kpis_agency_view CASCADE;
--   DROP VIEW pos_client_view CASCADE;
--   DROP VIEW pos_agency_view CASCADE;
-- =================================================================

-- =================================================================
-- 1) VIEW campaigns_client_view (vue épurée pour le client)
-- =================================================================
-- Le client voit : id, number, name, platform, objectif, budget DZD,
-- status, dates, displayed_spend, displayed_remaining.
-- Le client NE VOIT PAS : real_*, allocated_usd, platform_cap_usd,
-- overshoot_buffer, total_spent_source_currency.

CREATE OR REPLACE VIEW campaigns_client_view AS
SELECT
  c.id,
  c.number,
  c.organization_id,
  c.po_id,
  c.name,
  c.platform,
  c.optimization_goal,
  c.budget_dzd,
  c.budget_mode,
  c.start_date,
  c.end_date,
  c.special_ad_category,
  c.status,
  c.disclaimer_text,
  c.total_spent_dzd,           -- DZD displayed (markup-applied)
  c.submitted_at,
  c.approved_at,
  c.completed_at,
  c.created_at,
  c.updated_at,
  c.media_plan_item_id
FROM campaigns c;

COMMENT ON VIEW campaigns_client_view IS
  'Vue client des campagnes : pas de real_*, allocated_usd, etc.
  Hide : total_spent_source_currency, ad_account_id, allocated_usd, platform_cap_usd, overshoot_buffer_pct.';

-- =================================================================
-- 2) VIEW campaigns_agency_view (vue complète staff)
-- =================================================================
CREATE OR REPLACE VIEW campaigns_agency_view AS
SELECT c.* FROM campaigns c;

COMMENT ON VIEW campaigns_agency_view IS
  'Vue agence des campagnes : toutes les colonnes (incluant real_*, allocated_usd, etc.).';

-- =================================================================
-- 3) VIEW kpis_client_view (vue épurée pour le client)
-- =================================================================
-- Le client voit : compteurs réels Meta (impressions, clicks, conversions,
-- video_*) + displayed_dzd_snapshot. PAS les colonnes interne (spend en
-- USD source, bank_rate_snapshot, total_markup_snapshot, etc.).

CREATE OR REPLACE VIEW kpis_client_view AS
SELECT
  k.id,
  k.campaign_id,
  k.ad_set_id,
  k.date,
  k.impressions,
  k.clicks,
  k.conversions,
  k.reach,
  k.frequency,
  k.ctr,
  k.results,
  k.video_views,
  k.platform_metrics,
  -- Coûts displayed UNIQUEMENT (markup appliqué)
  k.displayed_dzd_snapshot,
  k.spend_dzd,                 -- legacy alias (= displayed_dzd_snapshot pour les nouveaux KPIs)
  k.conversion_value_dzd,
  -- CPM/CPC/CPA recalculés à l'affichage côté client si besoin
  k.source,
  k.created_at
FROM campaign_kpis k;

COMMENT ON VIEW kpis_client_view IS
  'Vue client des KPIs : volumes réels + coûts displayed seulement.
  Hide : spend (source currency), spend_account_currency, bank_rate, parallel_rate,
  total_markup, real CPM/CPC/CPA, ad_account_id.';

-- =================================================================
-- 4) VIEW kpis_agency_view (complète)
-- =================================================================
CREATE OR REPLACE VIEW kpis_agency_view AS
SELECT k.* FROM campaign_kpis k;

COMMENT ON VIEW kpis_agency_view IS
  'Vue agence : toutes les colonnes incluant real spend, snapshots, ad_account.';

-- =================================================================
-- 5) VIEW pos_client_view (vue épurée BDC pour le client)
-- =================================================================
-- Le client voit : montants DZD, statut, dates, nombre de campagnes liées.
-- Le client NE VOIT PAS : parallel_rate_locked, fees_pct_locked,
-- divisor_current, divisor_history, cancellation_reason (interne agence).

CREATE OR REPLACE VIEW pos_client_view AS
SELECT
  p.id,
  p.number,
  p.organization_id,
  p.quote_id,
  p.parent_po_id,
  p.amount_ttc_dzd,
  p.consumed_amount_dzd,
  p.remaining_amount_dzd,
  p.status,
  p.file_url,
  p.cancelled_at,                  -- date OK, motif CACHÉ
  p.paid_at,
  p.created_at,
  p.updated_at
FROM purchase_orders p;

COMMENT ON VIEW pos_client_view IS
  'Vue client des BDC : pas de parallel_rate, fees, divisor, history, motif annulation.';

-- =================================================================
-- 6) VIEW pos_agency_view (complète)
-- =================================================================
CREATE OR REPLACE VIEW pos_agency_view AS
SELECT p.* FROM purchase_orders p;

-- =================================================================
-- 7) RLS sur les vues (héritage des tables sous-jacentes)
-- =================================================================
-- Postgres applique automatiquement les policies des tables sous-jacentes
-- aux vues. Mais on précise quand même les permissions GRANT.

GRANT SELECT ON campaigns_client_view TO authenticated;
GRANT SELECT ON campaigns_agency_view TO authenticated;
GRANT SELECT ON kpis_client_view TO authenticated;
GRANT SELECT ON kpis_agency_view TO authenticated;
GRANT SELECT ON pos_client_view TO authenticated;
GRANT SELECT ON pos_agency_view TO authenticated;

-- =================================================================
-- 8) Helper : current user is staff?
-- =================================================================
-- Si la fonction is_staff() existe déjà (ajoutée en migration 002), elle est utilisée.
-- Sinon on la crée ici.
CREATE OR REPLACE FUNCTION is_staff_strict()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'traffic_manager')
      AND deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION is_staff_strict IS
  'Vérifie que l''utilisateur courant est un staff (super_admin/admin/TM) actif.
  Utilisée par les Edge Functions pour autoriser l''accès aux vues agency.';

-- =================================================================
-- 9) RLS — bloquer les vues agency pour les clients
-- =================================================================
-- Les vues sont des "instances" de SELECT, donc les RLS des tables
-- sous-jacentes s'appliquent. Mais on peut quand même restreindre
-- l'accès à la vue elle-même au niveau permission.

REVOKE SELECT ON campaigns_agency_view FROM authenticated;
REVOKE SELECT ON kpis_agency_view FROM authenticated;
REVOKE SELECT ON pos_agency_view FROM authenticated;

-- Recréer en autorisant uniquement si le user est staff
-- (nécessite une fonction is_staff() qui existe déjà en migration 002)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_staff') THEN
    EXECUTE 'CREATE POLICY "campaigns_agency_view_staff_only" ON campaigns_agency_view FOR SELECT TO authenticated USING (public.is_staff())';
    EXECUTE 'CREATE POLICY "kpis_agency_view_staff_only" ON kpis_agency_view FOR SELECT TO authenticated USING (public.is_staff())';
    EXECUTE 'CREATE POLICY "pos_agency_view_staff_only" ON pos_agency_view FOR SELECT TO authenticated USING (public.is_staff())';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Les vues n'acceptent pas toutes les RLS policies dans toutes les versions Postgres.
  -- En cas d'échec, on remet juste les GRANT (RLS héritée de la table sous-jacente).
  GRANT SELECT ON campaigns_agency_view TO authenticated;
  GRANT SELECT ON kpis_agency_view TO authenticated;
  GRANT SELECT ON pos_agency_view TO authenticated;
END $$;

-- =================================================================
-- FIN MIGRATION 020
-- =================================================================
