import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Receipt, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { INVOICE_STATUSES, formatAmount, formatDate, type InvoiceStatus } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useInvoices } from '@/hooks/useInvoices';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending_review: 'En revue',
  draft: 'Brouillon',
  validated: 'Validée',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
  adjusted: 'Ajustée',
};

export function InvoicesPage(): JSX.Element {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });
  const { data, isLoading, error } = useInvoices({
    page, pageSize, status: statusFilter, organizationId: orgFilter || undefined,
  });

  const filtered = data && search.trim()
    ? data.data.filter((i) => i.number.toLowerCase().includes(search.toLowerCase()))
    : data?.data;

  const baseRoute = isStaff ? '/admin/invoices' : '/client/invoices';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Factures</h1>
        <p className="mt-1 text-sm text-textSecondary">
          {isStaff ? 'Toutes les factures émises.' : 'Vos factures.'}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Rechercher</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
              <Input className="pl-9" placeholder="FAC-2026-..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Statut</label>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as InvoiceStatus | ''); setPage(1); }}>
              <option value="">Tous</option>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          {isStaff && orgsData && (
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-textSecondary">Client</label>
              <Select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                {orgsData.data.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </Select>
            </div>
          )}
        </div>
      </Card>

      {error && <Alert variant="error">{error instanceof Error ? error.message : 'Erreur'}</Alert>}
      {isLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {!isLoading && filtered && filtered.length === 0 && (
        <EmptyState icon={<Receipt className="h-8 w-8" />} title="Aucune facture" description="Les factures sont générées automatiquement à la fin des campagnes." />
      )}

      {!isLoading && filtered && filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/40 text-left">
                  <th className="p-3 font-medium text-textSecondary">Numéro</th>
                  {isStaff && <th className="p-3 font-medium text-textSecondary">Client</th>}
                  <th className="p-3 text-right font-medium text-textSecondary">Sous-total HT</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Total TTC</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 font-medium text-textSecondary">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const org = orgsData?.data.find((o) => o.id === inv.organizationId);
                  return (
                    <tr key={inv.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-background/40" onClick={() => navigate(`${baseRoute}/${inv.id}`)}>
                      <td className="p-3"><Link to={`${baseRoute}/${inv.id}`} className="font-mono text-xs font-medium text-textPrimary hover:text-accent">{inv.number}</Link></td>
                      {isStaff && <td className="p-3 text-textSecondary text-xs">{org?.name ?? '—'}</td>}
                      <td className="p-3 text-right tabular-nums text-textSecondary">{formatAmount(inv.subtotalDzd, lang)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{formatAmount(inv.totalDzd, lang)}</td>
                      <td className="p-3"><StatusBadge status={inv.status} type="invoice" language={lang} /></td>
                      <td className="p-3 text-xs text-textSecondary">{formatDate(inv.createdAt, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isLoading && data && data.totalCount > 0 && (
        <PaginationControls
          currentPage={data.currentPage}
          totalPages={data.totalPages}
          totalCount={data.totalCount}
          pageSize={data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}

