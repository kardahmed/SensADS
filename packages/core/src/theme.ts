/**
 * theme.ts — Tokens design system.
 *
 * 2 thèmes :
 * - LANDING : style Stripe (WHITE) — vitrine du SERVICE, pas de l'app
 * - APP : DARK mode — outil interne
 */

export const LANDING_THEME = {
  background: '#FFFFFF',
  cardAlt: '#F6F9FC',
  textPrimary: '#0A2540',
  textSecondary: '#425466',
  textMuted: '#8898AA',
  accentPrimary: '#00D4FF',
  accentSecondary: '#38BDF8',
  border: '#E6EBF1',
  success: '#10B981',
} as const;

export const APP_THEME = {
  background: '#0A0E1A',
  sidebar: '#111827',
  card: '#1F2937',
  border: '#374151',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  accent: '#6366F1',
  violet: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

export const LOGO_COLORS = {
  cyanBright: '#00D4FF',
  blueMedium: '#38BDF8',
  blueDark: '#1E3A8A',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Wilayas algériennes (58) — ordre officiel */
export const ALGERIAN_WILAYAS = [
  '01 - Adrar',
  '02 - Chlef',
  '03 - Laghouat',
  "04 - Oum El Bouaghi",
  '05 - Batna',
  '06 - Béjaïa',
  '07 - Biskra',
  '08 - Béchar',
  '09 - Blida',
  '10 - Bouira',
  '11 - Tamanrasset',
  '12 - Tébessa',
  '13 - Tlemcen',
  '14 - Tiaret',
  '15 - Tizi Ouzou',
  '16 - Alger',
  '17 - Djelfa',
  '18 - Jijel',
  '19 - Sétif',
  '20 - Saïda',
  '21 - Skikda',
  '22 - Sidi Bel Abbès',
  '23 - Annaba',
  '24 - Guelma',
  '25 - Constantine',
  '26 - Médéa',
  '27 - Mostaganem',
  "28 - M'Sila",
  '29 - Mascara',
  '30 - Ouargla',
  '31 - Oran',
  '32 - El Bayadh',
  '33 - Illizi',
  '34 - Bordj Bou Arreridj',
  '35 - Boumerdès',
  '36 - El Tarf',
  '37 - Tindouf',
  '38 - Tissemsilt',
  '39 - El Oued',
  '40 - Khenchela',
  '41 - Souk Ahras',
  '42 - Tipaza',
  '43 - Mila',
  '44 - Aïn Defla',
  '45 - Naâma',
  '46 - Aïn Témouchent',
  '47 - Ghardaïa',
  '48 - Relizane',
  '49 - Timimoun',
  '50 - Bordj Badji Mokhtar',
  '51 - Ouled Djellal',
  '52 - Béni Abbès',
  '53 - In Salah',
  '54 - In Guezzam',
  "55 - Touggourt",
  '56 - Djanet',
  "57 - El M'Ghair",
  '58 - El Meniaa',
] as const;
