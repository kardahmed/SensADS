# CLAUDE.md — Contexte SensADS pour Claude Code

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il contient les règles non-négociables, conventions, et garde-fous du projet.

---

## 🎯 Identité du projet

**SensADS by SENSIUM-X** — Outil SaaS interne de gestion de campagnes publicitaires multi-plateformes pour une agence de Digital Traffic Management / Media Buying / Media Planning.

- **Type** : SaaS B2B interne (accès sur invitation uniquement)
- **Audience** : agence + clients de l'agence
- **Devise principale** : DZD (Dinar algérien)
- **Devises support** : USD, EUR, AED, GBP, MAD, TND, INR
- **Marché** : Algérie + MENA + opérations mondiales
- **Plateformes pub** : 11 (Facebook, Instagram via API Meta + 9 manuelles)

---

## 🏗️ Stack technique (figée — ne PAS changer sans validation)

### Frontend
- **React 18** + **TypeScript** (strict)
- **Vite** (build tool)
- **Tailwind CSS** + **Shadcn UI**
- **React Query** (server state)
- **React Hook Form** + **Zod** (formulaires + validation)
- **Recharts** (graphiques)
- **react-pdf** (PDFs côté client — devis, factures, rapports)
- **react-i18next** (FR par défaut + EN)
- **Lucide React** (icônes)

### Backend
- **Supabase** (PostgreSQL + Auth + Storage + Realtime + Edge Functions Deno)
- **RLS** (Row Level Security) sur TOUTES les tables
- **pg_cron** (jobs planifiés)
- **pgcrypto** (chiffrement tokens)

### Infra
- **Hostinger Cloud Pro** (host frontend + landing + CDN intégré)
- **Supabase Cloud Pro** (1 projet prod unique, région Frankfurt)
- **GitHub** (repo + Actions CI/CD + backups privés)
- **Aucun service externe** payant (pas de Sentry, PostHog, Cloudflare, etc.)

### Tests
- **Vitest** (unit + integration)
- **Playwright** (E2E)

---

## 🚨 Règles non-négociables

### Sécurité

1. **RLS obligatoire** : chaque table DOIT avoir RLS active + au moins 1 policy. Politique par défaut **DENY**.
2. **Org isolation** : aucune query cross-org possible. Filtre `organization_id` partout.
3. **Edge Functions** : extraire `org_id` depuis le JWT côté serveur, **JAMAIS** depuis le body du client (IDOR).
4. **Tokens chiffrés** : `meta_tokens.access_token`, `meta_tokens.refresh_token`, `webhook_endpoints.secret` chiffrés via `pgcrypto`.
5. **Audit logs immutables** : trigger `BEFORE UPDATE/DELETE` qui `RAISE EXCEPTION`. `REVOKE UPDATE/DELETE`.
6. **2FA TOTP obligatoire** pour `super_admin`.
7. **Rate limiting** sur Edge Functions critiques (login, generate-suggestions, generate-report).
8. **Signed URLs** Storage avec expiration ≤ 60s pour les buckets privés.
9. **Validation côté serveur** TOUJOURS, en plus du client. Ne jamais faire confiance au client.
10. **Secrets** jamais en clair, jamais dans le repo. GitHub Secrets + Supabase Secrets uniquement.

### Données financières

11. **`purchase_price > 0`** : CHECK constraint bloquant sur `platform_tariffs` et `client_tariff_overrides.custom_purchase_price`.
12. **Budget BDC jamais diminuable** : enforcement côté DB (trigger) + côté app.
13. **Conversion DZD figée** : `exchange_rate_snapshot` injecté dans CHAQUE KPI/devis/facture au moment de la création. JAMAIS de lookup live au moment de l'affichage.
14. **Mode ABO** : `somme(adsets.budget) <= campaign.budget`. Bloquant.
15. **Numérotation** : format `XXX-YYYY-NNNNN` (5 digits dès le départ, sequence Postgres + trigger).
16. **Facture auto** : seulement si `total_spent_dzd >= app_settings.invoice_minimum_amount_dzd` (default 1000 DZD). Sous le seuil → `pending_review`.
17. **Ajustement facture** : `super_admin` UNIQUEMENT (RLS + double check côté Edge Function).

### Architecture

