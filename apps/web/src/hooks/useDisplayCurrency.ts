/**
 * useDisplayCurrency — Préférence d'affichage des coûts (DZD / USD / Both).
 *
 * Hiérarchie de résolution :
 *   1. Toggle session (localStorage) — choix volatil de l'utilisateur courant
 *   2. profile.preferred_display_mode (DB) — préférence personnelle persistée
 *   3. organization.preferred_display_currency (DB) — défaut org
 *   4. 'DZD' fallback
 *
 * Le toggle est exposé dans le header global pour switcher rapidement.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';

export type DisplayCurrencyMode = 'DZD' | 'USD' | 'BOTH';

const STORAGE_KEY = 'sensads.displayCurrency';

function readFromStorage(): DisplayCurrencyMode | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'DZD' || v === 'USD' || v === 'BOTH') return v;
    return null;
  } catch {
    return null;
  }
}

function writeToStorage(mode: DisplayCurrencyMode | null): void {
  try {
    if (mode === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function useDisplayCurrency(): {
  mode: DisplayCurrencyMode;
  setMode: (m: DisplayCurrencyMode) => void;
  resetToDefault: () => void;
} {
  const { profile } = useAuth();
  const [sessionMode, setSessionMode] = useState<DisplayCurrencyMode | null>(() => readFromStorage());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSessionMode(readFromStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((m: DisplayCurrencyMode) => {
    writeToStorage(m);
    setSessionMode(m);
  }, []);

  const resetToDefault = useCallback(() => {
    writeToStorage(null);
    setSessionMode(null);
  }, []);

  // Note : preferred_display_mode (profile) et default_display_currency (organization)
  // ne sont pas encore exposés sur le client. Quand ils le seront, les ajouter ici.
  // Pour l'instant : session > 'DZD' fallback.
  const profileFallback: DisplayCurrencyMode | null = (profile as unknown as {
    preferredDisplayMode?: DisplayCurrencyMode;
  } | null)?.preferredDisplayMode ?? null;

  const resolved: DisplayCurrencyMode = sessionMode ?? profileFallback ?? 'DZD';

  return { mode: resolved, setMode, resetToDefault };
}
