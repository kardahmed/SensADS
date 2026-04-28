/**
 * /admin/media-plans & /client/media-plans — Liste des plans média.
 *
 * Workflow bidirectionnel :
 * - Client crée un brief → soumet à l'agence pour validation
 * - Agence crée un plan POUR le client → soumet au client pour validation
 *
 * Statuts visibles : draft / pending / changes_requested / approved / converted / rejected
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatAmount, formatDate } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useMediaPlans, type MediaPlanStatus } from '@/hooks/useMediaPlans';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const STATUS_LABELS: Record<MediaPlanStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  draft: { label: 'Brouillon', variant: 'neutral' },
  pending_other_party: { label: 'En attente validation', variant: 'warning' },
  changes_requested: { label: 'Modifs demandées', variant: 'info' },
  approved: { label: 'Approuvée', variant: 'success' },
  converted: { label: 'Convertie en campagnes', variant: 'success' },
  rejected: { label: 'Rejetée', variant: 'error' },
};

export function MediaPlansPage(): JSX.Element {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff } = useAuth();

  const [statusFilter, setStatusFilter] = useState<MediaPlanStatus | ''>('');
  const [orgFilter, setOrgFilter] = useState('');

  const orgsQ = useOrganizations({ pageSize: 100 });
  const plansQ = useMediaPlans({
    status: statusFilter || undefined,
    organizationId: orgFilter || undefined,
  });

  const baseRoute = isStaff ? '/admin/media-plans' : '/client/media-plans';
  const plans = plansQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">Plans Média</h1>
            <p className="text-sm text-textSecondary">
              {isStaff
                ? 'Briefs clients soumis pour validation, et plans que tu crées pour tes clients.'
                : 'Tes briefs créés et les propositions de l\'agence à valider.'}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MediaPlanStatus | '')}>
            <option value="">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="pending_other_party">En attente validation</option>
            <option value="changes_requested">Modifs demandées</option>
            <option value="approved">Approuvées</option>
            <option value="converted">Converties</option>
            <option value="rejected">Rejetées</option>
          </Select>

          {isStaff && (
            <Select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
              <option value="">Tous les clients</option>
              {(orgsQ.data?.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
        </CardContent>
      </Card>

      {plansQ.isLoading && <Skeleton className="h-64 w-full" />}

      {!plansQ.isLoading && plans.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Aucun plan média"
          description={isStaff
            ? 'Crée un plan pour un client depuis sa fiche BDC, ou attends qu\'il en soumette un.'
            : 'Tu peux créer un brief depuis ton BDC, ou attendre une proposition de l\'agence.'}
        />
      )}

      {!plansQ.isLoading && plans.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/30 text-left text-xs uppercase text-textSecondary">
                  <th className="p-3">Numéro</th>
                  <th className="p-3">Titre</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">Période</th>
                  <th className="p-3 text-right">Budget</th>
                  <th className="p-3 text-right">Items</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const meta = STATUS_LABELS[p.status];
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-border/40 hover:bg-background/30"
                      onClick={() => navigate(`${baseRoute}/${p.id}`)}
                    >
                      <td className="p-3 font-mono text-xs">{p.number}</td>
                      <td className="p-3 font-medium">{p.title}</td>
                      <td className="p-3">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {p.createdByRole === 'agency' ? (
                          <span className="inline-flex items-center gap-1">
                            Agence <ArrowRight className="h-3 w-3" /> Client
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            Client <ArrowRight className="h-3 w-3" /> Agence
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-textSecondary">
                        {formatDate(p.startDate, lang)} → {formatDate(p.endDate, lang)}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatAmount(p.totalBudgetDzd, lang)}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{p.items?.length ?? 0}</td>
                      <td className="p-3 text-right">
                        <Link to={`${baseRoute}/${p.id}`} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost">
                            Voir
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
