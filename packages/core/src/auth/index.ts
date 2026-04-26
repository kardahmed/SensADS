/**
 * auth/index.ts — Helpers d'authentification.
 *
 * Critique : `getOrgFromJWT` est utilisé côté Edge Functions pour
 * extraire `organization_id` du serveur, JAMAIS du body client.
 */

import type { UserRole } from '../constants';

export interface JwtClaims {
  sub: string; // user_id
  email: string;
  role?: string;
  app_metadata?: {
    role?: UserRole;
    organization_id?: string;
  };
  user_metadata?: Record<string, unknown>;
  exp: number;
  iat: number;
}

/**
 * Décode un JWT sans valider la signature (côté client uniquement pour lecture).
 * Côté serveur, utiliser supabase.auth.getUser() qui valide la signature.
 */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Vérifie si un rôle a accès à une opération.
 */
export function hasRole(userRole: UserRole | undefined, allowed: UserRole[]): boolean {
  if (!userRole) return false;
  return allowed.includes(userRole);
}

/**
 * Helpers booléens pour les rôles.
 */
export const isSuperAdmin = (role: UserRole | undefined): boolean => role === 'super_admin';
export const isAdmin = (role: UserRole | undefined): boolean =>
  role === 'super_admin' || role === 'admin';
export const isStaff = (role: UserRole | undefined): boolean =>
  role === 'super_admin' || role === 'admin' || role === 'traffic_manager';
export const isClient = (role: UserRole | undefined): boolean =>
  role === 'client_owner' || role === 'client_member';

/**
 * Retourne l'URL de redirection post-login selon le rôle.
 */
export function getDefaultRouteForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return '/admin';
    case 'traffic_manager':
      return '/tm';
    case 'client_owner':
    case 'client_member':
      return '/client';
    default:
      return '/login';
  }
}

export type { UserRole };
