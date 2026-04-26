/**
 * /admin/clients — Liste des organisations clientes.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@sensads/core';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useTrafficManagers } from '@/hooks/useTrafficManagers';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { PaginationControls } from '@/components/ui/PaginationControls';

export function ClientsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [tmFilter, setTmFilter] = useState('');
  const [sandboxOnly, setSandboxOnly] = useState(false);

  const { data: tms } = useTrafficManagers();
  const { data, isLoading, error } = useOrganizations({
    page,
    pageSize,
    search: search || undefined,
    assignedTmId: tmFilter || undefined,
    sandboxOnly,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.clients')}</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Gestion des organisations clientes de l&apos;agence.
          </p>
        </div>
        <Button onClick={() => navigate('/admin/clients/new')}>
          <Plus className="h-4 w-4" />
          Nouveau client
        </Button>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">
              Rechercher
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
              <Input
                className="pl-9"
                placeholder="Nom du client..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">
              Traffic Manager
            </label>
            <Select
              value={tmFilter}
              onChange={(e) => {
                setTmFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {tms?.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.fullName ?? tm.email}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sandboxOnly}
              onChange={(e) => {
                setSandboxOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-border"
            />
            <span className="text-textPrimary">Sandbox uniquement</span>
          </label>
        </div>
      </Card>

      {error && (
        <Alert variant="error" title="Erreur de chargement">
          {error instanceof Error ? error.message : 'Inconnu'}
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && data && data.data.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Aucun client"
          description={search || tmFilter || sandboxOnly
            ? 'Aucun résultat pour ces filtres'
            : 'Crée ton premier client pour démarrer'}
          action={
            !search && !tmFilter && !sandboxOnly ? (
              <Button className="mt-2" onClick={() => navigate('/admin/clients/new')}>
                <Plus className="h-4 w-4" />
                Nouveau client
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && data && data.data.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/40 text-left">
                  <th className="p-3 font-medium text-textSecondary">Nom</th>
                  <th className="p-3 font-medium text-textSecondary">NIF / RC</th>
                  <th className="p-3 font-medium text-textSecondary">Wilaya</th>
                  <th className="p-3 font-medium text-textSecondary">TM assigné</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 font-medium text-textSecondary">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((org) => {
                  const tm = tms?.find((t) => t.id === org.assignedTmId);
                  return (
                    <tr
                      key={org.id}
                      className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-background/40"
                      onClick={() => navigate(`/admin/clients/${org.id}`)}
                    >
                      <td className="p-3">
                        <Link
                          to={`/admin/clients/${org.id}`}
                          className="font-medium text-textPrimary hover:text-accent"
                        >
                          {org.name}
                        </Link>
                        {org.legalName && org.legalName !== org.name && (
                          <p className="text-xs text-textSecondary">{org.legalName}</p>
                        )}
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {org.nif ?? <span className="opacity-50">—</span>}
                        {org.rc && <p className="opacity-70">RC: {org.rc}</p>}
                      </td>
                      <td className="p-3 text-textSecondary">
                        {org.wilaya ?? <span className="opacity-50">—</span>}
                      </td>
                      <td className="p-3 text-textSecondary">
                        {tm ? (
                          <span>{tm.fullName ?? tm.email}</span>
                        ) : (
                          <span className="opacity-50">Non assigné</span>
                        )}
                      </td>
                      <td className="p-3">
                        {org.sandboxMode ? (
                          <Badge variant="warning">Sandbox</Badge>
                        ) : (
                          <Badge variant="success">Actif</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {formatDate(org.createdAt, lang)}
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
    </div>
  );
}
