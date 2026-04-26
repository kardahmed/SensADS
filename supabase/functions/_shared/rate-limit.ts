/**
 * Rate limiting via table `edge_function_rate_limits`.
 *
 * Pattern :
 *   const limited = await checkRateLimit({ functionName, userId, limit: 5, windowMinutes: 5 });
 *   if (limited) return respondError(429, 'Rate limit exceeded');
 *   await recordAttempt(...);
 */

import { createServiceClient } from './auth.ts';

export interface RateLimitOptions {
  functionName: string;
  userId?: string;
  organizationId?: string;
  resourceId?: string;
  ipAddress?: string;
  limit: number;
  windowMinutes: number;
}

export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  const service = createServiceClient();
  const since = new Date(Date.now() - opts.windowMinutes * 60 * 1000).toISOString();

  let query = service
    .from('edge_function_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('function_name', opts.functionName)
    .gte('attempted_at', since);

  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.organizationId) query = query.eq('organization_id', opts.organizationId);
  if (opts.resourceId) query = query.eq('resource_id', opts.resourceId);
  if (opts.ipAddress) query = query.eq('ip_address', opts.ipAddress);

  const { count } = await query;
  return (count ?? 0) >= opts.limit;
}

export async function recordAttempt(opts: RateLimitOptions): Promise<void> {
  const service = createServiceClient();
  await service.from('edge_function_rate_limits').insert({
    function_name: opts.functionName,
    user_id: opts.userId ?? null,
    organization_id: opts.organizationId ?? null,
    resource_id: opts.resourceId ?? null,
    ip_address: opts.ipAddress ?? null,
  });
}
