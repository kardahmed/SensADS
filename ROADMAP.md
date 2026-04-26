# 📅 ROADMAP SensADS — 12 semaines vers production

> **Objectif** : MVP production-ready avec 3 clients pilotes à S+12.
> **Stack** : GitHub + Supabase + Hostinger + Claude Code (zéro autre service externe payant).
> **Budget mensuel** : ~35$ (Hostinger Cloud Pro + Supabase Pro).

---

## 🎯 Principe directeur

**Une page UI = une session de build complète.** Tu finalises chaque écran à 100% (logique + interface + validation + tests) avant de passer au suivant.

**Règle d'or** : Vendredi = Go/No-Go. Pas vert = pas de S+1.

---

## 📊 Vue d'ensemble

| Semaine | Objectif | Migrations | Edge Functions | Statut |
|---|---|---|---|---|
| Prépa | Achats infra + comptes | - | - | ⬜ |
| S1 | Setup CI/CD + Auth + DB foundation | 001, 002 | login-rate-limit | ⬜ |
| S2 | Layout + Tarifs + KPIs schema (JSONB) | 003, 008 | - | ⬜ |
| S3 | Clients + pricing.ts blindé | 004 | - | ⬜ |
| S4 | Devis + numérotation + Domain Events | 005, 015 | - | ⬜ |
| S5 | BDC + Storage + Edge template | 006 | meta-oauth, meta-refresh | ⬜ |
| S6 | Wizard Campagne 5 étapes | 007 | - | ⬜ |
| S7 | Validation TM + Saisie KPIs | - | compute-kpi-conversion | ⬜ |
| S8 | Facturation + RGPD + CGV | 009 | gdpr-export, gdpr-delete | ⬜ |
| S9 | Rapports PDF (react-pdf client-side) | 014 | - | ⬜ |
| S10 | Notifications + Webhooks + Search | 012, 015b | meta-webhook | ⬜ |
| S11 | Intelligence + Anomaly + Polish | 010, 011 | compute-performance, generate-suggestions | ⬜ |
| S12 | DR + Monitoring + Lancement | 013, 016 | health, backup-financial | ⬜ |

---

## 🟥 PRÉPA — Avant S1 (3-5 jours)

### Achats infra
- [ ] Hostinger Cloud Professional (engagement annuel pour tarif promo)
- [ ] Supabase Pro (1 projet `sensads-prod`, région Frankfurt)
- [ ] Domaine `sensads.com` + DNS configuré

### Setup comptes
- [ ] Repo GitHub `kardahmed/sensads` (privé)
- [ ] Repo GitHub `kardahmed/sensads-backups` (privé, dumps DB chiffrés)
- [ ] Repo GitHub `kardahmed/sensads-status` (public, GitHub Pages status page)
- [ ] App Meta Developer (OAuth pour Facebook/Instagram)
- [ ] DNS `app.sensads.com` (app) + `sensads.com` (landing) + `status.sensads.com`

### Setup local
- [ ] Docker Desktop installé
- [ ] Supabase CLI installé (`brew install supabase/tap/supabase`)
- [ ] pnpm installé (`npm install -g pnpm`)
- [ ] Clone repo localement, `supabase init` ne sera pas exécuté (déjà fait dans le repo)
- [ ] `supabase link --project-ref <prod-ref>` pour lier au projet prod
- [ ] `supabase start` lance le stack local

### Légal
- [ ] Avocat briefé (CGV/CGU/RGPD/DPA) — devis et démarrage
- [ ] Décision politique conversion DZD documentée dans CLAUDE.md ✅

---

## 🔵 SEMAINE 1 — Setup CI/CD + Auth + DB foundation

### Lundi — Outillage

- [ ] GitHub Actions `ci.yml` (lint + typecheck + test + build sur PR)
- [ ] GitHub Actions `deploy.yml` (rsync vers Hostinger sur push main)
- [ ] Tailwind + Shadcn UI initialisés dans `apps/web`
- [ ] Tokens design system (2 thèmes WHITE/DARK) dans `packages/core/src/theme.ts`
- [ ] i18next config FR/EN initialisée

### Mardi — DB Foundation locale

