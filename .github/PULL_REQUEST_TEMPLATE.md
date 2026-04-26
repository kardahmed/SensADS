## Résumé

<!-- 1-3 phrases : QUOI et POURQUOI -->

## Type

- [ ] feat — Nouvelle fonctionnalité
- [ ] fix — Correction de bug
- [ ] refactor — Refactoring sans changement comportemental
- [ ] db — Migration SQL
- [ ] edge — Edge Function
- [ ] docs — Documentation
- [ ] test — Tests
- [ ] chore — Maintenance

## Checklist

- [ ] Code testé en local (`pnpm test`)
- [ ] Typecheck passe (`pnpm typecheck`)
- [ ] Lint passe (`pnpm lint`)
- [ ] Si migration SQL : testée via `supabase db reset` en local
- [ ] Si touche pricing/currency/format : tests unitaires ajoutés
- [ ] Si nouvelle Edge Function : RLS vérifiée + auth.ts utilisé
- [ ] CLAUDE.md respecté
- [ ] Pas de `console.log` en prod
- [ ] Pas de secrets en clair

## Liens

<!-- Issue, ticket Notion, ROADMAP semaine concernée -->
