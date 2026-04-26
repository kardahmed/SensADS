/**
 * ProtectedRoute — guard pour les routes privées.
 *
 * Vérifie auth + rôle. Redirige vers /login si non auth,
 * vers /403 si rôle non autorisé.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

interface Props {
  allowedRoles?: UserRole[];
}

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

  return <Outlet />;
}
