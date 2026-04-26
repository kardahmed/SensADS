/**
 * backup-financial-data — pg_cron quotidien 03h UTC.
 *
 * Sérialise les tables financières critiques en JSON, retourne un blob.
 * Le GitHub Action `backup.yml` consomme cet endpoint et commit le dump
 * chiffré GPG dans le repo privé `sensads-backups`.
 *
 * Tables incluses :
 *  - organizations, profiles
 *  - quotes, quote_lines
 *  - purchase_orders, credit_notes
 *  - campaigns, ad_sets, ads
 *  - invoices
 *  - audit_logs (mois courant)
 *
 * Cleanup : supprime aussi les anciennes entrées dans rate_limits, function_logs > 30j.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { handleCorsOptions } from '../_shared/cors.ts';
import { FunctionLogger, generateRequestId } from '../_shared/logger.ts';
import { respondError, respondJson } from '../_shared/response.ts';

serve(async (req) => {
  const cors = handleCorsOptions(req);
  if (cors) return cors;

  const authHeader = req.headers.get('authorization');
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!authHeader?.includes(expectedKey)) {
    return respondError(req, 401, 'Service role required');
  }

  const logger = new FunctionLogger({
    functionName: 'backup-financial-data',
    requestId: generateRequestId(),
  });
  await logger.start();

  const service = createServiceClient();

  try {
    const dump: Record<string, unknown[]> = {};
    const tables = [
      'organizations',
      'profiles',
      'app_settings',
      'client_financial_settings',
      'client_ad_accounts',
      'platform_tariffs',
      'client_tariff_overrides',
      'global_benchmarks',
      'quotes',
      'quote_lines',
      'purchase_orders',
      'credit_notes',
      'campaigns',
      'ad_sets',
      'ads',
      'invoices',
      'budget_forecasts',
      'forecast_scenarios',
      'reports',
    ];

    let totalRows = 0;
    for (const table of tables) {
      const { data, error } = await service.from(table).select('*');
      if (error) {
        await logger.warn(`Failed to dump ${table}`, { error: error.message });
        continue;
      }
      dump[table] = data ?? [];
      totalRows += (data ?? []).length;
    }

    // Audit logs : mois courant uniquement
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: auditLogs } = await service
      .from('audit_logs')
      .select('*')
      .gte('created_at', monthStart.toISOString());
    dump['audit_logs_current_month'] = auditLogs ?? [];
    totalRows += (auditLogs ?? []).length;

    // Cleanup
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await service
      .from('edge_function_rate_limits')
      .delete()
      .lt('attempted_at', thirtyDaysAgo);
    await service.from('function_logs').delete().lt('started_at', thirtyDaysAgo);
    await service.from('login_attempts').delete().lt('attempted_at', thirtyDaysAgo);

    const metadata = {
      exportedAt: new Date().toISOString(),
      version: '1',
      totalTables: Object.keys(dump).length,
      totalRows,
    };

    await logger.success(200, metadata);

    return new Response(
      JSON.stringify({ metadata, data: dump }, null, 0),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Backup-Total-Rows': String(totalRows),
        },
      },
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await logger.failure(500, error.message, error.stack);
    return respondError(req, 500, error.message);
  }
});
