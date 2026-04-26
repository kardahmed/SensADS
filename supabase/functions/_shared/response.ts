/**
 * Helpers de réponse JSON cohérents.
 */

import { getCorsHeaders } from './cors.ts';

export function respondJson(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  });
}

export function respondError(
  req: Request,
  status: number,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return respondJson(req, { error: { code: errorCode(status), message, details } }, status);
}

function errorCode(status: number): string {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 500) return 'INTERNAL_ERROR';
  return 'ERROR';
}