18. **Hooks Supabase** : 1 hook par module. AUCUN appel direct depuis un composant.
19. **DTO mappers** : tous les retours DB passent par `packages/core/src/mappers/` (snake_case → camelCase).
20. **`formatAmount()`** : utilisé pour TOUS les montants affichés. JAMAIS de `${amount} DZD` brut.
21. **ProtectedRoute** + `allowedRoles` sur chaque route privée.
22. **React.lazy** + Suspense sur toutes les pages (code splitting obligatoire).
23. **Tests E2E Playwright** sur les flows critiques (auth, devis→facture, wizard, validation TM).
24. **Migrations** : nommées `{NNN}_{description}.sql`, testées en LOCAL via `supabase db reset` AVANT push prod.
25. **Aucun `ALTER TABLE` destructif** sans backup + rollback documenté.

### Code style

26. **TypeScript `strict: true`** partout. Zéro `any`. Zéro `@ts-ignore` sans justification commentée.
27. **Pas de commentaires inutiles**. Le code doit s'expliquer. Commentaires uniquement pour les WHY non-évidents.
28. **Pas de `console.log`** en prod. Logger structuré uniquement (table `function_logs`).
29. **Pas de magic numbers**. Constantes nommées dans `packages/core/src/constants.ts`.
30. **Tailwind only** pour le styling. Pas de CSS custom sauf cas exceptionnels documentés.

---

## 🎨 Design System — 2 thèmes distincts

### Thème A : Landing page (WHITE / Stripe-like)

```
Background       #FFFFFF
Card alt         #F6F9FC
Text primary     #0A2540
Text secondary   #425466
Text muted       #8898AA
Accent primary   #00D4FF  (cyan logo)
Accent secondary #38BDF8
Border           #E6EBF1
Success          #10B981
```

**Règles landing** :
- PAS de dark mode
- PAS de bouton "Démarrer" / "Login" en hero (CTA = formulaire de contact)
- Formulaire de contact = section principale
- Mentions légales + bannière cookies

### Thème B : Application (DARK)

```
Background    #0A0E1A
Sidebar       #111827
Card          #1F2937
Border        #374151
Text primary  #F9FAFB
Text secondary #9CA3AF
Accent        #6366F1  (indigo)
Violet        #8B5CF6
Success       #10B981
Warning       #F59E0B
Error         #EF4444
```

**Logo** : S dégradé `#00D4FF → #38BDF8 → #1E3A8A` sur fond noir, texte "SENSADS" blanc bold + "by SENSIUM-X" light.

**Typo** : Inter — titres 24px bold, sous-titres 18px semibold, corps 14px, badges 12px medium.

**PDFs** : exception au dark mode. Toujours en mode CLAIR (fond blanc, texte noir, logo agence).

---

## 👥 Rôles utilisateur (5)

| Rôle | Périmètre |
|---|---|
| `super_admin` | Contrôle total : `app_settings`, charte, TVA, taux de change, ajustement factures, grille tarifaire, benchmarks, utilisateurs, audit logs |
| `admin` | Mêmes droits SAUF `app_settings` et ajustement factures |
| `traffic_manager` | Gère ses clients, valide campagnes, saisit KPIs, crée BDC, prévisions, valide suggestions |
| `client_owner` | Crée devis, campagnes via wizard, consulte KPIs/factures/rapports, gère équipe (max 5 sous-comptes par défaut, configurable) |
| `client_member` | Accès selon droits du propriétaire : `full` / `campaigns_only` / `read_only` |

---

## 🔄 Flux opérationnel canonique

```
Prévision → Devis → BDC → Campagne (wizard 5 étapes) → KPIs → Facture → Rapport
```

Chaque transition est tracée dans `audit_logs` ET émet un `domain_event`.

---

## 📁 Structure du repo (monorepo pnpm)

```
sensads/
├── apps/
│   ├── web/              # Vite SPA (app dashboard)
│   └── landing/          # Astro/Vite landing page
├── packages/
│   ├── core/             # TypeScript pur partagé (pricing, currency, format, schemas Zod)
│   └── db/               # Types Supabase générés + helpers
├── supabase/
│   ├── migrations/       # SQL migrations (NNN_description.sql)
│   ├── functions/        # Edge Functions Deno
│   └── config.toml
├── .github/workflows/    # CI, deploy, backup, uptime
├── ROADMAP.md           # Plan 12 semaines
├── CLAUDE.md            # Ce fichier
└── README.md
```

---

## 🛡️ Convention nommage migrations

```
supabase/migrations/
  001_meta_tokens.sql
  002_core_tables.sql
  003_tariffs_benchmarks.sql
  004_client_tables.sql
  005_quotes.sql
  006_purchase_orders.sql
  007_campaigns.sql
  008_kpis.sql
  009_invoices.sql
  010_intelligence.sql
  011_forecasts.sql
  012_notifications.sql
  013_audit_logs.sql
  014_reports.sql
  015_events_webhooks.sql
  016_monitoring.sql
```

