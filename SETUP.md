# 🚀 SETUP — Activation du backend SensADS

> **Toutes les commandes ci-dessous sont à exécuter UNIQUEMENT quand tu seras prêt.**
> Le repo contient TOUS les fichiers nécessaires. Cette doc est le mode d'emploi.

---

## 📋 PRÉREQUIS

À installer **une seule fois** sur ta machine :

| Outil | Commande install | Pourquoi |
|---|---|---|
| Node 22+ | https://nodejs.org/ | Frontend |
| pnpm 9+ | `npm install -g pnpm` | Monorepo |
| Docker Desktop | https://docker.com/ | Supabase local |
| Supabase CLI | `brew install supabase/tap/supabase` (Mac) ou voir https://supabase.com/docs/guides/cli | DB local + deploy |
| Git | déjà installé | - |

---

## ⚡ ÉTAPE 1 — Installer les dépendances

```bash
cd /chemin/vers/sensads
pnpm install
```

Cette commande installe :
- React + Vite + Tailwind + Shadcn (apps/web)
- Vite minimal (apps/landing)
- Zod + tout `packages/core`
- Supabase JS client (`packages/db`)
- ESLint + Prettier + Vitest + Playwright

Durée : 1-2 minutes.

---

## ⚡ ÉTAPE 2 — Démarrer Supabase en LOCAL

```bash
supabase start
```

Cette commande :
- Lance Postgres 15 sur le port `54322`
- Lance Auth, Storage, Realtime, Edge Functions
- Affiche les URLs locales (`API URL`, `anon key`, `service_role key`)

⚠️ Les SQL migrations ne sont PAS encore appliquées. Étape suivante.

---

## ⚡ ÉTAPE 3 — Appliquer les 16 migrations (LOCAL)

```bash
supabase db reset
```

Ceci va :
1. Recréer une DB vierge
2. Appliquer **dans l'ordre** les 16 migrations (`supabase/migrations/001_*.sql` → `016_*.sql`)
3. Exécuter `supabase/seed.sql`

⚠️ Avant d'exécuter en prod : **vérifier qu'il n'y a aucune erreur** dans la sortie.

Si erreur :
```bash
# Voir les logs
supabase db logs
# Tester une migration individuelle
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/001_meta_tokens.sql
```

---

## ⚡ ÉTAPE 4 — Configurer les secrets Supabase (LOCAL)

```bash
# Clé d'encryption pour pgcrypto (à générer)
openssl rand -base64 32
# Copier le résultat puis :
supabase secrets set --env-file .env.local pgcrypto.encryption_key='LA_CLE_GENEREE'
```

Pour le local, tu peux aussi :
```bash
psql -h localhost -p 54322 -U postgres -d postgres -c \
  "ALTER DATABASE postgres SET app.encryption_key = 'LA_CLE_GENEREE';"
```

---

## ⚡ ÉTAPE 5 — Générer les types TypeScript depuis la DB

```bash
pnpm db:types
# Équivalent à : supabase gen types typescript --linked > packages/db/src/generated.ts
```

Le fichier `packages/db/src/generated.ts` est régénéré automatiquement après chaque migration.

---

## ⚡ ÉTAPE 6 — Lancer les tests

```bash
pnpm test           # Vitest unit tests (pricing, currency, format, utm)
pnpm test:coverage  # Avec coverage
pnpm typecheck      # Vérifier types TypeScript
pnpm lint           # ESLint
```

✅ Si vert → backend OK en local.

---

## ⚡ ÉTAPE 7 — Démarrer le dev server

```bash
# Copier le template env
cp apps/web/.env.example apps/web/.env.local
# Éditer .env.local : remplir VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
# (visibles dans la sortie de `supabase start`)

pnpm dev
```

App accessible sur http://localhost:5173

---

## 🌐 ÉTAPE 8 — Lier au projet PROD Supabase

Une fois que tu as créé le projet Supabase Cloud (`sensads-prod`) :

```bash
# Login
supabase login

# Lier le repo au projet prod
supabase link --project-ref <PROD_PROJECT_REF>
# (PROD_PROJECT_REF visible dans Supabase Dashboard > Settings > General)
```

---

## 🌐 ÉTAPE 9 — Pousser les migrations en PROD

⚠️ **À FAIRE SEULEMENT après validation complète en local.**

```bash
# Dry-run pour voir ce qui sera appliqué
supabase db diff --linked

# Push effectif
supabase db push --linked
```

---

## 🌐 ÉTAPE 10 — Déployer les Edge Functions

