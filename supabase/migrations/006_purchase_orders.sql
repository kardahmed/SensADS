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
