/**
 * platforms.ts — Registre centralisé des 11 plateformes publicitaires.
 *
 * SOURCE DE VÉRITÉ pour le wizard, sidebar, filtres, accordéons tarifs.
 * Pour ajouter une 12e plateforme : ajouter 1 objet ici, c'est tout.
 *
 * Voir CLAUDE.md > "Convention nommage" et docs Notion :
 * "Guide d'ajout de nouvelles plateformes".
 */

export type PlatformMode = 'api' | 'manual';
export type PlatformCategory = 'social' | 'search' | 'video' | 'display' | 'commerce';

export interface PlatformConfig {
  /** Identifiant snake_case unique */
  id: string;
  /** Nom affiché */
  name: string;
  /** Lettre/emoji pour fallback icone */
  iconText: string;
  /** Couleur de la marque (hex) */
  color: string;
  /** Mode : automatisé via API ou saisie manuelle */
  mode: PlatformMode;
  /** Provider OAuth si mode=api */
  apiProvider: 'meta' | 'google' | 'tiktok' | 'snapchat' | 'linkedin' | null;
  /** Catégorie pour grouping UI */
  category: PlatformCategory;
  /** True pour Meta : restriction emploi/logement/crédit/social */
  hasSpecialAdCategory: boolean;
  /** Placements publicitaires supportés */
  placementOptions: string[];
  /** Objectifs d'optimisation par défaut */
  supportedObjectives: string[];
  /** KPIs spécifiques à la plateforme (clés JSONB platform_metrics) */
  specificKpis: string[];
  /** Devise par défaut pour cette plateforme (USD/EUR/AED/INR) */
  defaultCurrency: 'USD' | 'EUR' | 'AED' | 'INR';
  /** Types de média acceptés */
  mediaTypes: ('image' | 'video' | 'carousel' | 'collection')[];
  /** Taille max upload en MB */
  maxMediaSizeMb: number;
}

