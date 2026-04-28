/**
 * /admin/media-plans/:id & /client/media-plans/:id — Détail + édition + workflow.
 *
 * Selon le statut + qui consulte (créateur ou autre partie) :
 * - Édition des items (ajout / modif / suppression)
 * - Soumission (draft → pending_other_party)
 * - Approbation / Demande modifs / Rejet par l'autre partie
 * - Conversion en campagnes (super_admin/admin) une fois approuvé
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatAmount, formatDate, formatDateTime, getPlatform, PLATFORMS } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import {
  useAddMediaPlanComment,
  useDeleteMediaPlanItem,
  useMediaPlan,
  useMediaPlanComments,
  useUpdateMediaPlanStatus,
  useUpsertMediaPlanItem,
  type CreativeType,
} from '@/hooks/useMediaPlans';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';

const OBJECTIVES = [
  { id: 'awareness', label: 'Notoriété' },
  { id: 'reach', label: 'Couverture' },
  { id: 'engagement', label: 'Interaction' },
  { id: 'video_views', label: 'Vues vidéo' },
  { id: 'traffic', label: 'Trafic' },
  { id: 'lead_generation', label: 'Lead gen' },
  { id: 'conversions', label: 'Conversions' },
  { id: 'sales', label: 'Ventes catalogue' },
  { id: 'app_installs', label: 'Installs app' },
  { id: 'messages', label: 'Messages' },
];

interface ItemFormState {
  id?: string;
  campaignName: string;
  platform: string;
  optimizationGoal: string;
  budgetDzd: number;
  startDate: string;
  endDate: string;
  audienceDescription: string;
  creativeType: CreativeType;
  driveLink: string;
  postUrl: string;
  landingUrl: string;
  utmCampaign: string;
  notes: string;
}

const EMPTY_ITEM: ItemFormState = {
  campaignName: '',
  platform: 'facebook',
  optimizationGoal: 'awareness',
  budgetDzd: 0,
  startDate: '',
  endDate: '',
  audienceDescription: '',
  creativeType: 'drive_link',
  driveLink: '',
  postUrl: '',
  landingUrl: '',
  utmCampaign: '',
  notes: '',
};

export function MediaPlanDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff, isAdmin, profile } = useAuth();
  const toast = useToast();

  const planQ = useMediaPlan(id);
  const commentsQ = useMediaPlanComments(id);
  const upsertItem = useUpsertMediaPlanItem();
  const deleteItem = useDeleteMediaPlanItem();
  const updateStatus = useUpdateMediaPlanStatus();
  const addComment = useAddMediaPlanComment();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemFormState>(EMPTY_ITEM);
  const [newComment, setNewComment] = useState('');
  const [decisionOpen, setDecisionOpen] = useState<null | 'approve' | 'reject' | 'request_changes'>(null);
  const [decisionNote, setDecisionNote] = useState('');

  const baseRoute = isStaff ? '/admin/media-plans' : '/client/media-plans';

  const plan = planQ.data;
  const items = plan?.items ?? [];

  // Qui peut éditer / soumettre / valider ?
  const isCreatorByRole = plan?.createdByRole === 'client' ? !isStaff : isStaff;
  const isOtherParty = plan?.createdByRole === 'client' ? isStaff : !isStaff;
  const canEdit = plan && ['draft', 'changes_requested'].includes(plan.status) && isCreatorByRole;
  const canSubmit = canEdit && items.length > 0;
  const canReview = plan && plan.status === 'pending_other_party' && isOtherParty;
  const canConvert = plan && plan.status === 'approved' && isAdmin;

  const totalAllocated = useMemo(
    () => items.reduce((s, i) => s + i.budgetDzd, 0),
    [items],
  );

  if (planQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!plan) {
    return <Alert variant="error" title="Plan introuvable">Ce plan média n'existe pas ou tu n'y as pas accès.</Alert>;
  }

  const openNewItem = () => {
    setEditingItem({
      ...EMPTY_ITEM,
      startDate: plan.startDate,
      endDate: plan.endDate,
    });
    setItemDialogOpen(true);
  };

  const openEditItem = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    setEditingItem({
      id: item.id,
      campaignName: item.campaignName,
      platform: item.platform,
      optimizationGoal: item.optimizationGoal,
      budgetDzd: item.budgetDzd,
      startDate: item.startDate,
      endDate: item.endDate,
      audienceDescription: item.audienceDescription ?? '',
      creativeType: item.creativeType,
      driveLink: item.driveLink ?? '',
      postUrl: item.postUrl ?? '',
      landingUrl: item.landingUrl ?? '',
      utmCampaign: item.utmCampaign ?? '',
      notes: item.notes ?? '',
    });
    setItemDialogOpen(true);
  };

  const saveItem = async () => {
    if (!editingItem.campaignName || editingItem.budgetDzd <= 0) {
      toast.show({ variant: 'error', title: 'Nom et budget obligatoires' });
      return;
    }
    try {
      await upsertItem.mutateAsync({
        id: editingItem.id,
        mediaPlanId: plan.id,
        position: editingItem.id ? items.find((i) => i.id === editingItem.id)?.position ?? items.length : items.length,
        campaignName: editingItem.campaignName,
        platform: editingItem.platform,
        optimizationGoal: editingItem.optimizationGoal,
        budgetDzd: editingItem.budgetDzd,
        startDate: editingItem.startDate,
        endDate: editingItem.endDate,
        audienceDescription: editingItem.audienceDescription,
        creativeType: editingItem.creativeType,
        driveLink: editingItem.driveLink,
        postUrl: editingItem.postUrl,
        landingUrl: editingItem.landingUrl,
        utmCampaign: editingItem.utmCampaign,
        notes: editingItem.notes,
      });
      toast.show({ variant: 'success', title: editingItem.id ? 'Item mis à jour' : 'Item ajouté' });
      setItemDialogOpen(false);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm('Supprimer cet item ?')) return;
    try {
      await deleteItem.mutateAsync({ id: itemId, mediaPlanId: plan.id });
      toast.show({ variant: 'success', title: 'Item supprimé' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const submitForReview = async () => {
    try {
      await updateStatus.mutateAsync({ id: plan.id, status: 'pending_other_party' });
      toast.show({
        variant: 'success',
        title: 'Soumis pour validation',
        message: plan.createdByRole === 'client' ? 'Envoyé à l\'agence.' : 'Envoyé au client.',
      });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const submitDecision = async () => {
    if (!decisionOpen) return;
    if ((decisionOpen === 'reject' || decisionOpen === 'request_changes') && decisionNote.trim().length < 5) {
      toast.show({ variant: 'error', title: 'Note obligatoire (min 5 caractères)' });
      return;
    }
    try {
      const newStatus =
        decisionOpen === 'approve' ? 'approved' :
        decisionOpen === 'reject' ? 'rejected' : 'changes_requested';
      await updateStatus.mutateAsync({ id: plan.id, status: newStatus });
      if (decisionNote.trim()) {
        await addComment.mutateAsync({ mediaPlanId: plan.id, body: decisionNote.trim() });
      }
      toast.show({ variant: 'success', title: 'Décision enregistrée' });
      setDecisionOpen(null);
      setDecisionNote('');
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const postComment = async () => {
    if (newComment.trim().length === 0) return;
    try {
      await addComment.mutateAsync({ mediaPlanId: plan.id, body: newComment.trim() });
      setNewComment('');
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const isLockedForEdit = !canEdit;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold text-textPrimary">{plan.number}</h1>
              <h2 className="text-xl font-medium text-textPrimary">— {plan.title}</h2>
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {plan.createdByRole === 'agency' ? 'Plan créé par l\'agence pour le client' : 'Brief client soumis à l\'agence'}
              {' · '}
              {formatDate(plan.startDate, lang)} → {formatDate(plan.endDate, lang)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button onClick={openNewItem}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter une campagne
            </Button>
          )}
          {canSubmit && (
            <Button variant="primary" onClick={submitForReview} isLoading={updateStatus.isPending}>
              <Send className="mr-1 h-4 w-4" /> Soumettre
            </Button>
          )}
          {canReview && (
            <>
              <Button variant="primary" onClick={() => setDecisionOpen('approve')}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approuver
              </Button>
              <Button variant="outline" onClick={() => setDecisionOpen('request_changes')}>
                <AlertCircle className="mr-1 h-4 w-4" /> Demander modifs
              </Button>
              <Button variant="danger" onClick={() => setDecisionOpen('reject')}>
                <XCircle className="mr-1 h-4 w-4" /> Rejeter
              </Button>
            </>
          )}
          {canConvert && (
            <Button variant="primary" onClick={() => toast.show({ variant: 'info', title: 'Conversion via Edge Function (en intégration)' })}>
              <Sparkles className="mr-1 h-4 w-4" /> Convertir en campagnes
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-textSecondary">Statut</p>
            <p className="mt-1 font-bold text-textPrimary">{plan.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-textSecondary">Budget total alloué</p>
            <p className="mt-1 font-mono text-lg font-bold text-textPrimary">
              {formatAmount(totalAllocated, lang)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-textSecondary">Campagnes</p>
            <p className="mt-1 font-mono text-lg font-bold text-textPrimary">{items.length}</p>
          </CardContent>
        </Card>
      </div>

      {plan.description && (
        <Card>
          <CardContent className="p-4 text-sm text-textPrimary">{plan.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campagnes prévues ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm italic text-textSecondary">
              Aucune campagne ajoutée. Clique sur « Ajouter une campagne » pour commencer.
            </p>
          )}

          {items.map((item, idx) => {
            const platform = getPlatform(item.platform);
            const objective = OBJECTIVES.find((o) => o.id === item.optimizationGoal);
            const platformLocked = ['approved', 'converted'].includes(plan.status);

            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-textPrimary">{item.campaignName}</h3>
                      <Badge variant="neutral">
                        {platformLocked ? <Lock className="mr-1 inline h-3 w-3" /> : null}
                        {platform?.name ?? item.platform}
                      </Badge>
                      <Badge variant="info">{objective?.label ?? item.optimizationGoal}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <div>
                        <p className="text-textSecondary">Budget</p>
                        <p className="font-mono font-bold">{formatAmount(item.budgetDzd, lang)}</p>
                      </div>
                      <div>
                        <p className="text-textSecondary">Période</p>
                        <p>
                          {formatDate(item.startDate, lang)} → {formatDate(item.endDate, lang)}
                        </p>
                      </div>
                      <div>
                        <p className="text-textSecondary">Créatif</p>
                        <p>{item.creativeType}</p>
                      </div>
                      <div>
                        <p className="text-textSecondary">UTM</p>
                        <p className="truncate font-mono text-xs">{item.utmCampaign ?? '—'}</p>
                      </div>
                    </div>
                    {item.audienceDescription && (
                      <p className="mt-2 text-xs italic text-textSecondary">
                        Audience : {item.audienceDescription}
                      </p>
                    )}
                    {item.landingUrl && (
                      <p className="mt-1 text-xs text-textSecondary">
                        Landing :{' '}
                        <a href={item.landingUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {item.landingUrl}
                        </a>
                      </p>
                    )}
                    {item.driveLink && (
                      <p className="mt-1 text-xs text-textSecondary">
                        Drive :{' '}
                        <a href={item.driveLink} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {item.driveLink}
                        </a>
                      </p>
                    )}
                    {item.postUrl && (
                      <p className="mt-1 text-xs text-textSecondary">
                        Post :{' '}
                        <a href={item.postUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {item.postUrl}
                        </a>
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEditItem(idx)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeItem(item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Commentaires */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Commentaires ({(commentsQ.data ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(commentsQ.data ?? []).length === 0 && (
            <p className="text-sm italic text-textSecondary">Aucun commentaire pour l'instant.</p>
          )}
          {(commentsQ.data ?? []).map((c) => (
            <div key={c.id} className="rounded-md border border-border bg-background/30 p-3 text-sm">
              <p className="text-xs text-textSecondary">
                {c.authorId === profile?.id ? 'Toi' : c.authorId.slice(0, 8)} · {formatDateTime(c.createdAt, lang)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-textPrimary">{c.body}</p>
            </div>
          ))}

          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder="Ajouter un commentaire..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <Button onClick={() => void postComment()} disabled={newComment.trim().length === 0}>
              Envoyer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Item edit/create */}
      <Dialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        title={editingItem.id ? 'Modifier la campagne' : 'Nouvelle campagne'}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cn">Nom de la campagne *</Label>
            <Input
              id="cn"
              value={editingItem.campaignName}
              onChange={(e) => setEditingItem((s) => ({ ...s, campaignName: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl">Plateforme *</Label>
              <Select
                id="pl"
                value={editingItem.platform}
                onChange={(e) => setEditingItem((s) => ({ ...s, platform: e.target.value }))}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="og">Objectif *</Label>
              <Select
                id="og"
                value={editingItem.optimizationGoal}
                onChange={(e) => setEditingItem((s) => ({ ...s, optimizationGoal: e.target.value }))}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bd">Budget DZD *</Label>
              <Input
                id="bd"
                type="number"
                min="1"
                value={editingItem.budgetDzd}
                onChange={(e) => setEditingItem((s) => ({ ...s, budgetDzd: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct">Type de créatif</Label>
              <Select
                id="ct"
                value={editingItem.creativeType}
                onChange={(e) => setEditingItem((s) => ({ ...s, creativeType: e.target.value as CreativeType }))}
              >
                <option value="drive_link">Lien Drive</option>
                <option value="post_url">Post URL à sponsoriser</option>
                <option value="uploaded_files">Fichiers uploadés</option>
                <option value="mixed">Combinaison</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd">Début</Label>
              <Input
                id="sd"
                type="date"
                value={editingItem.startDate}
                onChange={(e) => setEditingItem((s) => ({ ...s, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed">Fin</Label>
              <Input
                id="ed"
                type="date"
                value={editingItem.endDate}
                onChange={(e) => setEditingItem((s) => ({ ...s, endDate: e.target.value }))}
              />
            </div>
          </div>

          {editingItem.creativeType === 'drive_link' && (
            <div className="space-y-1.5">
              <Label htmlFor="dl">Lien Drive</Label>
              <Input
                id="dl"
                placeholder="https://drive.google.com/..."
                value={editingItem.driveLink}
                onChange={(e) => setEditingItem((s) => ({ ...s, driveLink: e.target.value }))}
              />
            </div>
          )}

          {editingItem.creativeType === 'post_url' && (
            <div className="space-y-1.5">
              <Label htmlFor="pu">URL du post à sponsoriser</Label>
              <Input
                id="pu"
                placeholder="https://instagram.com/p/..."
                value={editingItem.postUrl}
                onChange={(e) => setEditingItem((s) => ({ ...s, postUrl: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lu">Landing URL</Label>
            <Input
              id="lu"
              placeholder="https://..."
              value={editingItem.landingUrl}
              onChange={(e) => setEditingItem((s) => ({ ...s, landingUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="utm">UTM campaign</Label>
            <Input
              id="utm"
              placeholder="ex: notoriete_q2_2026"
              value={editingItem.utmCampaign}
              onChange={(e) => setEditingItem((s) => ({ ...s, utmCampaign: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad">Description audience</Label>
            <Textarea
              id="ad"
              rows={2}
              value={editingItem.audienceDescription}
              onChange={(e) => setEditingItem((s) => ({ ...s, audienceDescription: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nt">Notes / instructions</Label>
            <Textarea
              id="nt"
              rows={2}
              value={editingItem.notes}
              onChange={(e) => setEditingItem((s) => ({ ...s, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => void saveItem()} isLoading={upsertItem.isPending}>
              {editingItem.id ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* Dialog décision (approve / request_changes / reject) */}
      <Dialog
        open={!!decisionOpen}
        onClose={() => { setDecisionOpen(null); setDecisionNote(''); }}
        title={
          decisionOpen === 'approve' ? 'Approuver le plan'
          : decisionOpen === 'request_changes' ? 'Demander des modifications'
          : 'Rejeter le plan'
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dn">
              Note {decisionOpen === 'approve' ? '(optionnelle)' : '(obligatoire, min 5 caractères)'}
            </Label>
            <Textarea
              id="dn"
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={
                decisionOpen === 'approve' ? 'Bon pour conversion en campagnes.'
                : decisionOpen === 'request_changes' ? 'Précise les modifications attendues.'
                : 'Motif du rejet'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecisionOpen(null); setDecisionNote(''); }}>Annuler</Button>
            <Button
              variant={decisionOpen === 'reject' ? 'danger' : 'primary'}
              onClick={() => void submitDecision()}
              isLoading={updateStatus.isPending}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
