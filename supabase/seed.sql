-- =================================================================
-- SEED — Données initiales DEV uniquement
-- =================================================================
-- Ce fichier est exécuté APRÈS toutes les migrations par `supabase db reset`
-- en environnement local. Ne PAS exécuter en prod.
-- =================================================================

-- ============================================
-- APP_SETTINGS — singleton
-- ============================================
INSERT INTO app_settings (
  id,
  vat_rate,
  invoice_minimum_amount_dzd,
  default_exchange_rates,
  agency_name,
  notifications_enabled
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  0.19,
  1000,
  '{"USD": 250, "EUR": 280, "AED": 68, "GBP": 320, "MAD": 25, "TND": 80, "INR": 3, "DZD": 1}'::jsonb,
  'SENSIUM-X',
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- BENCHMARKS GLOBAUX — placeholders MENA
-- ============================================
-- Insérés via migration 003 (tariffs_benchmarks.sql)

-- ============================================
-- COMPTE SUPER ADMIN DEV
-- ============================================
-- Note : créer manuellement via Supabase Studio ou Auth UI
-- Email: admin@sensads.local
-- Password: ChangeMe123!
-- Puis : UPDATE profiles SET role = 'super_admin' WHERE email = 'admin@sensads.local';
