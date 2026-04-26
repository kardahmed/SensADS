/**
 * Auth helpers — extraction du JWT côté SERVEUR (jamais du body client).
 *
 * RÈGLE : toute Edge Function qui manipule des données utilisateur DOIT
 *  - extraire le user_id depuis le JWT validé
 *  - lookup org_id depuis profiles
 *  - JAMAIS faire confiance à un org_id passé dans le body
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string | null;
  role: string;
  jwt: string;
}

export interface AuthError {
  status: number;
  message: string;
}

/**
 * Crée un client service_role pour les opérations privilégiées.
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Crée un client en mode user (avec le JWT du caller, RLS appliquée).
 */
export function createUserClient(jwt: string): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Authentifie une requête et retourne le contexte utilisateur.
 * Lookup org_id et role depuis profiles via service_role (sécurisé).
 */
export async function authenticate(req: Request): Promise<AuthContext | AuthError> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, message: 'Missing Authorization header' };
  }

  const jwt = authHeader.slice(7);
  const userClient = createUserClient(jwt);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return { status: 401, message: 'Invalid JWT' };
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, email, organization_id, role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return { status: 403, message: 'Profile not found' };
  }

  return {
    userId: profile.id as string,
    email: profile.email as string,
    organizationId: profile.organization_id as string | null,
    role: profile.role as string,
    jwt,
  };
}

/**
 * Vérifie qu'un rôle est autorisé. Sinon retourne une erreur.
 */
export function requireRole(ctx: AuthContext, allowed: string[]): AuthError | null {
  if (!allowed.includes(ctx.role)) {
    return {
      status: 403,
      message: `Role '${ctx.role}' not allowed. Required: ${allowed.join(' OR ')}`,
    };
  }
  return null;
}

/**
 * Vérifie l'accès à une organisation.
 * - super_admin/admin : toujours OK
 * - traffic_manager : OK si assigné à cette org
 * - client : OK si c'est sa propre org
 */
export async function requireOrgAccess(
  ctx: AuthContext,
  targetOrgId: string,
): Promise<AuthError | null> {
  if (ctx.role === 'super_admin' || ctx.role === 'admin') return null;

  if (ctx.role === 'traffic_manager') {
    const service = createServiceClient();
    const { data, error } = await service
      .from('organizations')
      .select('id')
      .eq('id', targetOrgId)
      .eq('assigned_tm_id', ctx.userId)
      .single();
    if (error || !data) {
      return { status: 403, message: 'TM not assigned to this organization' };
    }
    return null;
  }

  if (ctx.role === 'client_owner' || ctx.role === 'client_member') {
    if (ctx.organizationId !== targetOrgId) {
      return { status: 403, message: 'Cross-organization access denied' };
    }
    return null;
  }

  return { status: 403, message: 'Unknown role' };
}
