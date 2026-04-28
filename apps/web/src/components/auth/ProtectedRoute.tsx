/**
 * ProtectedRoute — guard pour les routes privées.
 *
 * Vérifie auth + rôle. Redirige vers /login si non auth,
 * vers /403 si rôle non autorisé, vers /account/security
 * si super_admin sans 2FA activée (CLAUDE.md règle 6).
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

interface Props {
  allowedRoles?: UserRole[];
}

const SECURITY_ROUTES_ALLOWED_WITHOUT_2FA = new Set([
  '/account',
  '/account/security',
]);

export function ProtectedRoute({ allowedRoles }: Props): JSX.Element {
  const { isLoading, isAuthenticated, profile } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/403" replace />;
  }

  // CLAUDE.md règle 6 : 2FA TOTP obligatoire pour super_admin.
  // Si super_admin n'a pas activé 2FA, on bloque tout sauf /account/security.
  if (
    profile?.role === 'super_admin'
    && !profile.twoFactorEnabled
    && !SECURITY_ROUTES_ALLOWED_WITHOUT_2FA.has(location.pathname)
  ) {
    return <Navigate to="/account/security" state={{ enforceTwoFactor: true }} replace />;
  }

  return <Outlet />;
}
