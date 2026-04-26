/**
 * useAuth — Hook React pour l'authentification Supabase.
 *
 * Expose :
 *  - user (Profile depuis la table profiles)
 *  - role helpers (isSuperAdmin, isAdmin, isStaff, isClient)
 *  - signIn / signOut / resetPassword
 *  - état loading
 *
 * Le profil est chargé depuis `profiles` (pas seulement le JWT) car le
 * rôle est en DB et peut changer (promotion / révocation par admin).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { dbProfileToProfile, isAdmin, isClient, isStaff, isSuperAdmin } from '@sensads/core';
import type { Profile } from '@sensads/core';
import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/error-logger';

interface AuthContextValue {
  session: Session | null;
  authUser: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Role helpers
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isClient: boolean;
  // Actions
  signIn: (input: { email: string; password: string }) => Promise<{ error?: string; needsMfa?: boolean }>;
  verifyMfa: (input: { factorId: string; code: string }) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    void logError(error ?? new Error('Profile not found'), {
      level: 'warn',
      metadata: { userId },
    });
    return null;
  }

  return dbProfileToProfile(data as never);
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s);
    if (s?.user) {
      const p = await loadProfile(s.user.id);
      setProfile(p);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await refresh();
      if (mounted) setIsLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        void loadProfile(s.user.id).then((p) => {
          if (mounted) setProfile(p);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const signIn = useCallback<AuthContextValue['signIn']>(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) return { error: error.message };

    // Vérifier MFA
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
      return { needsMfa: true };
    }

    if (data.user) {
      const p = await loadProfile(data.user.id);
      setProfile(p);
    }

    return {};
  }, []);

  const verifyMfa = useCallback<AuthContextValue['verifyMfa']>(async ({ factorId, code }) => {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) return { error: challengeError.message };

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });
    if (error) return { error: error.message };
    await refresh();
    return {};
  }, [refresh]);

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      authUser: session?.user ?? null,
      profile,
      isLoading,
      isAuthenticated: !!session && !!profile,
      isSuperAdmin: isSuperAdmin(profile?.role),
      isAdmin: isAdmin(profile?.role),
      isStaff: isStaff(profile?.role),
      isClient: isClient(profile?.role),
      signIn,
      verifyMfa,
      signOut,
      resetPassword,
      refresh,
    }),
    [session, profile, isLoading, signIn, verifyMfa, signOut, resetPassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
