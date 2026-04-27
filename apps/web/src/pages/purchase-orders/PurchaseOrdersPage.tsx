/**
 * /admin/purchase-orders et /client/purchase-orders — Liste BDC.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Receipt, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  PURCHASE_ORDER_STATUSES,
  formatAmount,
  formatDate,
  type PurchaseOrderStatus,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  consumed: 'Consommé',
  cancelled: 'Annulé',
  paid: 'Payé',
};

export function PurchaseOrdersPage(): JSX.Element {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('');
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });
  const { data, isLoading, error } = usePurchaseOrders({
    page,
    pageSize,
    status: statusFilter,
    organizationId: orgFilter || undefined,
  });

  const filtered =
    data && search.trim()
      ? data.data.filter((p) => p.number.toLowerCase().includes(search.toLowerCase()))
      : data?.data;

  const baseRoute = isStaff ? '/admin/purchase-orders' : '/client/purchase-orders';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Bons de commande</h1>
          <p className="mt-1 text-sm text-textSecondary">
            BDC créés depuis les devis acceptés.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Rechercher</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
              <Input className="pl-9" placeholder="BDC-2026-..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Statut</label>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as PurchaseOrderStatus | ''); setPage(1); }}>
              <option value="">Tous</option>
              {PURCHASE_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          {isStaff && orgsData && (
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-textSecondary">Client</label>
              <Select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                {orgsData.data.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Alert variant="error" title="Erreur">
          {error instanceof Error ? error.message : 'Inconnu'}
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {!isLoading && filtered && filtered.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="Aucun BDC"
          description="Convertis un devis accepté pour créer un BDC."
        />
      )}

      {!isLoading && filtered && filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/40 text-left">
                  <th className="p-3 font-medium text-textSecondary">Numéro</th>
                  {isStaff && <th className="p-3 font-medium text-textSecondary">Client</th>}
                  <th className="p-3 text-right font-medium text-textSecondary">Montant TTC</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Consommé</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Restant</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 font-medium text-textSecondary">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => {
                  const org = orgsData?.data.find((o) => o.id === po.organizationId);
                  const consumedRatio = po.amountTtcDzd > 0 ? po.consumedAmountDzd / po.amountTtcDzd : 0;
                  return (
                    <tr key={po.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-background/40" onClick={() => navigate(`${baseRoute}/${po.id}`)}>
                      <td className="p-3">
                        <Link to={`${baseRoute}/${po.id}`} className="font-mono text-xs font-medium text-textPrimary hover:text-accent">
                          {po.number}
                        </Link>
                      </td>
                      {isStaff && (
                        <td className="p-3 text-textSecondary">{org?.name ?? '—'}</td>
                      )}
                      <td className="p-3 text-right tabular-nums">{formatAmount(po.amountTtcDzd, lang)}</td>
                      <td className="p-3 text-right tabular-nums text-textSecondary">{formatAmount(po.consumedAmountDzd, lang)}</td>
                      <td className="p-3">
                        <div className="text-right tabular-nums font-medium">{formatAmount(po.remainingAmountDzd, lang)}</div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full ${consumedRatio > 0.9 ? 'bg-error' : consumedRatio > 0.7 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${Math.min(100, consumedRatio * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={po.status} type="purchase_order" language={lang} />
                      </td>
                      <td className="p-3 text-xs text-textSecondary">{formatDate(po.createdAt, lang)}</td>
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
