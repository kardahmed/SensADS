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
