/**
 * i18n.ts — Configuration react-i18next.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';
import en from '@/locales/en.json';

const STORAGE_KEY = 'sensads_lang';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
const initialLang = stored === 'fr' || stored === 'en' ? stored : 'fr';

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function setLanguage(lang: 'fr' | 'en'): void {
  void i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
}

export default i18n;
