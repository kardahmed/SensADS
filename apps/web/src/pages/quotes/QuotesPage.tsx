/**
 * /admin/quotes ou /client/quotes — Liste des devis.
 *
 * Partagée entre admin/TM/client (RLS filtre les résultats automatiquement).
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  QUOTE_STATUSES,
  formatAmount,
  formatDate,
  type QuoteStatus,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useQuotes } from '@/hooks/useQuotes';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { StatusBadge } from '@/components/ui/StatusBadge';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  accepted: 'Accepté',
  converted: 'Converti BDC',
  expired: 'Expiré',
  cancelled: 'Annulé',
};

export function QuotesPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isStaff, isClient, profile } = useAuth();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // Fetch organizations only if staff (admin/TM)
  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });

  const { data, isLoading, error } = useQuotes({
    page,
    pageSize,
    status: statusFilter,
    organizationId: orgFilter || undefined,
  });

  // Filter local par numero (search)
  const filtered =
    data && search.trim()
      ? data.data.filter((q) => q.number.toLowerCase().includes(search.toLowerCase()))
      : data?.data;

  const baseRoute = isStaff ? '/admin/quotes' : '/client/quotes';
  const newRoute = '/client/quotes/new';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.quotes')}</h1>
          <p className="mt-1 text-sm text-textSecondary">
            {isClient
              ? 'Vos devis et leur statut.'
              : 'Tous les devis de l’agence.'}
          </p>
        </div>
        {(isClient || isStaff) && (
          <Button onClick={() => navigate(newRoute)}>
            <Plus className="h-4 w-4" />
            Nouveau devis
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Rechercher</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
              <Input
                className="pl-9"
                placeholder="DEV-2026-..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Statut</label>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as QuoteStatus | '');
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {QUOTE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>

          {isStaff && orgsData && (
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-textSecondary">Client</label>
              <Select
                value={orgFilter}
                onChange={(e) => {
                  setOrgFilter(e.target.value);
                  setPage(1);
                }}
              >
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
        <Alert variant="error" title="Erreur de chargement">
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
          icon={<FileText className="h-8 w-8" />}
          title="Aucun devis"
          description={
            statusFilter || orgFilter || search
              ? 'Aucun résultat pour ces filtres'
              : isClient
                ? 'Crée ton premier devis pour démarrer'
                : 'Aucun devis créé pour le moment'
          }
          action={
            !statusFilter && !orgFilter && !search && (isClient || isStaff) ? (
              <Button className="mt-2" onClick={() => navigate(newRoute)}>
                <Plus className="h-4 w-4" />
                Nouveau devis
              </Button>
            ) : undefined
          }
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
                  <th className="p-3 text-right font-medium text-textSecondary">Total TTC</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 font-medium text-textSecondary">Valide jusqu&apos;au</th>
                  <th className="p-3 font-medium text-textSecondary">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((quote) => {
                  const org = orgsData?.data.find((o) => o.id === quote.organizationId);
                  const isExpired =
                    quote.validUntil && new Date(quote.validUntil) < new Date()
                      && !['accepted', 'converted', 'rejected', 'cancelled'].includes(quote.status);
                  return (
                    <tr
                      key={quote.id}
                      className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-background/40"
                      onClick={() => navigate(`${baseRoute}/${quote.id}`)}
                    >
                      <td className="p-3">
                        <Link
                          to={`${baseRoute}/${quote.id}`}
                          className="font-mono text-xs font-medium text-textPrimary hover:text-accent"
                        >
                          {quote.number}
                        </Link>
                      </td>
                      {isStaff && (
                        <td className="p-3 text-textSecondary">
                          {org?.name ?? <span className="opacity-50">—</span>}
                        </td>
                      )}
                      <td className="p-3 text-right tabular-nums font-medium text-textPrimary">
                        {formatAmount(quote.totalDzd, lang)}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={quote.status} type="quote" language={lang} />
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {quote.validUntil ? (
                          <span className={isExpired ? 'text-warning' : ''}>
                            {formatDate(quote.validUntil, lang)}
                            {isExpired && ' (expiré)'}
                          </span>
                        ) : (
                          <span className="opacity-50">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {formatDate(quote.createdAt, lang)}
                      </td>
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

      <div className="hidden">{profile?.email}</div>
    </div>
  );
}