- [ ] **Migration 001** `meta_tokens` AVEC `refresh_token`, `token_expires_at`, `metadata jsonb`
- [ ] **Migration 002** `core_tables` (profiles, organizations, app_settings, exchange_rate_history)
- [ ] Test : `supabase db reset` doit appliquer toutes les migrations sans erreur
- [ ] Premier mapper DTO `dbProfileToProfile` dans `packages/core/src/mappers/`

### Mercredi — Auth Supabase

- [ ] Login/Logout/Reset password via Supabase Auth
- [ ] **2FA TOTP** activé pour Super Admin
- [ ] Trigger `handle_new_user` SECURITY DEFINER

### Jeudi — Sécurité Auth

- [ ] **Migration 016** (partielle) : table `login_attempts`
- [ ] Edge Function `login-with-rate-limit` (lockout 15min après 5 échecs)
- [ ] Helper `packages/core/src/auth/getOrgFromJWT.ts`

### Vendredi — Tests

- [ ] Test E2E `auth.spec.ts` (login + lockout + 2FA + logout)
- [ ] CI passe en vert sur la PR
- [ ] **Go/No-Go S1** : login Super Admin avec 2FA fonctionne en prod

---

## 🔵 SEMAINE 2 — Layout + Tarifs + KPIs schema correct

### Lundi-Mardi — Layout
- [ ] `AppLayout` + Sidebar collapsible + Header
- [ ] `ProtectedRoute` par rôle
- [ ] `formatAmount()` avec espace insécable FR (test : `formatAmount(1000, 'fr') === '1 000,00 DZD'`)
- [ ] Composant `<EmptyState />` réutilisable
- [ ] Composant `<PaginationControls />`

### Mercredi-Jeudi — Tarifs
- [ ] **Migration 003** `platform_tariffs` + `global_benchmarks`
  - `purchase_price_usd decimal NOT NULL CHECK > 0` (USD pas DZD — protection volatilité)
  - VIEW `tariffs_with_margin`
- [ ] Page `/admin/tariffs` accordéons par plateforme (lus depuis `platforms.ts`)
- [ ] Seed 58 tarifs en USD

### Vendredi — KPIs schema (critique)
- [ ] **Migration 008** `campaign_kpis` avec colonnes universelles + JSONB `platform_metrics`
- [ ] Index GIN sur `platform_metrics`
- [ ] Index `(campaign_id, date)` et `(ad_set_id, date) WHERE NOT NULL`
- [ ] **Go/No-Go S2** : Page tarifs OK. Schema KPIs validé.

---

## 🔵 SEMAINE 3 — Clients + pricing.ts blindé

### Lundi — pricing.ts
- [ ] `packages/core/src/pricing.ts` : ordre `override > tarif > remise > TVA`
- [ ] `exchange_rate_snapshot` injecté à chaque calcul
- [ ] 30+ tests unitaires
- [ ] `currency.ts` `getHistoricalRate()` cache 10min

### Mardi-Mercredi — Clients
- [ ] **Migration 004** `client_tables`
- [ ] Validation NIF/NIS/RC algériens
- [ ] `organization.vat_id` + validation VIES async pour EU
- [ ] Pages `/admin/clients` (liste + détail + new)
- [ ] 58 wilayas dropdown searchable
- [ ] Sandbox mode par défaut

### Jeudi — Ad accounts
- [ ] Champs tracking : `pixel_id`, `pixel_type`, `gtm_container_id`, `ga4_measurement_id`
- [ ] Edge Function `meta-oauth/v1/`

### Vendredi — Tests RLS
- [ ] Script auto teste isolation org pour chaque rôle
- [ ] **Go/No-Go S3** : Isolation org vérifiée. pricing.ts couvre 100% cas.

---

## 🔵 SEMAINE 4 — Devis + Numérotation + Domain Events

### Lundi — Numérotation
- [ ] Format `DEV-YYYY-NNNNN` (5 digits dès le départ)
- [ ] Sequences Postgres + triggers BEFORE INSERT
- [ ] Test charge `pgbench` 100 inserts/sec → zéro doublon

