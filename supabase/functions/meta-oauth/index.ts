/**
 * meta-oauth — OAuth flow Meta (Facebook/Instagram).
 *
 * GET  /meta-oauth?org_id=X&ad_account_id=Y     → redirect Meta authorize
 * GET  /meta-oauth/callback?code=...&state=...  → exchange code → store encrypted token
 *
 * Sécurité :
 * - state CSRF (HMAC SHA256 du org_id + nonce, expire 10 min)
 * - access_token chiffré via pgp_sym_encrypt avant stockage
 * - org_id extrait du JWT côté serveur (jamais du client)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';
import { createServiceClient, requireOrgAccess } from '../_shared/auth.ts';

const META_AUTHORIZE_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const META_LONG_LIVED_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';

const SCOPES = [
  'ads_management',
  'ads_read',
  'pages_read_engagement',
  'business_management',
];

async function generateState(orgId: string, secret: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const data = `${orgId}|${nonce}|${expiresAt}`;
  const sig = await hmac(data, secret);
  return btoa(`${data}|${sig}`);
}

async function verifyState(state: string, secret: string): Promise<{ orgId: string } | null> {
  try {
    const decoded = atob(state);
    const [orgId, nonce, expiresAt, sig] = decoded.split('|');
    if (!orgId || !nonce || !expiresAt || !sig) return null;
    if (Number.parseInt(expiresAt, 10) < Date.now()) return null;
    const expectedSig = await hmac(`${orgId}|${nonce}|${expiresAt}`, secret);
    if (sig !== expectedSig) return null;
    return { orgId };
  } catch {
    return null;
  }
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  const url = new URL(req.url);

  // ============================================
  // CALLBACK : exchange code → token
  // ============================================
  if (url.pathname.endsWith('/callback')) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return respondError(req, 400, 'Missing code or state');

    const stateSecret = Deno.env.get('META_STATE_SECRET') ?? Deno.env.get('SUPABASE_JWT_SECRET') ?? '';
    const verified = await verifyState(state, stateSecret);
    if (!verified) return respondError(req, 403, 'Invalid or expired state');

    const appId = Deno.env.get('META_APP_ID') ?? '';
    const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth/callback`;

    // Exchange short-lived token
    const tokenResp = await fetch(
      `${META_TOKEN_URL}?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    );
    if (!tokenResp.ok) {
      return respondError(req, 502, 'Meta token exchange failed');
    }
    const shortLived = await tokenResp.json();

    // Exchange for long-lived token (60 days)
    const llResp = await fetch(
      `${META_LONG_LIVED_URL}?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLived.access_token}`,
    );
    if (!llResp.ok) {
      return respondError(req, 502, 'Meta long-lived token exchange failed');
    }
    const longLived = await llResp.json();

    const expiresAt = new Date(Date.now() + (longLived.expires_in ?? 5_184_000) * 1000).toISOString();

    // Stocker chiffré (clé passée en paramètre — Supabase Cloud ne permet pas ALTER DATABASE)
    const service = createServiceClient();
    const pgcryptoKey = Deno.env.get('PGCRYPTO_KEY') ?? '';
    if (!pgcryptoKey) return respondError(req, 500, 'PGCRYPTO_KEY env var missing');
    const { data: encryptedToken } = await service.rpc('encrypt_token', {
      plain_token: longLived.access_token,
      encryption_key: pgcryptoKey,
    });

    await service.from('meta_tokens').upsert({
      organization_id: verified.orgId,
      ad_account_id: 'pending',
      access_token_encrypted: encryptedToken,
      token_type: 'long_lived',
      token_expires_at: expiresAt,
      scopes: SCOPES,
      is_active: true,
      last_refreshed_at: new Date().toISOString(),
      refresh_failures_count: 0,
    });

    return respondJson(req, { ok: true, expiresAt });
  }

  // ============================================
  // INITIATION : redirect to Meta authorize
  // ============================================
  return await createHandler(
    'meta-oauth',
    async (ctx) => {
      const orgId = url.searchParams.get('org_id');
      if (!orgId) return respondError(ctx.req, 400, 'org_id required');

      const orgError = await requireOrgAccess(ctx.auth, orgId);
      if (orgError) return respondError(ctx.req, orgError.status, orgError.message);

      const stateSecret = Deno.env.get('META_STATE_SECRET') ?? Deno.env.get('SUPABASE_JWT_SECRET') ?? '';
      const state = await generateState(orgId, stateSecret);

      const appId = Deno.env.get('META_APP_ID') ?? '';
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth/callback`;

      const authorizeUrl = `${META_AUTHORIZE_URL}?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${SCOPES.join(',')}&state=${state}&response_type=code`;

      return respondJson(ctx.req, { authorizeUrl });
    },
    { requireAuth: true, allowedRoles: ['super_admin', 'admin', 'traffic_manager', 'client_owner'], parseBody: false },
  )(req);
});