export const PLATFORMS: PlatformConfig[] = [
  // ============================================
  // META — API (Facebook + Instagram)
  // ============================================
  {
    id: 'facebook',
    name: 'Facebook',
    iconText: 'f',
    color: '#1877F2',
    mode: 'api',
    apiProvider: 'meta',
    category: 'social',
    hasSpecialAdCategory: true,
    placementOptions: ['feed', 'stories', 'reels', 'in_stream', 'right_column', 'marketplace'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'leads', 'app_promotion', 'sales'],
    specificKpis: ['video_p25_watched', 'video_p50_watched', 'video_p75_watched', 'thruplays'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video', 'carousel', 'collection'],
    maxMediaSizeMb: 50,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    iconText: 'ig',
    color: '#E4405F',
    mode: 'api',
    apiProvider: 'meta',
    category: 'social',
    hasSpecialAdCategory: true,
    placementOptions: ['feed', 'stories', 'reels', 'explore', 'shop'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'leads', 'app_promotion', 'sales'],
    specificKpis: ['video_p25_watched', 'video_p50_watched', 'thruplays', 'profile_visits'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video', 'carousel'],
    maxMediaSizeMb: 50,
  },

  // ============================================
  // GOOGLE — Mode manuel pour MVP, API en v3.2
  // ============================================
  {
    id: 'google_search',
    name: 'Google Search',
    iconText: 'G',
    color: '#4285F4',
    mode: 'manual',
    apiProvider: null,
    category: 'search',
    hasSpecialAdCategory: false,
    placementOptions: ['search_network', 'search_partners'],
    supportedObjectives: ['traffic', 'leads', 'sales', 'app_promotion'],
    specificKpis: ['quality_score', 'search_impression_share', 'search_lost_is_budget'],
    defaultCurrency: 'USD',
    mediaTypes: ['image'],
    maxMediaSizeMb: 5,
  },
  {
    id: 'google_display',
    name: 'Google Display',
    iconText: 'GD',
    color: '#34A853',
    mode: 'manual',
    apiProvider: null,
    category: 'display',
    hasSpecialAdCategory: false,
    placementOptions: ['display_network'],
    supportedObjectives: ['awareness', 'traffic', 'leads', 'sales'],
    specificKpis: ['viewable_impressions', 'view_through_conversions'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video'],
    maxMediaSizeMb: 50,
  },
  {
    id: 'youtube',
    name: 'YouTube Ads',
    iconText: 'YT',
    color: '#FF0000',
    mode: 'manual',
    apiProvider: null,
    category: 'video',
    hasSpecialAdCategory: false,
    placementOptions: ['in_stream', 'in_feed', 'shorts', 'bumper'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'leads'],
    specificKpis: ['video_views_25', 'video_views_50', 'video_views_75', 'video_views_100'],
    defaultCurrency: 'USD',
    mediaTypes: ['video'],
    maxMediaSizeMb: 50,
  },
  {
    id: 'performance_max',
    name: 'Performance Max',
    iconText: 'PM',
    color: '#FBBC04',
    mode: 'manual',
    apiProvider: null,
    category: 'search',
    hasSpecialAdCategory: false,
    placementOptions: ['all_google_inventory'],
    supportedObjectives: ['sales', 'leads', 'traffic'],
    specificKpis: ['conversion_value', 'cost_per_conversion'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video'],
    maxMediaSizeMb: 50,
  },
  {
    id: 'demand_gen',
    name: 'Demand Gen',
    iconText: 'DG',
    color: '#EA4335',
    mode: 'manual',
    apiProvider: null,
    category: 'display',
    hasSpecialAdCategory: false,
    placementOptions: ['discover', 'gmail', 'youtube_in_feed'],
    supportedObjectives: ['awareness', 'traffic', 'leads'],
    specificKpis: ['video_views', 'view_through_conversions'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video', 'carousel'],
    maxMediaSizeMb: 50,
  },

  // ============================================
  // TIKTOK — Mode manuel pour MVP, API en v3.2
  // ============================================
  {
    id: 'tiktok',
    name: 'TikTok',
    iconText: 'TT',
    color: '#000000',
    mode: 'manual',
    apiProvider: null,
    category: 'social',
    hasSpecialAdCategory: false,
    placementOptions: ['for_you', 'top_view', 'branded_effect'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'app_promotion', 'sales'],
    specificKpis: ['video_watched_2s', 'video_watched_6s', 'profile_visits'],
    defaultCurrency: 'USD',
    mediaTypes: ['video'],
    maxMediaSizeMb: 50,
  },

  // ============================================
  // SNAPCHAT — Mode manuel pour MVP, API en v3.2
  // ============================================
  {
    id: 'snapchat',
    name: 'Snapchat',
    iconText: 'SC',
    color: '#FFFC00',
    mode: 'manual',
    apiProvider: null,
    category: 'social',
    hasSpecialAdCategory: false,
    placementOptions: ['snap_ads', 'story_ads', 'collection_ads', 'commercials'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'app_promotion', 'sales'],
    specificKpis: ['swipe_ups', 'screen_time_seconds', 'shares'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video'],
    maxMediaSizeMb: 50,
  },

  // ============================================
  // LINKEDIN — Mode manuel pour MVP, API en v3.3
  // ============================================
  {
    id: 'linkedin',
    name: 'LinkedIn',
    iconText: 'in',
    color: '#0A66C2',
    mode: 'manual',
    apiProvider: null,
    category: 'social',
    hasSpecialAdCategory: false,
    placementOptions: ['feed', 'sponsored_messaging', 'text_ads'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'leads'],
    specificKpis: ['lead_gen_form_completions', 'job_applies', 'follows'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video', 'carousel'],
    maxMediaSizeMb: 50,
  },

  // ============================================
  // X / TWITTER — Manuel
  // ============================================
  {
    id: 'twitter',
    name: 'X (Twitter)',
    iconText: 'X',
    color: '#000000',
    mode: 'manual',
    apiProvider: null,
    category: 'social',
    hasSpecialAdCategory: false,
    placementOptions: ['timeline', 'profiles', 'search_results', 'replies'],
    supportedObjectives: ['awareness', 'traffic', 'engagement', 'leads'],
    specificKpis: ['retweets', 'likes', 'replies', 'follows'],
    defaultCurrency: 'USD',
    mediaTypes: ['image', 'video', 'carousel'],
    maxMediaSizeMb: 50,
  },
];

// ============================================
// HELPERS
// ============================================

export function getPlatform(id: string): PlatformConfig | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

export function getPlatformsByMode(mode: PlatformMode): PlatformConfig[] {
  return PLATFORMS.filter((p) => p.mode === mode);
}

export function getPlatformsByCategory(category: PlatformCategory): PlatformConfig[] {
  return PLATFORMS.filter((p) => p.category === category);
}

export function getPlatformIds(): string[] {
  return PLATFORMS.map((p) => p.id);
}

/**
 * Vérifie qu'une plateforme requiert un disclaimer (catégorie spéciale Meta).
 */
export function requiresDisclaimer(
  platformId: string,
  category: 'employment' | 'housing' | 'credit' | 'social_issues_elections' | 'none',
): boolean {
  const platform = getPlatform(platformId);
  if (!platform?.hasSpecialAdCategory) return false;
  return category !== 'none';
}
