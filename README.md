# SensADS by SENSIUM-X

> Outil SaaS interne de gestion de campagnes publicitaires multi-plateformes.
> Digital Traffic Management · Stratégie digitale · Media Buying · Media Planning.

[![CI](https://github.com/kardahmed/sensads/actions/workflows/ci.yml/badge.svg)](https://github.com/kardahmed/sensads/actions/workflows/ci.yml)
[![Deploy](https://github.com/kardahmed/sensads/actions/workflows/deploy.yml/badge.svg)](https://github.com/kardahmed/sensads/actions/workflows/deploy.yml)

---

## ⚡ Quick start

```bash
# Prérequis : Node 22+, pnpm 9+, Docker, Supabase CLI

# 1. Cloner et installer
git clone https://github.com/kardahmed/sensads.git
cd sensads
pnpm install

# 2. Lancer Supabase en local
supabase start

# 3. Appliquer toutes les migrations
supabase db reset

# 4. Configurer .env.local
cp apps/web/.env.example apps/web/.env.local
# Édite et remplis VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (depuis `supabase status`)

# 5. Lancer le dev server
pnpm --filter web dev
```

App disponible sur http://localhost:5173

---

## 📁 Structure

```
sensads/
├── apps/
│   ├── web/              # Vite SPA (dashboard app)
│   └── landing/          # Landing page (vitrine du SERVICE)
├── packages/
│   ├── core/             # TypeScript pur partagé (pricing, currency, format, schemas)
│   └── db/               # Types Supabase + helpers
├── supabase/
│   ├── migrations/       # 16 migrations SQL
│   ├── functions/        # Edge Functions Deno
│   └── config.toml
├── .github/workflows/    # CI, deploy, backup, uptime
├── CLAUDE.md            # Contexte projet pour Claude Code
├── ROADMAP.md           # Plan 12 semaines
└── README.md
```

---

## 🛡️ Principes

- **Sécurité d'abord** : RLS sur toutes les tables, audit logs immutables, 2FA Super Admin, secrets chiffrés pgcrypto.
- **Une source de vérité financière** : `packages/core/src/pricing.ts` + `currency.ts` + `format.ts`. 100% testés.
- **Zéro dépendance externe payante** : GitHub + Supabase + Hostinger + Claude. Stop.
- **Multi-tenant strict** : isolation `organization_id` partout.
- **Multi-langue** : FR par défaut, EN, RTL Arabe prévu.

---

## 🚀 Déploiement

| Composant | Comment | Déclencheur |
|---|---|---|
| Frontend | rsync vers Hostinger via SSH | `git push origin main` |
| Edge Functions | `supabase functions deploy <name> --project-ref <ref>` | Manuel ou CI |
| Migrations | `supabase db push --linked` | Manuel après test local |
| Backup nightly | GitHub Actions cron 03h UTC | Auto |
| Uptime check | GitHub Actions cron 5min | Auto |

---

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** — Contexte projet pour Claude Code (règles, conventions, design system)
- **[ROADMAP.md](./ROADMAP.md)** — Plan 12 semaines vers production
- **`supabase/migrations/`** — Schema DB versionné
- **`supabase/functions/`** — Edge Functions

---

## 🧪 Tests

```bash
pnpm test                 # Vitest unit/integration
pnpm test:e2e             # Playwright E2E
pnpm test:coverage        # Coverage report
```

Coverage minimum : 70% sur `packages/core/`.

---

## 📝 Convention commits

```
feat: ajout d'une fonctionnalité
fix: correction de bug
docs: documentation
refactor: refactoring sans changement comportemental
test: ajout/modification de tests
chore: tâche maintenance (deps, config)
db: migration SQL
edge: Edge Function Supabase
```

---

## 🆘 Support

- Issues : https://github.com/kardahmed/sensads/issues
- Status : https://status.sensads.com
- Docs internes : Notion workspace (privé)

---

## 📜 Licence

Propriétaire — SENSIUM-X — Tous droits réservés.
