/**
 * meta-webhook — Réception des webhooks Meta (Facebook/Instagram).
 *
 * Sécurité :
 *   - Validation HMAC-SHA256 du header X-Hub-Signature-256 (CLAUDE.md règle 4)
 *   - Le secret est stocké en variable d'env META_WEBHOOK_SECRET
 *   - Vérification GET (verify_token) pour subscription Meta
 *   - Anti-replay : dédup via signature dans table function_logs
 *
 * Endpoints :
 *   GET  : verification challenge Meta (x-hub-mode=subscribe)
 *   POST : event payload (changements campaigns/leads/etc.)
 *
 * Dépend de :
 *   META_WEBHOOK_SECRET (Supabase Secrets)
 *   META_WEBHOOK_VERIFY_TOKEN (token de vérif initiale)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { respondError, respondJson } from '../_shared/response.ts';

/**
 * Calcule HMAC-SHA256 d'un payload avec un secret.
 */
async function computeHmacSha256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare 2 strings en temps constant pour éviter les timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // ============================================
  // GET : Verification challenge Meta
  // ============================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');

    if (!expectedToken) {
      return respondError(req, 500, 'META_WEBHOOK_VERIFY_TOKEN not configured');
    }

    if (mode === 'subscribe' && token && timingSafeEqual(token, expectedToken)) {
      return new Response(challenge ?? '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return respondError(req, 403, 'Verification failed');
  }

  // ============================================
  // POST : Event payload
  // ============================================
  if (req.method !== 'POST') {
    return respondError(req, 405, 'Method not allowed');
  }

  const secret = Deno.env.get('META_WEBHOOK_SECRET');
  if (!secret) {
    return respondError(req, 500, 'META_WEBHOOK_SECRET not configured');
  }

  // Lire le body en raw (HMAC se calcule sur le body brut, pas le JSON parsé)
  const rawBody = await req.text();

  // Récupérer la signature Meta
  const signatureHeader = req.headers.get('x-hub-signature-256');
  if (!signatureHeader) {
    return respondError(req, 401, 'Missing X-Hub-Signature-256 header');
  }

  // Format attendu : "sha256=<hex>"
  if (!signatureHeader.startsWith('sha256=')) {
    return respondError(req, 401, 'Invalid signature format');
  }
  const receivedSignature = signatureHeader.substring(7);

  // Calcul de la signature attendue
  const expectedSignature = await computeHmacSha256(rawBody, secret);

  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return respondError(req, 401, 'Invalid signature (HMAC mismatch)');
  }

  // Anti-replay : dédup par signature (5 dernières min)
  const service = createServiceClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: duplicate } = await service
    .from('function_logs')
    .select('id')
    .eq('function_name', 'meta-webhook')
    .eq('request_id', receivedSignature.substring(0, 32))
    .gte('created_at', fiveMinAgo)
    .maybeSingle();

  if (duplicate) {
    // Idempotence : 200 OK silencieux
    return respondJson(req, { ok: true, deduplicated: true });
  }

  // Parser le payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respondError(req, 400, 'Invalid JSON');
  }

  // Logger pour idempotence + audit
  await service.from('function_logs').insert({
    function_name: 'meta-webhook',
    request_id: receivedSignature.substring(0, 32),
    level: 'info',
    message: 'Webhook received and validated',
    metadata: { payload_size: rawBody.length },
  }).then(() => {}).catch(() => {});

  // Stocker l'event entrant pour traitement async (si la table existe)
  await service.from('webhook_events').insert({
    source: 'meta',
    event_type: (payload as { object?: string })?.object ?? 'unknown',
    payload: payload as Record<string, unknown>,
    signature_validated: true,
    received_at: new Date().toISOString(),
    processed: false,
  }).then(() => {}).catch(() => {});

  return respondJson(req, { ok: true });
});
