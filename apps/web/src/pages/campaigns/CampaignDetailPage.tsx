/**
 * /admin/campaigns/:id, /tm/campaigns/:id, /client/campaigns/:id — Détail campagne.
 *
 * Affiche : infos + KPIs + actions de validation TM (approve/reject/start/complete).
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Play, Square, BarChart3, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatAmount,
  formatDate,
  getPlatform,
  type Campaign,
  type CampaignStatus,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useUpdateCampaignStatus } from '@/hooks/useCampaigns';
import { useCampaignKpis } from '@/hooks/useKpis';
import { useOrganization } from '@/hooks/useOrganizations';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { KpiEntryDialog } from './KpiEntryDialog';

export function CampaignDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile, isStaff } = useAuth();
  const toast = useToast();

  const { data: rawCampaign, isLoading, error } = useCampaign(id);
  const campaign = rawCampaign as (Campaign & { ad_sets?: Array<{ id: string; name: string; ads: unknown[] }>; }) | null;
  const { data: org } = useOrganization(campaign?.organizationId);
  const { data: kpis } = useCampaignKpis(id);
  const updateStatus = useUpdateCampaignStatus();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (error || !campaign) {
    return (
      <Alert variant="error" title="Campagne introuvable">
        {error instanceof Error ? error.message : 'Cette campagne n\'existe pas.'}
      </Alert>
    );
  }

  const platform = getPlatform(campaign.platform);
  const isMetaApi = platform?.mode === 'api';
  const baseRoute = profile?.role === 'traffic_manager' ? '/tm/campaigns' : isStaff ? '/admin/campaigns' : '/client/campaigns';

  const transition = async (newStatus: CampaignStatus, opts?: { reason?: string; externalId?: string; successMsg?: string }) => {
    try {
      await updateStatus.mutateAsync({ id: campaign.id, newStatus, reason: opts?.reason, externalId: opts?.externalId });
      toast.show({ variant: 'success', title: opts?.successMsg ?? 'Statut mis à jour' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const handleApprove = async () => {
    if (isMetaApi) {
      // Pour Meta API : passe en "approved" (draft Meta créé). En réalité l'Edge Function meta-oauth s'en occuperait.
      await transition('approved', { successMsg: 'Campagne approuvée — draft Meta à créer' });
    } else {
      // Manuel : demande l'external_id puis active direct
      if (!externalId.trim()) {
        toast.show({ variant: 'error', title: 'ID plateforme requis pour les campagnes manuelles' });
        return;
      }
      await transition('active', { externalId, successMsg: 'Campagne activée' });
      setApproveOpen(false);
      setExternalId('');
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 5) {
      toast.show({ variant: 'error', title: 'Motif obligatoire (min 5 caractères)' });
      return;
    }
    await transition('rejected', { reason: rejectReason, successMsg: 'Campagne rejetée' });
    setRejectOpen(false);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-textPrimary">{campaign.number}</h1>
              <StatusBadge status={campaign.status} type="campaign" language={lang} />
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {campaign.name} · {platform?.name} · {org?.name ?? '—'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-textSecondary">Budget</p>
          <p className="text-2xl font-bold tabular-nums text-textPrimary">{formatAmount(campaign.budgetDzd, lang)}</p>
          <p className="text-xs text-textSecondary mt-1">Dépensé : {formatAmount(campaign.totalSpentDzd, lang)}</p>
        </div>
      </div>

      {/* Actions TM/admin */}
      {isStaff && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            {campaign.status === 'in_review' && (
              <>
                <Button onClick={() => setApproveOpen(true)}>
                  <CheckCircle2 className="h-4 w-4" />
                  {isMetaApi ? 'Approuver (Meta draft)' : 'Approuver et activer'}
                </Button>
                <Button variant="danger" onClick={() => setRejectOpen(true)}>
                  <XCircle className="h-4 w-4" />Rejeter
                </Button>
              </>
            )}
            {campaign.status === 'approved' && isMetaApi && (
              <Button onClick={() => transition('active', { successMsg: 'Campagne lancée' })}>
                <Play className="h-4 w-4" />Lancer
              </Button>
            )}
            {campaign.status === 'active' && (
              <>
                <Button variant="outline" onClick={() => transition('paused', { successMsg: 'Campagne mise en pause' })}>
                  Pause
                </Button>
                <Button onClick={() => transition('completed', { successMsg: 'Campagne terminée — facturation auto à venir' })}>
                  <Square className="h-4 w-4" />Terminer
                </Button>
              </>
            )}
            {campaign.status === 'paused' && (
              <Button onClick={() => transition('active', { successMsg: 'Campagne reprise' })}>
                <Play className="h-4 w-4" />Reprendre
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info + KPIs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>KPIs quotidiens</CardTitle>
            {isStaff && (
              <Button size="sm" onClick={() => setKpiDialogOpen(true)}>
                <BarChart3 className="h-4 w-4" />Saisir KPI
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!kpis || kpis.length === 0 ? (
              <p className="py-6 text-center text-sm text-textSecondary">Aucun KPI saisi pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-textSecondary">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 text-right font-medium">Dépense</th>
                      <th className="pb-2 text-right font-medium">Impressions</th>
                      <th className="pb-2 text-right font-medium">Clics</th>
                      <th className="pb-2 text-right font-medium">Conv.</th>
                      <th className="pb-2 text-right font-medium">CTR</th>
                      <th className="pb-2 text-right font-medium">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((k) => (
                      <tr key={k.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2 font-mono text-xs">{formatDate(k.date, lang)}</td>
                        <td className="py-2 text-right tabular-nums">{formatAmount(k.spendDzd, lang)}</td>
                        <td className="py-2 text-right tabular-nums">{k.impressions.toLocaleString('fr-DZ')}</td>
                        <td className="py-2 text-right tabular-nums">{k.clicks.toLocaleString('fr-DZ')}</td>
                        <td className="py-2 text-right tabular-nums">{k.conversions}</td>
                        <td className="py-2 text-right tabular-nums">{(k.ctr * 100).toFixed(2)}%</td>
                        <td className="py-2 text-right tabular-nums">{k.cpa.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Détails</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-textSecondary">Objectif :</span> {campaign.optimizationGoal.toUpperCase()}</div>
              <div><span className="text-textSecondary">Mode budget :</span> <Badge variant="neutral">{campaign.budgetMode.toUpperCase()}</Badge></div>
              <div><span className="text-textSecondary">Période :</span> {formatDate(campaign.startDate, lang)}{campaign.endDate ? ` → ${formatDate(campaign.endDate, lang)}` : ''}</div>
              <div><span className="text-textSecondary">Ad account :</span> <code className="font-mono text-xs">{campaign.adAccountId}</code></div>
              {campaign.externalId && (
                <div><span className="text-textSecondary">ID plateforme :</span> <code className="font-mono text-xs">{campaign.externalId}</code></div>
              )}
              {campaign.specialAdCategory !== 'none' && (
                <Badge variant="warning">Catégorie : {campaign.specialAdCategory}</Badge>
              )}
              <div><span className="text-textSecondary">Ad sets :</span> {campaign.ad_sets?.length ?? 0}</div>
              <div><span className="text-textSecondary">Annonces :</span> {campaign.ad_sets?.reduce((s, as) => s + (as.ads?.length ?? 0), 0) ?? 0}</div>
            </CardContent>
          </Card>

          {org && (
            <Card>
              <CardHeader><CardTitle>Client</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-textSecondary" />
                  <span className="font-medium">{org.name}</span>
                </div>
                {isStaff && (
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => navigate(`/admin/clients/${org.id}`)}>
                    Voir le client
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {campaign.rejectedReason && (
            <Alert variant="error" title="Motif rejet">{campaign.rejectedReason}</Alert>
          )}
        </div>
      </div>

      {/* Approve dialog (manuel) */}
      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} title="Approuver la campagne">
        {isMetaApi ? (
          <div className="space-y-3">
            <Alert variant="info">
              Mode API Meta : la campagne sera créée en draft sur Meta API. Approuver la passe en statut &quot;approved&quot;.
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveOpen(false)}>Annuler</Button>
              <Button onClick={handleApprove}>Approuver</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert variant="info">
              Mode manuel : la campagne sera marquée &quot;active&quot;. Saisis l&apos;ID externe (ID de la campagne sur la plateforme).
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="externalId">ID externe sur {platform?.name}</Label>
              <Input id="externalId" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Ex: 1234567890" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveOpen(false)}>Annuler</Button>
              <Button onClick={handleApprove} disabled={!externalId.trim()}>Approuver et activer</Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Rejeter la campagne">
        <div className="space-y-3">
          <Label htmlFor="rejectReason">Motif (min 5 caractères)</Label>
          <Textarea id="rejectReason" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Annuler</Button>
            <Button variant="danger" onClick={handleReject}>Confirmer rejet</Button>
          </DialogFooter>
        </div>
      </Dialog>

      <KpiEntryDialog
        campaignId={campaign.id}
        organizationId={campaign.organizationId}
        open={kpiDialogOpen}
        onClose={() => setKpiDialogOpen(false)}
      />
    </div>
  );
}
