/**
 * gdpr-export-user-data — Export RGPD des données d'un utilisateur.
 *
 * GET /gdpr-export-user-data
 *
 * Retourne un JSON complet de toutes les données personnelles du caller :
 * - profile, organization, ad_accounts
 * - quotes, purchase_orders, campaigns, kpis, invoices, reports
 * - notifications, audit_logs (le concernant)
 *
 * Conforme RGPD article 15 (droit d'accès) et 20 (portabilité).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createServiceClient } from '../_shared/auth.ts';
import { createHandler, respondJson } from '../_shared/handler.ts';

serve(
  createHandler(
    'gdpr-export-user-data',
    async (ctx) => {
      const service = createServiceClient();
      const userId = ctx.auth.userId;
      const orgId = ctx.auth.organizationId;

      const data: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        userId,
        format: 'JSON',
        rgpdArticles: ['15', '20'],
      };

      // Profile
      const { data: profile } = await service.from('profiles').select('*').eq('id', userId).single();
      data.profile = profile;

      if (orgId) {
        const { data: organization } = await service
          .from('organizations')
          .select('*')
          .eq('id', orgId)
          .single();
        data.organization = organization;

        const { data: financial } = await service
          .from('client_financial_settings')
          .select('*')
          .eq('organization_id', orgId)
          .maybeSingle();
        data.financialSettings = financial;

        const { data: adAccounts } = await service
          .from('client_ad_accounts')
          .select('*')
          .eq('organization_id', orgId);
        data.adAccounts = adAccounts;

        const { data: quotes } = await service
          .from('quotes')
          .select('*, quote_lines(*)')
          .eq('organization_id', orgId);
        data.quotes = quotes;

        const { data: pos } = await service
          .from('purchase_orders')
          .select('*')
          .eq('organization_id', orgId);
        data.purchaseOrders = pos;

        const { data: campaigns } = await service
          .from('campaigns')
          .select('*, ad_sets(*, ads(*))')
          .eq('organization_id', orgId);
        data.campaigns = campaigns;

        const { data: invoices } = await service
          .from('invoices')
          .select('*')
          .eq('organization_id', orgId);
        data.invoices = invoices;

        const { data: reports } = await service
          .from('reports')
          .select('*')
          .eq('organization_id', orgId);
        data.reports = reports;
      }

      // Notifications (toujours liées à l'user)
      const { data: notifications } = await service
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId);
      data.notifications = notifications;

      // Audit logs où l'user est l'acteur
      const { data: auditLogs } = await service
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1000);
      data.auditLogsActor = auditLogs;

      // Logger
      await service.rpc('log_action', {
        p_action: 'gdpr.data_exported',
        p_entity_type: 'profile',
        p_entity_id: userId,
        p_metadata: { exportedAt: data.exportedAt },
      });

      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="sensads-export-${userId}-${Date.now()}.json"`,
        },
      });
    },
    { requireAuth: true, parseBody: false },
  ),
);