### Mardi-Mercredi — Devis
- [ ] **Migration 005** `quotes`
- [ ] Pages `/admin/quotes` + new + détail
- [ ] Workflow `draft → submitted → approved → accepted → converted`

### Jeudi — PDF Devis
- [ ] react-pdf `<QuotePDF />` mode CLAIR
- [ ] Mentions fiscales obligatoires

### Vendredi — Domain Events
- [ ] **Migration 015** (partielle) : `domain_events` + trigger générique
- [ ] Event `quote.accepted` → log
- [ ] Worker squelette `process-domain-events` (pg_cron 1min)
- [ ] **Go/No-Go S4** : 100 devis créés en boucle, zéro doublon. Event loggé.

---

## 🔵 SEMAINE 5 — BDC + Storage + Edge Functions hardening

### Lundi — Storage
- [ ] 7 buckets Supabase (`branding` public + 6 privés)
- [ ] RLS sur `storage.objects` filtrant par `org_id` extrait du path
- [ ] Helper `getSignedUrl()` expiration 60s
- [ ] CDN Hostinger activé

### Mardi-Mercredi — BDC
- [ ] **Migration 006** `purchase_orders` avec `remaining_amount GENERATED STORED`
- [ ] Pré-remplissage depuis devis accepté
- [ ] Action `cancel_with_refund` Super Admin only + table `credit_notes`

### Jeudi — Edge Functions pattern
- [ ] Template `supabase/functions/_shared/` (auth, rate limit, logging structuré)
- [ ] Migrer `meta-oauth` vers le template
- [ ] Edge Function `meta-refresh-tokens` (pg_cron quotidien 02h)

### Vendredi — Revue sécurité
- [ ] Checklist S1-S10 (CLAUDE.md) cochée
- [ ] `supabase db lint` zéro warning
- [ ] **Go/No-Go S5** : zéro Edge Function fait confiance au client.

---

## 🔵 SEMAINE 6 — Wizard Campagne complet

### Lundi-Mardi — Schema
- [ ] **Migration 007** `campaigns` + `ad_sets` + `ads`
- [ ] `special_ad_category` enum
- [ ] `disclaimer_text` obligatoire si social/élections
- [ ] `ad_account_id` UNIQUE par campaign

### Mercredi-Jeudi — Wizard UI
- [ ] Étape 1 — Sélection plateforme
- [ ] Étape 2 — Objectifs / budget
- [ ] Étape 3 — Ad sets + validation ABO (warning 95%, blocage > 100%)
- [ ] Étape 4 — Annonces + UTM auto
- [ ] Étape 5 — Récap + soumission
- [ ] Auto-save localStorage avec clé `wizard_draft_{user_id}_{org_id}_{session_uuid}`

### Vendredi — Tracking + mobile
- [ ] Helper `track()` insère dans `analytics_events`
- [ ] Mobile wizard = stepper vertical
- [ ] **Go/No-Go S6** : 1 campagne Meta + 1 manuelle créées E2E.

---

## 🔵 SEMAINE 7 — Validation TM + Saisie KPIs

### Lundi — Validation TM
- [ ] Page `/tm/campaigns` liste + filtres
- [ ] Validation : Meta = draft API / Manuel = active direct
- [ ] Audit log de chaque validation

### Mardi-Mercredi — Saisie KPIs
- [ ] Page `/tm/kpis` saisie multi-jours
- [ ] `exchange_rate_snapshot` figé à la saisie
- [ ] Edge Function `compute-kpi-conversion` (server-side DZD)
- [ ] Import CSV bulk pour Snapchat/TikTok

### Jeudi — Cache React Query
- [ ] Helper `invalidateRelated.ts` documenté
- [ ] staleTime configuré par hook
- [ ] Skeleton loaders partout
- [ ] Service Worker + Dexie pour offline KPIs

### Vendredi — Tests
- [ ] E2E `tm-flow.spec.ts`
- [ ] **Go/No-Go S7** : TM saisit 30j KPIs offline. Conversion DZD cohérente.

---

## 🔵 SEMAINE 8 — Facturation + RGPD + CGV

