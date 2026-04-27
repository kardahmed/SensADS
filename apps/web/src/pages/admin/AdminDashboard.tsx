import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Megaphone, Receipt } from 'lucide-react';
import { formatAmount } from '@sensads/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';

interface Stats {
  clientsActive: number;
  quotesPending: number;
  campaignsActive: number;
  invoicesPending: number;
  totalRevenuePaidDzd: number;
}

export function AdminDashboard(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<Stats> => {
      const [clients, quotes, campaigns, invoices] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'approved']).is('deleted_at', null),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).in('status', ['active', 'paused']),
        supabase.from('invoices').select('total_dzd', { count: 'exact' }).in('status', ['draft', 'validated', 'sent']),
      ]);

      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('total_dzd')
        .eq('status', 'paid');

      const totalPaid = (paidInvoices ?? []).reduce(
        (sum, i) => sum + Number((i as { total_dzd: number }).total_dzd ?? 0),
        0,
      );

      return {
        clientsActive: clients.count ?? 0,
        quotesPending: quotes.count ?? 0,
        campaignsActive: campaigns.count ?? 0,
        invoicesPending: invoices.count ?? 0,
        totalRevenuePaidDzd: totalPaid,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.dashboard')}</h1>
        <p className="mt-1 text-sm text-textSecondary">Vue d&apos;ensemble agence</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} title="Clients actifs" value={data?.clientsActive ?? 0} loading={isLoading} />
        <StatCard icon={<FileText className="h-4 w-4" />} title="Devis en cours" value={data?.quotesPending ?? 0} loading={isLoading} />
        <StatCard icon={<Megaphone className="h-4 w-4" />} title="Campagnes actives" value={data?.campaignsActive ?? 0} loading={isLoading} />
        <StatCard icon={<Receipt className="h-4 w-4" />} title="Factures en attente" value={data?.invoicesPending ?? 0} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenu encaissé total</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <p className="text-3xl font-bold text-success">{formatAmount(data?.totalRevenuePaidDzd ?? 0, lang)}</p>
          )}
          <p className="mt-1 text-xs text-textSecondary">Cumul des factures payées</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, title, value, loading }: { icon: React.ReactNode; title: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-textSecondary">{title}</CardTitle>
        <span className="text-textSecondary">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold text-textPrimary">{value}</p>}
      </CardContent>
    </Card>
  );
}
