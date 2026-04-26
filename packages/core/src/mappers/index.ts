/**
 * mappers/index.ts — Conversion DB (snake_case) → Domain (camelCase).
 *
 * Règle : aucun composant ne consomme directement les snake_case Supabase.
 * Tout passe par un mapper. Si on renomme une colonne DB, 1 seul fichier change.
 */

export * from './profile';
export * from './organization';
export * from './app-settings';
export * from './tariff';
export * from './quote';
export * from './purchase-order';
export * from './campaign';
export * from './kpi';
export * from './invoice';
export * from './notification';
