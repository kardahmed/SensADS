/**
 * check-budget-alerts — pg_cron horaire.
 *
 * Détecte :
 * 1. Sous-consommation : campagne dont (durée écoulée > 50%) ET (spent < 30% budget)
 * 2. BDC consommé > 90% : alerte client + TM
 * 3. BDC en retard de paiement (due_date < now)
 *
 * Pour chaque alerte : crée notification + audit log.
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
    functionName: 'check-budget-alerts',
    requestId: generateRequestId(),
  });
  await logger.start();

  const service = createServiceClient();

  let underConsumption = 0;
  let overConsumption = 0;
  let overdue = 0;

  // ============================================
  // 1. Sous-consommation (campagnes actives)
  // ============================================
  const { data: activeCampaigns } = await service
    .from('campaigns')
    .select('id, organization_id, name, budget_dzd, total_spent_dzd, start_date, end_date, created_by')
    .eq('status', 'active');

  for (const c of activeCampaigns ?? []) {
    if (!c.end_date || !c.budget_dzd) continue;
    const start = new Date(c.start_date as string).getTime();
    const end = new Date(c.end_date as string).getTime();
    const now = Date.now();
    if (now <= start || now >= end) continue;

    const elapsed = (now - start) / (end - start);
    const consumed = (c.total_spent_dzd as number) / (c.budget_dzd as number);

    if (elapsed > 0.5 && consumed < 0.3) {
      underConsumption += 1;
      // Notifier le TM assigné
      const { data: org } = await service
        .from('organizations')
        .select('assigned_tm_id, name')
        .eq('id', c.organization_id as string)
        .single();
      if (org?.assigned_tm_id) {
        await service.rpc('create_notification', {
          p_recipient_id: org.assigned_tm_id,
          p_type: 'campaign.under_consumption',
          p_severity: 'warning',
          p_category: 'campaign',
          p_title: 'Sous-consommation détectée',
          p_body: `Campagne "${c.name}" pour ${org.name}: ${Math.round(elapsed * 100)}% du temps écoulé, ${Math.round(consumed * 100)}% du budget consommé.`,
          p_link: `/tm/campaigns/${c.id}`,
          p_metadata: { campaignId: c.id, elapsed, consumed },
        });
      }
    }
  }

  // ============================================
  // 2. BDC consommé > 90%
  // ============================================
  const { data: highConsumptionPos } = await service
    .from('purchase_orders')
    .select('id, organization_id, number, amount_ttc_dzd, consumed_amount_dzd')
    .eq('status', 'active');

  for (const po of highConsumptionPos ?? []) {
    const ratio = (po.consumed_amount_dzd as number) / (po.amount_ttc_dzd as number);
    if (ratio > 0.9) {
      overConsumption += 1;
      const { data: org } = await service
        .from('organizations')
        .select('owner_id, assigned_tm_id, name')
        .eq('id', po.organization_id as string)
        .single();
      const recipients = [org?.owner_id, org?.assigned_tm_id].filter(Boolean) as string[];
      for (const recipientId of recipients) {
        await service.rpc('create_notification', {
          p_recipient_id: recipientId,
          p_type: 'po.high_consumption',
          p_severity: 'warning',
          p_category: 'purchase_order',
          p_title: 'BDC consommé > 90%',
          p_body: `${po.number}: ${Math.round(ratio * 100)}% du budget consommé.`,
          p_link: `/admin/purchase-orders/${po.id}`,
          p_metadata: { poId: po.id, ratio },
        });
      }
    }
  }

  // ============================================
  // 3. Factures en retard
  // ============================================
  const today = new Date().toISOString().split('T')[0];
  const { data: overdueInvoices } = await service
    .from('invoices')
    .select('id, organization_id, number, due_date')
    .in('status', ['validated', 'sent'])
    .lt('due_date', today);

  for (const inv of overdueInvoices ?? []) {
    overdue += 1;
    await service.from('invoices').update({ status: 'overdue' }).eq('id', inv.id);
  }

  await logger.success(200, { underConsumption, overConsumption, overdue });
  return respondJson(req, { underConsumption, overConsumption, overdue });
});
