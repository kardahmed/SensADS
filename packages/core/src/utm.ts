/**
 * utm.ts — Génération et parsing UTM pour tracking campagnes.
 *
 * Format SensADS :
 *   utm_source   = platform id (facebook, instagram, tiktok...)
 *   utm_medium   = cpc / cpm / cpa selon objectif
 *   utm_campaign = campaign_number (CAM-YYYY-NNNNN)
 *   utm_content  = adset_name + "_" + ad_name (slugifié)
 *   utm_term     = optimization_goal
 */

export interface UtmParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string;
  utm_term?: string;
}

/**
 * Slugifie un texte pour usage URL (UTM-safe).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Génère les paramètres UTM pour une annonce.
 */
export function generateUTM(input: {
  platform: string;
  optimizationGoal: string;
  campaignNumber: string;
  adsetName?: string;
  adName?: string;
}): UtmParams {
  const { platform, optimizationGoal, campaignNumber, adsetName, adName } = input;

  // Map objective → medium standard
  const goalToMedium: Record<string, string> = {
    cpc: 'cpc',
    cpm: 'cpm',
    cpa: 'cpa',
    cpv: 'cpv',
    conversions: 'cpa',
    traffic: 'cpc',
    awareness: 'cpm',
    engagement: 'cpm',
    leads: 'cpa',
    sales: 'cpa',
  };
  const utm_medium = goalToMedium[optimizationGoal] ?? 'cpc';

  const params: UtmParams = {
    utm_source: slugify(platform),
    utm_medium,
    utm_campaign: campaignNumber,
    utm_term: slugify(optimizationGoal),
  };

  if (adsetName || adName) {
    const content = [adsetName, adName].filter(Boolean).map(slugify).join('_');
    if (content) params.utm_content = content;
  }

  return params;
}

/**
 * Ajoute (ou remplace) les UTM dans une URL.
 */
export function appendUTM(baseUrl: string, params: UtmParams): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl; // URL invalide, on retourne tel quel
  }

  const utmKeys: (keyof UtmParams)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ];

  for (const key of utmKeys) {
    const value = params[key];
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Parse les UTM depuis une URL.
 */
export function parseUTM(url: string): Partial<UtmParams> {
  try {
    const parsed = new URL(url);
    const result: Partial<UtmParams> = {};

    const source = parsed.searchParams.get('utm_source');
    const medium = parsed.searchParams.get('utm_medium');
    const campaign = parsed.searchParams.get('utm_campaign');
    const content = parsed.searchParams.get('utm_content');
    const term = parsed.searchParams.get('utm_term');

    if (source) result.utm_source = source;
    if (medium) result.utm_medium = medium;
    if (campaign) result.utm_campaign = campaign;
    if (content) result.utm_content = content;
    if (term) result.utm_term = term;

    return result;
  } catch {
    return {};
  }
}

/**
 * Vérifie qu'une URL contient déjà tous les UTM requis.
 */
export function hasCompleteUTM(url: string): boolean {
  const parsed = parseUTM(url);
  return !!(parsed.utm_source && parsed.utm_medium && parsed.utm_campaign);
}
