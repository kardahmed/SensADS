/**
 * /admin/campaigns, /tm/campaigns ou /client/campaigns — Liste campagnes.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Megaphone, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CAMPAIGN_STATUSES,
  PLATFORMS,
  formatAmount,
  formatDate,
  getPlatform,
  type CampaignStatus,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
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

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  in_review: 'En revue',
  approved: 'Approuvée',
  active: 'Active',
  paused: 'En pause',
  completed: 'Terminée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

export function CampaignsPage(): JSX.Element {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff, isClient, profile } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });
  const { data, isLoading, error } = useCampaigns({
    page,
    pageSize,
    status: statusFilter,
    platform: platformFilter || undefined,
    organizationId: orgFilter || undefined,
  });

  const filtered =
    data && search.trim()
      ? data.data.filter(
          (c) =>
            c.number.toLowerCase().includes(search.toLowerCase()) ||
            c.name.toLowerCase().includes(search.toLowerCase()),
        )
      : data?.data;

  const baseRoute =
    profile?.role === 'traffic_manager'
      ? '/tm/campaigns'
      : isStaff
        ? '/admin/campaigns'
        : '/client/campaigns';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Campagnes</h1>
          <p className="mt-1 text-sm text-textSecondary">
            {isClient ? 'Vos campagnes publicitaires.' : 'Toutes les campagnes.'}
          </p>
        </div>
        {isClient && (
          <Button onClick={() => navigate('/client/campaigns/new')}>
            <Plus className="h-4 w-4" />
            Nouvelle campagne
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Rechercher</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
              <Input className="pl-9" placeholder="Nom ou CAM-..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Statut</label>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as CampaignStatus | ''); setPage(1); }}>
              <option value="">Tous</option>
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-textSecondary">Plateforme</label>
            <Select value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="Aucune campagne"
          description={isClient ? 'Crée ta 1ère campagne via le wizard.' : 'Aucune campagne pour ces filtres.'}
          action={isClient ? (
            <Button className="mt-2" onClick={() => navigate('/client/campaigns/new')}>
              <Plus className="h-4 w-4" />Nouvelle campagne
            </Button>
          ) : undefined}
        />
      )}

      {!isLoading && filtered && filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/40 text-left">
                  <th className="p-3 font-medium text-textSecondary">N°</th>
                  <th className="p-3 font-medium text-textSecondary">Nom</th>
                  <th className="p-3 font-medium text-textSecondary">Plateforme</th>
                  {isStaff && <th className="p-3 font-medium text-textSecondary">Client</th>}
                  <th className="p-3 text-right font-medium text-textSecondary">Budget</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Dépensé</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 font-medium text-textSecondary">Période</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const platform = getPlatform(c.platform);
                  const org = orgsData?.data.find((o) => o.id === c.organizationId);
                  return (
                    <tr key={c.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-background/40" onClick={() => navigate(`${baseRoute}/${c.id}`)}>
                      <td className="p-3">
                        <Link to={`${baseRoute}/${c.id}`} className="font-mono text-xs font-medium text-textPrimary hover:text-accent">{c.number}</Link>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-textPrimary">{c.name}</p>
                        <p className="text-xs text-textSecondary">{c.optimizationGoal.toUpperCase()}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: platform?.color ?? '#9CA3AF' }}>{platform?.iconText ?? '?'}</div>
                          <span className="text-xs">{platform?.name ?? c.platform}</span>
                        </div>
                      </td>
                      {isStaff && <td className="p-3 text-textSecondary text-xs">{org?.name ?? '—'}</td>}
                      <td className="p-3 text-right tabular-nums">{formatAmount(c.budgetDzd, lang)}</td>
                      <td className="p-3 text-right tabular-nums text-textSecondary">{formatAmount(c.totalSpentDzd, lang)}</td>
                      <td className="p-3"><StatusBadge status={c.status} type="campaign" language={lang} /></td>
                      <td className="p-3 text-xs text-textSecondary">{formatDate(c.startDate, lang)}{c.endDate ? ` → ${formatDate(c.endDate, lang)}` : ''}</td>
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