```bash
# Une par une
supabase functions deploy health
supabase functions deploy login-with-rate-limit
supabase functions deploy meta-oauth
supabase functions deploy meta-refresh-tokens
supabase functions deploy check-budget-alerts
supabase functions deploy compute-performance-periods
supabase functions deploy generate-suggestions
supabase functions deploy gdpr-export-user-data
supabase functions deploy backup-financial-data

# Ou toutes en une fois
supabase functions deploy --project-ref <PROD_REF>
```

Pour configurer leurs secrets :
```bash
supabase secrets set \
  META_APP_ID="<votre_id>" \
  META_APP_SECRET="<votre_secret>" \
  META_STATE_SECRET="$(openssl rand -base64 32)" \
  --project-ref <PROD_REF>
```

---

## 🌐 ÉTAPE 11 — Configurer pg_cron (PROD uniquement)

Dans Supabase Dashboard > Database > Extensions, activer `pg_cron`.

Puis dans SQL Editor :

```sql
-- Refresh tokens Meta tous les jours à 02h00 UTC
SELECT cron.schedule(
  'meta-refresh-tokens',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url := 'https://<PROD_REF>.supabase.co/functions/v1/meta-refresh-tokens',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      )
    );
  $$
);

-- Check budget alerts toutes les heures
SELECT cron.schedule(
  'check-budget-alerts',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://<PROD_REF>.supabase.co/functions/v1/check-budget-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )
    );
  $$
);

-- Compute performance periods le dimanche à 03h00 UTC
SELECT cron.schedule(
  'compute-performance-periods',
  '0 3 * * 0',
  $$
    SELECT net.http_post(
      url := 'https://<PROD_REF>.supabase.co/functions/v1/compute-performance-periods',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )
    );
  $$
);
```

⚠️ Définir d'abord `app.service_role_key` :
```sql
ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
```

---

## 🌐 ÉTAPE 12 — Activer Realtime sur notifications

Dans Supabase Dashboard > Database > Replication > supabase_realtime > activer la table `notifications`.

---

## 🌐 ÉTAPE 13 — Configurer GitHub Secrets

Dans Settings > Secrets and variables > Actions, ajouter :

| Secret | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | URL projet Supabase prod |
| `VITE_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (ne PAS exposer côté client) |
| `HOSTINGER_HOST` | Hostname SSH Hostinger |
| `HOSTINGER_USER` | User SSH |
| `HOSTINGER_SSH_PORT` | Port SSH (souvent 22 ou 65002) |
| `HOSTINGER_SSH_KEY` | Clé privée SSH (multi-line) |
| `HOSTINGER_APP_PATH` | Path absolu app sur Hostinger (ex: `/home/u123/domains/app.sensads.com`) |
| `BACKUPS_REPO_PAT` | Personal Access Token avec scope `repo` pour push vers `sensads-backups` |
| `BACKUP_GPG_PUBLIC_KEY` | Clé GPG publique pour chiffrer backups |
| `BACKUP_GPG_RECIPIENT` | Email associé à la clé GPG |

---

## 🌐 ÉTAPE 14 — Premier déploiement Hostinger

Une fois les secrets configurés :

```bash
git push origin main
```

Le workflow `deploy.yml` :
1. Build l'app web
2. Rsync vers `<HOSTINGER_APP_PATH>/builds/<sha>/`
3. Update symlink `current → builds/<sha>`
4. Health check

---

## 🛠️ COMMANDES DU QUOTIDIEN

```bash
# Démarrer dev
pnpm dev

# Nouvelle migration
supabase migration new ma_migration

# Tester migrations en local (recrée DB)
supabase db reset

# Push migrations en prod (après test local)
supabase db push --linked

# Régénérer types
pnpm db:types

# Tests
pnpm test
pnpm test:e2e

# Build
pnpm build
```

---

## 🔍 EN CAS DE PROBLÈME

| Symptôme | Solution |
|---|---|
| `supabase start` échoue | Docker Desktop tourne ? `docker ps` |
| `supabase db reset` échoue sur migration X | Lire le message, c'est probablement une erreur SQL. Tester `psql -f X.sql` |
| `pnpm install` lent | `pnpm install --frozen-lockfile --prefer-offline` |
| Tests Vitest fail | Vérifier que `pnpm install` a bien tourné |
| Edge Function échoue en local | `supabase functions serve` puis curl |
| Deploy Hostinger échoue | Vérifier secrets GitHub Actions + clé SSH |

---

## 📞 CONTACTS / SUPPORT

- Repo issues : https://github.com/kardahmed/sensads/issues
- Docs internes : Notion workspace
- ROADMAP : voir `ROADMAP.md`
- Règles projet : voir `CLAUDE.md`
