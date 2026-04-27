/**
 * useWizardDraft — Auto-save localStorage du wizard campagne.
 *
 * Clé : wizard_draft_{user_id}_{org_id}_{session_uuid}
 * (correction audit S5 : pas de fuite cross-tab)
 */

import { useEffect, useRef, useState } from 'react';
import type { WizardState } from '@/pages/wizard/types';

export function useWizardDraft(userId: string | undefined, orgId: string | undefined) {
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const [draftKey, setDraftKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !orgId) return;
    setDraftKey(`wizard_draft_${userId}_${orgId}_${sessionIdRef.current}`);
  }, [userId, orgId]);

  const save = (state: WizardState) => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ...state, savedAt: Date.now() }));
    } catch {
      // ignore quota errors
    }
  };

  const load = (): WizardState | null => {
    if (!draftKey) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      return JSON.parse(raw) as WizardState;
    } catch {
      return null;
    }
  };

  const clear = () => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
  };

  return { save, load, clear };
}
