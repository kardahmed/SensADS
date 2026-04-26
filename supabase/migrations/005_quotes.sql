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
    AND current_role() IN ('client_owner', 'client_member')
    AND created_by = auth.uid()
  );

CREATE POLICY "quotes_insert_staff" ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (is_staff());

CREATE POLICY "quotes_update_owner" ON quotes
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
    AND status = 'draft'
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_role() = 'client_owner'
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
          OR (q.organization_id = current_org_id() AND current_role() = 'client_owner')
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
          OR (q.organization_id = current_org_id() AND current_role() = 'client_owner')
        )
    )
  );
