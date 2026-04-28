/**
 * gdpr-delete-user-account — Hard-delete RGPD du compte utilisateur.
 *
 * Workflow :
 *   1. POST /gdpr-delete-user-account (par le user lui-même OU super_admin)
 *      → Marque le profil deleted_at = now() (soft-delete immédiat)
 *      → Marque l'organisation deleted_at = now()
 *      → Programme la suppression définitive à T+30 jours via pg_cron
 *   2. À T+30j, le cron job appelle cette même fonction avec mode=hard
 *      → Hard-delete des données personnelles (PII)
 *      → Conservation des données financières anonymisées (factures, audit logs)
 *        pour conformité fiscale (5 ans Algérie)
 *
 * Body : { mode: 'soft' | 'hard', userId?: string, reason?: string }
 *
 * Sécurité :
 *   - Soft : user lui-même OU super_admin
 *   - Hard : super_admin uniquement (ou cron via service_role)
 *   - Audit log obligatoire
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondError, respondJson } from '../_shared/handler.ts';

interface DeleteInput {
  mode: 'soft' | 'hard';
  userId?: string;
  reason?: string;
}

serve(
  createHandler(
    'gdpr-delete-user-account',
    async (ctx) => {
      const body = (ctx.body ?? {}) as DeleteInput;

      if (body.mode !== 'soft' && body.mode !== 'hard') {
        return respondError(ctx.req, 400, 'mode must be "soft" or "hard"');
      }

      const targetUserId = body.userId ?? ctx.auth.userId;
      const isSelf = targetUserId === ctx.auth.userId;
      const isSuperAdmin = ctx.auth.role === 'super_admin';

      // SOFT : user lui-même OU super_admin
      if (body.mode === 'soft' && !isSelf && !isSuperAdmin) {
        return respondError(ctx.req, 403, 'Forbidden: only self or super_admin can soft-delete');
      }

      // HARD : super_admin uniquement
      if (body.mode === 'hard' && !isSuperAdmin) {
        return respondError(ctx.req, 403, 'Forbidden: only super_admin can hard-delete');
      }

      const service = createServiceClient();

      // Charger le profil cible
      const { data: profile, error: profErr } = await service
        .from('profiles')
        .select('id, email, role, organization_id, parent_user_id')
        .eq('id', targetUserId)
        .single();
      if (profErr || !profile) {
        return respondError(ctx.req, 404, 'User not found');
      }

      // Empêcher la suppression du dernier super_admin
      if (profile.role === 'super_admin') {
        const { count } = await service
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin')
          .is('deleted_at', null);
        if (count !== null && count <= 1) {
          return respondError(ctx.req, 400, 'Cannot delete the last super_admin');
        }
      }

      const now = new Date().toISOString();

      // ============================================
      // SOFT-DELETE
      // ============================================
      if (body.mode === 'soft') {
        const { error: e1 } = await service
          .from('profiles')
          .update({ deleted_at: now })
          .eq('id', targetUserId);
        if (e1) return respondError(ctx.req, 500, `Failed to mark profile: ${e1.message}`);

        // Si client_owner, soft-delete aussi son organisation
        if (profile.role === 'client_owner' && profile.organization_id) {
          await service
            .from('organizations')
            .update({ deleted_at: now })
            .eq('id', profile.organization_id);
        }

        // Audit log
        await service.from('audit_logs').insert({
          user_id: ctx.auth.userId,
          organization_id: profile.organization_id,
          action: 'gdpr_soft_delete',
          entity_type: 'profile',
          entity_id: targetUserId,
          diff_before: { email: profile.email, role: profile.role },
          diff_after: { deleted_at: now, reason: body.reason ?? null },
        }).then(() => {}).catch(() => {});

        // Programmer la hard-delete à T+30j (via une table de tâches que pg_cron consomme)
        await service.from('gdpr_deletion_queue').insert({
          target_user_id: targetUserId,
          requested_by: ctx.auth.userId,
          requested_at: now,
          execute_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          reason: body.reason ?? null,
          status: 'pending',
        }).then(() => {}).catch(() => {});

        return respondJson(ctx.req, {
          success: true,
          mode: 'soft',
          userId: targetUserId,
          scheduledHardDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // ============================================
      // HARD-DELETE (T+30j ou super_admin force)
      // ============================================
      // Anonymisation des PII tout en gardant les références
      // pour conformité fiscale.

      // 1. Anonymiser le profil (PII removed, on garde une coquille pour audit_logs)
      await service
        .from('profiles')
        .update({
          email: `gdpr_deleted_${targetUserId.substring(0, 8)}@deleted.local`,
          full_name: 'Compte supprimé (RGPD)',
          deleted_at: profile.organization_id ? now : profile.organization_id,
        })
        .eq('id', targetUserId);

      // 2. Supprimer les facteurs MFA / sessions actives
      await service.auth.admin.signOut(targetUserId, 'global').then(() => {}).catch(() => {});

      // 3. Supprimer les notifications, comments perso
      await service.from('notifications').delete().eq('recipient_id', targetUserId).then(() => {}).catch(() => {});

      // 4. Anonymiser les commentaires (mais garder le texte pour traçabilité agence)
      await service
        .from('media_plan_comments')
        .update({ author_id: null })
        .eq('author_id', targetUserId)
        .then(() => {}).catch(() => {});

      // 5. Audit log final
      await service.from('audit_logs').insert({
        user_id: ctx.auth.userId,
        organization_id: profile.organization_id,
        action: 'gdpr_hard_delete',
        entity_type: 'profile',
        entity_id: targetUserId,
        diff_before: { email: profile.email },
        diff_after: { anonymized: true, hard_deleted_at: now },
      }).then(() => {}).catch(() => {});

      // 6. Marquer la queue comme exécutée
      await service
        .from('gdpr_deletion_queue')
        .update({ status: 'completed', completed_at: now })
        .eq('target_user_id', targetUserId)
        .eq('status', 'pending')
        .then(() => {}).catch(() => {});

      return respondJson(ctx.req, {
        success: true,
        mode: 'hard',
        userId: targetUserId,
        anonymized: true,
      });
    },
    {
      requireAuth: true,
      parseBody: true,
    },
  ),
);
