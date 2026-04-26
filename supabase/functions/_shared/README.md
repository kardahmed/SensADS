# `_shared` — Utilitaires Edge Functions

Code partagé entre toutes les Edge Functions.

## Modules

- **`auth.ts`** — Authentification (JWT validé côté serveur), `createServiceClient()`, `requireOrgAccess()`
- **`cors.ts`** — Headers CORS et preflight OPTIONS
- **`response.ts`** — `respondJson()`, `respondError()` cohérents
- **`logger.ts`** — `FunctionLogger` qui persiste dans `function_logs`
- **`rate-limit.ts`** — Limitations par user/org/resource via table `edge_function_rate_limits`
- **`handler.ts`** — `createHandler()` : factory pour standardiser auth + CORS + logger + body parsing

## Pattern obligatoire

```typescript
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createHandler, respondJson } from '../_shared/handler.ts';

serve(
  createHandler(
    'my-function',
    async (ctx) => {
      // ctx.auth est déjà validé (JWT)
      // ctx.body est déjà parsé
      // ctx.logger persiste les logs

      return respondJson(ctx.req, { ok: true });
    },
    {
      requireAuth: true,
      allowedRoles: ['admin', 'super_admin'],
    },
  ),
);
```

## Sécurité

⚠️ **Ne JAMAIS** récupérer `org_id` depuis `ctx.body`. Toujours via `ctx.auth.organizationId` (extrait du JWT validé).
