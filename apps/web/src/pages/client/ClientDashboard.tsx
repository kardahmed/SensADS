import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, FileText, Megaphone, Receipt } from 'lucide-react';
import { formatAmount } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';

export function ClientDashboard(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['client-stats', profile?.organizationId],
    enabled: !!profile?.organizationId,
    queryFn: async () => {
      const orgId = profile?.organizationId;
      if (!orgId) return null;
      const [quotes, campaigns, invoices, pos] = await Promise.all([
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('deleted_at', null),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', ['active', 'paused']),
        supabase.from('invoices').select('total_dzd', { count: 'exact' }).eq('organization_id', orgId).in('status', ['draft', 'validated', 'sent']),
        supabase.from('purchase_orders').select('remaining_amount_dzd').eq('organization_id', orgId).eq('status', 'active'),
      ]);

      const totalRemaining = (pos.data ?? []).reduce(
        (sum, po) => sum + Number((po as { remaining_amount_dzd: number }).remaining_amount_dzd ?? 0),
        0,
      );

      return {
        totalQuotes: quotes.count ?? 0,
        activeCampaigns: campaigns.count ?? 0,
        pendingInvoices: invoices.count ?? 0,
        budgetRemaining: totalRemaining,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
          <p className="mt-1 text-sm text-textSecondary">Mon espace client</p>
        </div>
        <Button onClick={() => navigate('/client/quotes/new')}>
          <Plus className="h-4 w-4" />Nouveau devis
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard icon={<FileText className="h-4 w-4" />} title="Devis" value={String(data?.totalQuotes ?? 0)} loading={isLoading} />
        <StatCard icon={<Megaphone className="h-4 w-4" />} title="Campagnes actives" value={String(data?.activeCampaigns ?? 0)} loading={isLoading} />
        <StatCard icon={<Receipt className="h-4 w-4" />} title="Factures en attente" value={String(data?.pendingInvoices ?? 0)} loading={isLoading} />
        <StatCard icon={<Receipt className="h-4 w-4" />} title="Budget BDC restant" value={formatAmount(data?.budgetRemaining ?? 0, lang)} loading={isLoading} small />
      </div>

      <Card>
        <CardHeader><CardTitle>Actions rapides</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/client/quotes/new')}>Créer un devis</Button>
          <Button variant="outline" onClick={() => navigate('/client/campaigns/new')}>Nouvelle campagne</Button>
          <Button variant="outline" onClick={() => navigate('/client/campaigns')}>Voir mes campagnes</Button>
          <Button variant="outline" onClick={() => navigate('/client/invoices')}>Mes factures</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, title, value, loading, small }: { icon: React.ReactNode; title: string; value: string; loading: boolean; small?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-textSecondary">{title}</CardTitle>
        <span className="text-textSecondary">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className={small ? 'text-xl font-bold text-textPrimary' : 'text-3xl font-bold text-textPrimary'}>{value}</p>}
      </CardContent>
    </Card>
  );
}
