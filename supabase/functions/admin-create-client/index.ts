/**
 * admin-create-client — Crée un client complet de manière atomique.
 *
 * 1. Crée l'auth user via Admin API (service_role)
 * 2. Le trigger handle_new_user crée automatiquement le profile (role='client_owner')
 * 3. Insert organization avec owner_id = nouvel user
 * 4. Update profile.organization_id + assigned_tm_id
 * 5. Insert client_financial_settings avec defaults
 *
 * Si étape 3+ échoue → rollback : supprime l'auth user pour éviter les orphelins.
 *
 * Sécurité : seul super_admin ou admin peut appeler.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';

interface CreateClientBody {
  ownerEmail?: string;
  ownerPassword?: string;
  ownerFullName?: string;
  orgName?: string;
  legalName?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  vatId?: string | null;
  address?: string | null;
  wilaya?: string | null;
  country?: string;
  phone?: string | null;
  email?: string | null;
  assignedTmId?: string | null;
  maxSubAccounts?: number;
  sandboxMode?: boolean;
  sourceCurrency?: string;
  exchangeRate?: number;
  discountPercentage?: number;
}

serve(
  createHandler(
    'admin-create-client',
    async (ctx) => {
      const body = (ctx.body ?? {}) as CreateClientBody;

      // Validation
      if (!body.ownerEmail || !body.ownerPassword || !body.orgName) {
        return respondError(ctx.req, 400, 'ownerEmail, ownerPassword, orgName required');
      }
      if (body.ownerPassword.length < 12) {
        return respondError(ctx.req, 400, 'Password must be at least 12 characters');
      }

      const service = createServiceClient();

      // 1. Vérifier que l'email n'est pas déjà pris
      const { data: existing } = await service
        .from('profiles')
        .select('id')
        .eq('email', body.ownerEmail.toLowerCase().trim())
        .maybeSingle();
      if (existing) {
        return respondError(ctx.req, 409, 'Cet email est déjà utilisé');
      }

      // 2. Créer l'auth user via Admin API
      const { data: authData, error: authError } = await service.auth.admin.createUser({
        email: body.ownerEmail.toLowerCase().trim(),
        password: body.ownerPassword,
        email_confirm: true,
        user_metadata: {
          full_name: body.ownerFullName ?? body.ownerEmail,
          role: 'client_owner',
          preferred_language: 'fr',
        },
      });

      if (authError || !authData.user) {
        return respondError(ctx.req, 500, `Auth user creation failed: ${authError?.message}`);
      }

      const ownerUserId = authData.user.id;

      // Le trigger handle_new_user a créé le profile automatiquement.
      // On attend une milliseconde pour s'assurer du commit (au cas où).
      await new Promise((r) => setTimeout(r, 100));

      try {
        // 3. Insert organization
        const { data: org, error: orgError } = await service
          .from('organizations')
          .insert({
            name: body.orgName,
            legal_name: body.legalName ?? null,
            nif: body.nif ?? null,
            nis: body.nis ?? null,
            rc: body.rc ?? null,
            vat_id: body.vatId ?? null,
            address: body.address ?? null,
            wilaya: body.wilaya ?? null,
            country: body.country ?? 'Algérie',
            phone: body.phone ?? null,
            email: body.email ?? null,
            owner_id: ownerUserId,
            assigned_tm_id: body.assignedTmId ?? null,
            sandbox_mode: body.sandboxMode ?? true,
            max_sub_accounts: body.maxSubAccounts ?? 5,
          })
          .select('id')
          .single();

        if (orgError || !org) {
          throw new Error(`Organization insert failed: ${orgError?.message}`);
        }

        const organizationId = org.id as string;

        // 4. Update profile pour le lier à l'org + assigner TM
        const { error: profileError } = await service
          .from('profiles')
          .update({
            organization_id: organizationId,
            assigned_tm_id: body.assignedTmId ?? null,
            full_name: body.ownerFullName ?? null,
          })
          .eq('id', ownerUserId);

        if (profileError) {
          throw new Error(`Profile update failed: ${profileError.message}`);
        }

        // 5. Insert default financial_settings
        const { error: finError } = await service.from('client_financial_settings').insert({
          organization_id: organizationId,
          source_currency: body.sourceCurrency ?? 'USD',
          exchange_rate: body.exchangeRate ?? 250,
          discount_percentage: body.discountPercentage ?? 0,
          payment_terms_days: 30,
        });

        if (finError) {
          throw new Error(`Financial settings insert failed: ${finError.message}`);
        }

        // 6. Audit log
        await service.rpc('log_action', {
          p_action: 'organization.created',
          p_entity_type: 'organization',
          p_entity_id: organizationId,
          p_new_values: {
            name: body.orgName,
            owner_id: ownerUserId,
            assigned_tm_id: body.assignedTmId ?? null,
          },
        });

        return respondJson(ctx.req, {
          organizationId,
          ownerUserId,
        }, 201);
      } catch (err) {
        // Rollback : delete auth user pour éviter orphelin
        await service.auth.admin.deleteUser(ownerUserId).catch(() => {
          // Best effort, on ignore l'erreur de cleanup
        });
        const message = err instanceof Error ? err.message : 'Unknown error';
        return respondError(ctx.req, 500, message);
      }
    },
    {
      requireAuth: true,
      allowedRoles: ['super_admin', 'admin'],
    },
  ),
);
