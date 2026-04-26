/**
 * RoleRouter — redirige `/` vers le dashboard du rôle correspondant.
 */

import { Navigate } from 'react-router-dom';
import { getDefaultRouteForRole } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export function RoleRouter(): JSX.Element {
  const { isLoading, profile } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/auth/login" replace />;
  return <Navigate to={getDefaultRouteForRole(profile.role)} replace />;
}
