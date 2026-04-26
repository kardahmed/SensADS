import { describe, expect, it } from 'vitest';
import { appendUTM, generateUTM, hasCompleteUTM, parseUTM, slugify } from './utm';

describe('slugify', () => {
  it('basic', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('accents FR', () => {
    expect(slugify('Été à Paris')).toBe('ete-a-paris');
  });
  it('caractères spéciaux', () => {
    expect(slugify("L'agence #1 !!!")).toBe('l-agence-1');
  });
  it('trim trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });
});

describe('generateUTM', () => {
  it('génère utm complet', () => {
    const params = generateUTM({
      platform: 'facebook',
      optimizationGoal: 'conversions',
      campaignNumber: 'CAM-2026-00001',
      adsetName: 'Adset 1',
      adName: 'Annonce A',
    });
    expect(params).toEqual({
      utm_source: 'facebook',
      utm_medium: 'cpa',
      utm_campaign: 'CAM-2026-00001',
      utm_content: 'adset-1_annonce-a',
      utm_term: 'conversions',
    });
  });

  it('sans adset/ad → pas d utm_content', () => {
    const params = generateUTM({
      platform: 'tiktok',
      optimizationGoal: 'traffic',
      campaignNumber: 'CAM-2026-00002',
    });
    expect(params.utm_content).toBeUndefined();
    expect(params.utm_medium).toBe('cpc');
  });
});

describe('appendUTM', () => {
  it('ajoute UTM à URL propre', () => {
    const url = appendUTM('https://example.com/landing', {
      utm_source: 'fb',
      utm_medium: 'cpc',
      utm_campaign: 'CAM-2026-00001',
    });
    expect(url).toContain('utm_source=fb');
    expect(url).toContain('utm_medium=cpc');
    expect(url).toContain('utm_campaign=CAM-2026-00001');
  });

  it('remplace UTM existants', () => {
    const url = appendUTM('https://example.com/?utm_source=old', {
      utm_source: 'new',
      utm_medium: 'cpc',
      utm_campaign: 'CAM-2026-00001',
    });
    expect(url).toContain('utm_source=new');
    expect(url).not.toContain('utm_source=old');
  });

  it('URL invalide → retourne tel quel', () => {
    expect(appendUTM('not-a-url', { utm_source: 'fb', utm_medium: 'cpc', utm_campaign: 'X' })).toBe(
      'not-a-url',
    );
  });
});

describe('parseUTM', () => {
  it('parse une URL avec UTM', () => {
    const parsed = parseUTM(
      'https://example.com/?utm_source=fb&utm_medium=cpc&utm_campaign=CAM-2026-00001',
    );
    expect(parsed.utm_source).toBe('fb');
    expect(parsed.utm_medium).toBe('cpc');
    expect(parsed.utm_campaign).toBe('CAM-2026-00001');
  });

  it('URL sans UTM → objet vide', () => {
    expect(parseUTM('https://example.com/')).toEqual({});
  });

  it('URL invalide → {}', () => {
    expect(parseUTM('garbage')).toEqual({});
  });
});

describe('hasCompleteUTM', () => {
  it('vrai si source+medium+campaign présents', () => {
    expect(
      hasCompleteUTM('https://example.com/?utm_source=fb&utm_medium=cpc&utm_campaign=X'),
    ).toBe(true);
  });

  it('faux si manque campaign', () => {
    expect(hasCompleteUTM('https://example.com/?utm_source=fb&utm_medium=cpc')).toBe(false);
  });
});
