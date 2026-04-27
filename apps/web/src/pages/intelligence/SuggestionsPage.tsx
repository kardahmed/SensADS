/**
 * /tm/suggestions & /admin/suggestions & /client/suggestions — Suggestions Intelligence.
 *
 * - Staff (TM/admin) : génère via bouton (Edge Function rate-limitée), valide/rejette,
 *   envoie au client.
 * - Client : ne voit que les suggestions `sent_to_client+`, peut accepter/refuser.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, Check, X, AlertTriangle, Info, TrendingUp, Clock } from 'lucide-react';
import { formatDate } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import {
  useSuggestions,
  useGenerateSuggestions,
  useUpdateSuggestion,
  type PerformanceSuggestion,
  type SuggestionStatus,
} from '@/hooks/useSuggestions';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';

type StatusFilter = '' | SuggestionStatus;

const STATUS_LABELS: Record<SuggestionStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' | 'info' }> = {
  pending: { label: 'En attente', variant: 'warning' },
  sent_to_client: { label: 'Envoyée client', variant: 'info' },
  approved: { label: 'Approuvée', variant: 'success' },
  rejected: { label: 'Rejetée', variant: 'error' },
  modified: { label: 'Modifiée', variant: 'neutral' },
  expired: { label: 'Expirée', variant: 'neutral' },
};

function suggestionIcon(type: string): JSX.Element {
  if (type.includes('budget')) return <TrendingUp className="h-4 w-4" />;
  if (type.includes('warning') || type.includes('low_')) return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export function SuggestionsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff } = useAuth();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [campaignFilter, setCampaignFilter] = useState<string>('');
  const [genCampaignId, setGenCampaignId] = useState<string>('');
  const [decision, setDecision] = useState<{ s: PerformanceSuggestion; mode: 'approve' | 'reject' | 'send' | 'client' } | null>(null);
  const [notes, setNotes] = useState<string>('');

  const campaigns = useCampaigns({ pageSize: 50 });
  const suggestions = useSuggestions({
    status: statusFilter || undefined,
    campaignId: campaignFilter || undefined,
  });
  const generate = useGenerateSuggestions();
  const update = useUpdateSuggestion();

  const items = suggestions.data ?? [];
  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, approved: 0, rejected: 0 };
    items.forEach((s) => {
      if (s.status === 'pending') c.pending += 1;
      if (s.status === 'sent_to_client') c.sent += 1;
      if (s.status === 'approved') c.approved += 1;
      if (s.status === 'rejected') c.rejected += 1;
    });
    return c;
  }, [items]);

  const onGenerate = async (): Promise<void> => {
    if (!genCampaignId) {
      toast.show({ variant: 'error', title: 'Sélection requise', message: 'Choisis une campagne avant de générer.' });
      return;
    }
    try {
      const res = await generate.mutateAsync({ campaignId: genCampaignId });
      toast.show({ variant: 'success', title: 'Suggestions générées', message: `${res.generated ?? 0} nouvelle(s) suggestion(s).` });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const onConfirmDecision = async (): Promise<void> => {
    if (!decision) return;
    const map = {
      approve: 'approved' as const,
      reject: 'rejected' as const,
      send: 'sent_to_client' as const,
      client: 'approved' as const,
    };
    try {
      await update.mutateAsync({
        id: decision.s.id,
        status: map[decision.mode],
        clientNotes: notes || undefined,
      });
      toast.show({ variant: 'success', title: 'Suggestion mise à jour' });
      setDecision(null);
      setNotes('');
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-6 w-6 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Suggestions Intelligence</h1>
          <p className="text-sm text-textSecondary">
            Recommandations automatiques basées sur benchmarks marché, anomalies (z-score 30j) et règles métier.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-textSecondary">En attente</p>
            <p className="mt-1 text-2xl font-bold text-warning">{counts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-textSecondary">Envoyées</p>
            <p className="mt-1 text-2xl font-bold text-accent">{counts.sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-textSecondary">Approuvées</p>
            <p className="mt-1 text-2xl font-bold text-success">{counts.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-textSecondary">Rejetées</p>
            <p className="mt-1 text-2xl font-bold text-error">{counts.rejected}</p>
          </CardContent>
        </Card>
      </div>

      {isStaff && (
        <Card>
          <CardHeader><CardTitle>Générer des suggestions</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1 space-y-2">
                <Label htmlFor="genCampaign">Campagne</Label>
                <Select id="genCampaign" value={genCampaignId} onChange={(e) => setGenCampaignId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {(campaigns.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.number} · {c.name}</option>
                  ))}
                </Select>
              </div>
              <Button onClick={() => void onGenerate()} isLoading={generate.isPending}>
                <Sparkles className="mr-2 h-4 w-4" /> Générer
              </Button>
              <p className="ml-auto flex items-center gap-1 text-xs text-textSecondary">
                <Clock className="h-3 w-3" /> Rate limit : 1 / 5 min par ressource
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Suggestions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] space-y-2">
              <Label htmlFor="status">Statut</Label>
              <Select id="status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="">Tous</option>
                <option value="pending">En attente</option>
                <option value="sent_to_client">Envoyée client</option>
                <option value="approved">Approuvée</option>
                <option value="rejected">Rejetée</option>
                <option value="expired">Expirée</option>
              </Select>
            </div>
            <div className="min-w-[260px] flex-1 space-y-2">
              <Label htmlFor="campaign">Campagne</Label>
              <Select id="campaign" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                <option value="">Toutes</option>
                {(campaigns.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.number} · {c.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {suggestions.isLoading && <Skeleton className="h-40 w-full" />}
          {!suggestions.isLoading && items.length === 0 && (
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title="Aucune suggestion"
              description={isStaff ? 'Génère des suggestions à partir d\'une campagne avec KPIs.' : 'Aucune recommandation disponible pour l\'instant.'}
            />
          )}

          {!suggestions.isLoading && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((s) => {
                const meta = STATUS_LABELS[s.status];
                return (
                  <li key={s.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-background/40 p-2 text-violet-400">
                          {suggestionIcon(s.suggestionType)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-textPrimary">{s.title}</h3>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            {s.confidenceScore !== null && (
                              <Badge variant="neutral">Confiance {Math.round((s.confidenceScore ?? 0) * 100)}%</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-textSecondary">{s.description}</p>
                          {s.expectedImpact && (
                            <p className="mt-1 text-xs italic text-success">Impact attendu : {s.expectedImpact}</p>
                          )}
                          <p className="mt-2 text-xs text-textSecondary">
                            Type : <span className="font-mono">{s.suggestionType}</span> · Généré le {formatDate(s.generatedAt, lang)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        {isStaff && s.status === 'pending' && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => setDecision({ s, mode: 'send' })}>
                              <Send className="mr-1 h-3 w-3" /> Envoyer client
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDecision({ s, mode: 'reject' })}>
                              <X className="mr-1 h-3 w-3" /> Rejeter
                            </Button>
                          </>
                        )}
                        {!isStaff && s.status === 'sent_to_client' && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => setDecision({ s, mode: 'approve' })}>
                              <Check className="mr-1 h-3 w-3" /> Approuver
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDecision({ s, mode: 'reject' })}>
                              <X className="mr-1 h-3 w-3" /> Refuser
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!decision}
        onClose={() => { setDecision(null); setNotes(''); }}
        title={
          decision?.mode === 'send' ? 'Envoyer au client' :
          decision?.mode === 'approve' ? 'Approuver la suggestion' :
          decision?.mode === 'reject' ? 'Rejeter la suggestion' :
          'Décision'
        }
      >
        <div className="space-y-3">
          {decision && (
            <p className="text-sm text-textSecondary">{decision.s.title}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes {decision?.mode === 'reject' ? '(motif requis)' : '(optionnel)'}</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { setDecision(null); setNotes(''); }}>Annuler</Button>
            <Button
              type="button"
              isLoading={update.isPending}
              disabled={decision?.mode === 'reject' && !notes.trim()}
              onClick={() => void onConfirmDecision()}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
