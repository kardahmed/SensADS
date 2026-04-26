/**
 * meta-refresh-tokens — pg_cron quotidien 02h00 UTC.
 *
 * Refresh les tokens Meta qui expirent dans < 7 jours.
 * Long-lived tokens Meta peuvent être étendus en réutilisant l'endpoint d'échange.
 *
 * Triggered by: pg_cron OR manual via service_role.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { handleCorsOptions } from '../_shared/cors.ts';
import { FunctionLogger, generateRequestId } from '../_shared/logger.ts';
import { respondError, respondJson } from '../_shared/response.ts';

const META_LONG_LIVED_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';

serve(async (req) => {
  const cors = handleCorsOptions(req);
  if (cors) return cors;

  // Sécurité : seul le service_role peut appeler (cron interne)
  const authHeader = req.headers.get('authorization');
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!authHeader?.includes(expectedKey)) {
    return respondError(req, 401, 'Service role required');
  }

  const logger = new FunctionLogger({
    functionName: 'meta-refresh-tokens',
    requestId: generateRequestId(),
  });
  await logger.start();

  const service = createServiceClient();
  const appId = Deno.env.get('META_APP_ID') ?? '';
  const appSecret = Deno.env.get('META_APP_SECRET') ?? '';

  // Sélectionner les tokens qui expirent dans < 7 jours
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: tokens, error } = await service
    .from('meta_tokens')
    .select('id, organization_id, ad_account_id, access_token_encrypted, refresh_failures_count')
    .eq('is_active', true)
    .lt('token_expires_at', sevenDaysFromNow);

  if (error) {
    await logger.failure(500, error.message);
    return respondError(req, 500, error.message);
  }

  let refreshed = 0;
  let failed = 0;

  for (const token of tokens ?? []) {
    try {
      // Décoder le token actuel
      const { data: plainToken } = await service.rpc('decrypt_token', {
        encrypted_token: token.access_token_encrypted,
      });
      if (!plainToken) {
        failed += 1;
        continue;
      }

      // Refresh via fb_exchange_token
      const resp = await fetch(
        `${META_LONG_LIVED_URL}?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${plainToken}`,
      );

      if (!resp.ok) {
        failed += 1;
        await service
          .from('meta_tokens')
          .update({
            refresh_failures_count: token.refresh_failures_count + 1,
            is_active: token.refresh_failures_count >= 3 ? false : true,
          })
          .eq('id', token.id);
        await logger.warn('Token refresh failed', { tokenId: token.id, status: resp.status });
        continue;
      }

      const { access_token, expires_in } = await resp.json();
      const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      const { data: encryptedNewToken } = await service.rpc('encrypt_token', { plain_token: access_token });

      await service
        .from('meta_tokens')
        .update({
          access_token_encrypted: encryptedNewToken,
          token_expires_at: newExpiresAt,
          last_refreshed_at: new Date().toISOString(),
          refresh_failures_count: 0,
        })
        .eq('id', token.id);

      refreshed += 1;
    } catch (err) {
      failed += 1;
      const error = err instanceof Error ? err : new Error(String(err));
      await logger.error('Refresh exception', error, { tokenId: token.id });
    }
  }

  await logger.success(200, { refreshed, failed, total: tokens?.length ?? 0 });
  return respondJson(req, { refreshed, failed, total: tokens?.length ?? 0 });
});
