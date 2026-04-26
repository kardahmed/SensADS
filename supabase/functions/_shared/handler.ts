/**
 * Handler factory — pattern obligatoire pour toutes les Edge Functions.
 *
 * Usage :
 *   serve(createHandler('my-function', async (ctx) => {
 *     // ctx.auth est déjà validé
 *     // ctx.body est déjà parsé
 *     return respondJson(ctx.req, { ok: true });
 *   }, { requireAuth: true, allowedRoles: ['admin'] }));
 */

import { authenticate, requireRole, type AuthContext } from './auth.ts';
import { handleCorsOptions } from './cors.ts';
import { FunctionLogger, generateRequestId } from './logger.ts';
import { respondError, respondJson } from './response.ts';

export interface HandlerContext {
  req: Request;
  body: unknown;
  auth: AuthContext;
  logger: FunctionLogger;
  requestId: string;
}

export interface HandlerOptions {
  requireAuth?: boolean;
  allowedRoles?: string[];
  parseBody?: boolean;
}

export type HandlerFn = (ctx: HandlerContext) => Promise<Response>;

export function createHandler(
  functionName: string,
  handler: HandlerFn,
  options: HandlerOptions = {},
): (req: Request) => Promise<Response> {
  const { requireAuth = true, allowedRoles, parseBody = true } = options;

  return async (req: Request): Promise<Response> => {
    // 1. CORS preflight
    const cors = handleCorsOptions(req);
    if (cors) return cors;

    const requestId = req.headers.get('x-request-id') ?? generateRequestId();

    // 2. Authentification
    let auth: AuthContext | null = null;
    if (requireAuth) {
      const authResult = await authenticate(req);
      if ('status' in authResult) {
        return respondError(req, authResult.status, authResult.message);
      }
      auth = authResult;

      // 3. Vérification rôle
      if (allowedRoles) {
        const roleError = requireRole(auth, allowedRoles);
        if (roleError) {
          return respondError(req, roleError.status, roleError.message);
        }
      }
    }

    // 4. Logger
    const logger = new FunctionLogger({
      functionName,
      requestId,
      userId: auth?.userId,
      organizationId: auth?.organizationId ?? undefined,
    });

    // 5. Parse body
    let body: unknown = null;
    if (parseBody && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : null;
      } catch {
        return respondError(req, 400, 'Invalid JSON body');
      }
    }

    await logger.start(body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined);

    // 6. Exécution
    try {
      const response = await handler({
        req,
        body,
        auth: auth as AuthContext,
        logger,
        requestId,
      });
      await logger.success(response.status);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await logger.failure(500, error.message, error.stack);
      return respondError(req, 500, 'Internal server error', { requestId });
    }
  };
}

export { respondError, respondJson };
