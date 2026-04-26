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
-- Note Supabase Cloud : on n'a pas les droits ALTER DATABASE pour stocker
-- la clé en GUC. La clé est donc passée en PARAMÈTRE par les Edge Functions
-- (depuis leur variable d'environnement PGCRYPTO_KEY).
-- ============================================

CREATE OR REPLACE FUNCTION encrypt_token(plain_token text, encryption_key text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF plain_token IS NULL OR plain_token = '' OR encryption_key IS NULL OR encryption_key = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(plain_token, encryption_key);
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_token(encrypted_token bytea, encryption_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF encrypted_token IS NULL OR encryption_key IS NULL OR encryption_key = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(encrypted_token, encryption_key);
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
