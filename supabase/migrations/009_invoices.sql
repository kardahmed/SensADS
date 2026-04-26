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
