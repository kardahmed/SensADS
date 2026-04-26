/**
 * health — Endpoint de santé pour monitoring uptime.
 *
 * Public (pas d'auth requise) — utilisé par GitHub Actions cron 5min.
 *
 * Response : { status, timestamp, version, db, auth, storage }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { handleCorsOptions } from '../_shared/cors.ts';
import { respondJson } from '../_shared/response.ts';

serve(async (req) => {
  const cors = handleCorsOptions(req);
  if (cors) return cors;

  const checks: Record<string, boolean> = {
    db: false,
    auth: false,
    storage: false,
  };

  try {
    const service = createServiceClient();

    // DB check
    const { error: dbError } = await service
      .from('app_settings')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    checks.db = !dbError;

    // Auth check (just verify URL configured)
    checks.auth = !!Deno.env.get('SUPABASE_URL');

    // Storage check
    const { error: storageError } = await service.storage.listBuckets();
    checks.storage = !storageError;
  } catch {
    // Erreur silencieuse, checks reste false
  }

  const allOk = Object.values(checks).every(Boolean);
  const status = allOk ? 200 : 503;

  return respondJson(
    req,
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: Deno.env.get('APP_VERSION') ?? 'unknown',
      checks,
    },
    status,
  );
});
