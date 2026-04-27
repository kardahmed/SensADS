import type { SpecialAdCategory } from '@sensads/core';

export interface WizardAd {
  id: string;
  name: string;
  format: 'image' | 'video' | 'carousel' | 'collection';
  mediaUrl: string;
  destinationUrl: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface WizardAdSet {
  id: string;
  name: string;
  budgetDzd: number | null;
  startDate: string;
  endDate: string;
  optimizationGoal: string;
  targetingAgeMin: number;
  targetingAgeMax: number;
  targetingGender: 'all' | 'male' | 'female';
  targetingLocations: string[];
  targetingInterests: string[];
  ads: WizardAd[];
}

export interface WizardState {
  // Step 1
  poId: string;
  // Step 2
  name: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  budgetMode: 'cbo' | 'abo';
  startDate: string;
  endDate: string;
  adAccountId: string;
  specialAdCategory: SpecialAdCategory;
  disclaimerText: string;
  // Step 3
  adSets: WizardAdSet[];
  savedAt?: number;
}

export const initialWizardState: WizardState = {
  poId: '',
  name: '',
  platform: '',
  optimizationGoal: '',
  budgetDzd: 0,
  budgetMode: 'cbo',
  startDate: '',
  endDate: '',
  adAccountId: '',
  specialAdCategory: 'none',
  disclaimerText: '',
  adSets: [],
};