**Chaque migration** :
- A un commentaire d'en-tête (description + date + rollback)
- Active RLS sur toute table créée
- Définit au moins 1 policy par rôle concerné
- Inclut les index nécessaires
- Inclut les triggers (audit, immutable, numérotation)

---

## 🧮 Calculs financiers — Source de vérité

Toute logique financière vit dans `packages/core/src/pricing.ts`, `currency.ts`, `format.ts`. Ces 3 fichiers ont **100% de coverage tests** obligatoire.

### Ordre de calcul devis (immuable)

```
selling_price (override client OU tarif standard)
   ↓
× quantité
   ↓
- remise (si client.discount_percentage > 0)
   ↓
= sous-total HT
   ↓
+ TVA (app_settings.vat_rate, default 19%)
   ↓
= total TTC
```

### Conversion KPI → DZD

```typescript
const dzdAmount = sourceAmount
  * exchange_rate_snapshot  // figé au moment du KPI
  * (selling_price / purchase_price)  // ratio de marge tarif client
```

**Garde-fou** : si `purchase_price <= 0` → ratio = 1 (sécurité division par zéro).

---

## 🧪 Workflow de dev local (à suivre)

```bash
# 1. Démarrer Supabase local
supabase start

# 2. Appliquer migrations en local
supabase db reset

# 3. Démarrer le dev server
pnpm --filter web dev

# 4. Modifications schema → nouvelle migration
supabase migration new mon_changement

# 5. Tester en local
supabase db reset
pnpm test

# 6. Push en prod (uniquement quand validé)
supabase db push --linked
git push origin main  # déclenche deploy Hostinger
```

---

## 🚀 Déploiement

- **Frontend** : `git push origin main` → GitHub Actions `deploy.yml` → rsync vers Hostinger via SSH → symlink rotation (5 derniers builds)
- **Edge Functions** : `supabase functions deploy <name> --project-ref <ref>`
- **Migrations** : `supabase db push --linked` (UNIQUEMENT après test local)

---

## ⚠️ Anti-patterns à JAMAIS commettre

❌ `select *` sans pagination sur des tables > 50 lignes
❌ `ALTER TABLE DROP COLUMN` en prod sans backup + downtime planifié
❌ `console.log` en prod (utiliser table `function_logs`)
❌ `purchase_price = 0` en seed ou test (CHECK bloquant)
❌ Conversion DZD côté client (toujours côté serveur ou avec `exchange_rate_snapshot` figé)
❌ Storage public sur buckets autres que `branding`
❌ `service_role_key` exposée côté client
❌ Trigger SECURITY DEFINER sans `SET search_path = ''`
❌ Notification avec `recipient_id = NULL` (broadcast = sécurité)
❌ Webhook secret en clair dans le payload de réponse API

---

## 📞 Décisions politiques tranchées

### Conversion DZD multi-périodes
- **KPI quotidien** : taux du jour du KPI (`kpi.date`)
- **Devis prévisionnel** : taux du jour du devis, figé dans `quote.exchange_rate_snapshot`
- **Facture finale** : somme des `total_spent_dzd` quotidiens (déjà convertis avec leur snapshot)
- **Différentiel taux** : ligne `currency_translation_gain_loss` sur la facture

### BDC annulation
- Pas de `DELETE` ni `UPDATE` du montant
- Action `cancel_with_refund` réservée `super_admin`
- Génère un `credit_notes` (avoir) référençant le BDC original
- Audit log obligatoire avec motif texte

### Multi-devises ad accounts
- 1 campagne = 1 ad account = 1 devise source
- Validation à la création (UNIQUE `ad_account_id` par campaign)
- Aucun mélange possible

### Rétention données
- Soft-delete partout (`deleted_at timestamptz`)
- Hard-delete RGPD : 30 jours après demande
- Audit logs : 5 ans (partition mensuelle, archive trimestrielle vers GitHub repo privé)
- Storage médias : archive 90 jours

---

## 🆘 En cas de doute

1. **Re-lire ce fichier** avant toute décision architecturale
2. **Re-lire ROADMAP.md** pour la priorité de la semaine
3. **Tests d'abord** sur `pricing/currency/format` si touche financier
4. **Demander confirmation** au product owner (toi) avant tout choix structurel non documenté ici