### Lundi-Mardi — Facturation
- [ ] **Migration 009** `invoices` + sequence `FAC-YYYY-NNNNN`
- [ ] `app_settings.invoice_minimum_amount_dzd DEFAULT 1000`
- [ ] Provision `currency_translation_gain_loss`
- [ ] PDF facture mode CLAIR

### Mercredi — pg_cron + monitoring
- [ ] pg_cron `check-budget-alerts` horaire
- [ ] Edge Function `check-budget-alerts`
- [ ] Découpage par org dans `compute_jobs`

### Jeudi-Vendredi — RGPD + CGV
- [ ] Edge Function `gdpr-export-user-data`
- [ ] Edge Function `gdpr-delete-user-account`
- [ ] Soft-delete générique (`deleted_at`) + page `/admin/trash`
- [ ] Page upload pièce identité client (KYC)
- [ ] Intégrer CGV/CGU/DPA → signature au signup
- [ ] **Go/No-Go S8** : Facture auto avec seuil. Export GDPR. CGV en place.

---

## 🔵 SEMAINE 9 — Rapports PDF react-pdf client-side

### Lundi-Mardi — Composants slides
- [ ] `<ReportSlide1Cover />` à `<ReportSlide9Summary />`
- [ ] Composant master `<CampaignReport />`
- [ ] Données : KPIs DZD + graphiques (screenshot Recharts via html2canvas)

### Mercredi — Queue rapports
- [ ] **Migration 014** `reports` + `report_jobs`
- [ ] UI client : bouton "Télécharger rapport" → blob → download
- [ ] Génération 100% client-side (2-5s)

### Jeudi — Templates
- [ ] Slide 1 cover réutilisable
- [ ] Slides 2-9 spécifiques campagne

### Vendredi — Tests
- [ ] Test : générer 5 rapports en parallèle navigateur
- [ ] SLO : génération < 10s
- [ ] **Go/No-Go S9** : 1 rapport complet généré conforme.

---

## 🔵 SEMAINE 10 — Notifications + Webhooks + Search

### Lundi — Notifications
- [ ] **Migration 012** `notifications`
- [ ] Realtime avec filter `recipient_id=eq.${userId}`
- [ ] Catégories + sévérités + page `/settings/notifications`
- [ ] Edge Function digest quotidien 8h

### Mardi-Mercredi — Webhooks
- [ ] **Migration 015** (partie webhooks) : `webhook_endpoints` + `webhook_logs` + `webhook_retry_queue`
- [ ] Secrets chiffrés pgcrypto
- [ ] Page `/client/settings/webhooks`
- [ ] Edge Function `meta-webhook` (entrant, signature `X-Hub-Signature-256`)

### Jeudi — Recherche globale
- [ ] `tsvector` + colonnes `search_vector` GENERATED sur 8 entités
- [ ] Index GIN
- [ ] Composant Cmd+K (Shadcn `<Command />`)

### Vendredi — Audit immutable
- [ ] **Migration 013** `audit_logs` partitionné par mois
- [ ] Trigger BEFORE UPDATE → RAISE EXCEPTION
- [ ] `REVOKE UPDATE/DELETE`
- [ ] **Go/No-Go S10** : Notifs Realtime fluides. Cmd+K instantané. Audit intouchable.

---

## 🔵 SEMAINE 11 — Intelligence + Anomaly + Polish

### Lundi-Mardi — Intelligence
- [ ] **Migration 010** `campaign_performance_periods` + `performance_analytics` + `performance_suggestions`
- [ ] **Migration 011** `budget_forecasts`
- [ ] Edge Function `compute-performance-periods` chunking par org
- [ ] Edge Function `generate-suggestions` rate limit 1/forecast/5min
- [ ] Anomaly detection z-score 30j

### Mercredi — Forecasts
- [ ] 3 scénarios pess/réa/opt
- [ ] PerformanceHistoryChart dual-axis

### Jeudi — Polish UI
- [ ] Toggle dark/light dans l'app
- [ ] Tooltips Shadcn sur le wizard
- [ ] Bulk actions (checkbox + barre)
- [ ] Templates de campagnes
- [ ] Activity timeline par campagne

### Vendredi — Tests E2E full
- [ ] `e2e/critical-flow.spec.ts` (devis → rapport)
- [ ] `e2e/permissions.spec.ts` (matrice 5 rôles)
- [ ] `e2e/multi-tenant.spec.ts`
- [ ] **Go/No-Go S11** : Suite E2E verte.

---

## 🔵 SEMAINE 12 — DR + Monitoring + Lancement

### Lundi — Disaster Recovery
- [ ] **Migration 016** (complète) : `function_logs`, `error_logs`, `analytics_events`
- [ ] Edge Function `backup-financial-data` nightly (dump → GPG → push repo `sensads-backups`)
- [ ] GitHub Action `backup.yml` cron quotidien 03h UTC
- [ ] Backup Hostinger natif activé
- [ ] Runbook incident dans Notion
- [ ] Drill : simuler "Supabase down 2h"

### Mardi — Observabilité
- [ ] Edge Function `health` (retourne `{db, auth, storage, version}`)
- [ ] GitHub Action `uptime.yml` cron 5min (ouvre issue si down)
- [ ] Page `/admin/metrics` (Recharts sur VIEW SQL agrégées)
- [ ] Page `/admin/slo` (P50/P95/P99 latency)
- [ ] Status page GitHub Pages `status.sensads.com`

### Mercredi — Compliance finale
- [ ] CGV/CGU/DPA validés avocat → publiés
- [ ] Audit juridique loi 18-07 Algérie
- [ ] Assurance RC pro
- [ ] Bannière cookies maison

### Jeudi — Onboarding 3 pilotes
- [ ] Sandbox mode activé pour les 3
- [ ] Formation TM 2h par client
- [ ] Product tour `react-joyride` au 1er login
- [ ] Documentation client (Notion publique)

### Vendredi — LANCEMENT 🚀
- [ ] Déploiement prod final
- [ ] War room Slack + 1 dev d'astreinte
- [ ] Monitoring renforcé 72h
- [ ] Standup quotidien 9h pendant 2 semaines

---

## ⚠️ Discipline absence de staging

Comme on n'a qu'un seul environnement (dev local + prod), 3 disciplines obligatoires :

1. **Migrations** : toujours testées en local (`supabase db reset`) avant `supabase db push`
2. **Feature flags** : `organizations.features jsonb` — déployer du code "off" puis activer org par org
3. **Sandbox mode** : nouvelles features testables d'abord sur une org sandbox interne

Si gros refacto (ex: v3.1 GA4) → ajouter projet Supabase staging temporaire 25$/mois pour 1 mois.

---

## 📈 Roadmap post-lancement (v3.x)

- **v3.0** (lancement) : Core + UTM auto + Pixel/Tracking + Webhooks sortants
- **v3.1** (M+1) : `platform_tokens` générique + GA4 + HubSpot + Zapier/Make
- **v3.2** (M+3) : TikTok Business API + Snapchat Marketing API + Google Ads API
- **v3.3** (à la demande) : LinkedIn + Shopify/WooCommerce + Salesforce + Looker Studio

**À lancer MAINTENANT** (approbations longues) :
- [ ] Demande Google Ads API (2-6 semaines)
- [ ] App TikTok Developer (1 semaine)
- [ ] App LinkedIn Marketing Developer (2-4 semaines)
- [ ] App Snapchat Developer (1-2 semaines)

---

## 💰 Budget mensuel récurrent

| Service | Coût |
|---|---|
| Hostinger Cloud Pro (annuel) | ~9€/mo |
| Supabase Pro | 25$/mo |
| GitHub (privé) | Free |
| Claude Code | déjà payé |
| **TOTAL** | **~35$/mo** |

---

## 🎯 Critères de réussite S+12

- [ ] 3 clients pilotes connectés et utilisant l'app
- [ ] Zéro alerte critique en 72h post-lancement
- [ ] SLO respectés : login P95 < 1s, KPI saisie P95 < 2s, rapport P95 < 30s
- [ ] CI verte sur 100% des PR mergées
- [ ] Coverage tests > 70% sur `packages/core`
- [ ] Zéro fuite de données entre orgs (vérifié par script auto)
- [ ] CGV/RGPD/2FA en place
- [ ] 3 niveaux backup actifs (Supabase PITR + Hostinger + GitHub)
