/**
 * /client/webhooks — Configuration webhooks sortants.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Send, AlertCircle } from 'lucide-react';
import { formatDateTime } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { supabase } from '@/lib/supabase';

const ALL_EVENTS = [
  'campaign.submitted',
  'campaign.approved',
  'campaign.completed',
  'invoice.generated',
  'invoice.validated',
  'invoice.paid',
  'report.ready',
  'kpis.updated',
  'forecast.shared',
  'forecast.approved',
];

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  failure_count: number;
  created_at: string;
}

export function WebhooksPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const orgId = profile?.organizationId ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['webhooks', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WebhookEndpoint[]> => {
      const { data, error } = await supabase
        .from('webhook_endpoints_safe')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WebhookEndpoint[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const secret = crypto.randomUUID().replace(/-/g, '');
      const events = Array.from(newEvents);
      const { data: encryptedSecret, error: encError } = await supabase.rpc('encrypt_token', {
        plain_token: secret,
        encryption_key: 'webhook_default',
      });
      if (encError) throw encError;
      const { error } = await supabase.from('webhook_endpoints').insert({
        organization_id: orgId,
        url: newUrl,
        secret_encrypted: encryptedSecret,
        events,
        created_by: profile?.id,
      });
      if (error) throw error;
      return secret;
    },
    onSuccess: (secret) => {
      void qc.invalidateQueries({ queryKey: ['webhooks', orgId] });
      setNewSecret(secret);
      toast.show({ variant: 'success', title: 'Webhook créé' });
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['webhooks', orgId] });
      toast.show({ variant: 'success', title: 'Webhook supprimé' });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.startsWith('https://')) {
      toast.show({ variant: 'error', title: 'URL HTTPS requise' });
      return;
    }
    if (newEvents.size === 0) {
      toast.show({ variant: 'error', title: 'Sélectionne au moins un event' });
      return;
    }
    try {
      await create.mutateAsync();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const handleClose = () => {
    setCreateOpen(false);
    setNewUrl('');
    setNewEvents(new Set());
    setNewSecret(null);
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.webhooks')}</h1>
          <p className="mt-1 text-sm text-textSecondary">Reçois des événements en temps réel sur tes endpoints.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />Nouveau webhook
        </Button>
      </div>

      <Alert variant="info" title="Comment ça marche">
        Quand un événement de ton organisation se produit (devis accepté, campagne terminée, facture émise...), nous envoyons un POST JSON à ton endpoint avec une signature <code className="font-mono">X-Webhook-Signature</code>. Vérifie la signature côté serveur pour authentifier la requête.
      </Alert>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && (!endpoints || endpoints.length === 0) && (
        <EmptyState
          icon={<Webhook className="h-8 w-8" />}
          title="Aucun webhook configuré"
          description="Crée ton premier endpoint pour recevoir les events SensADS."
        />
      )}

      {!isLoading && endpoints && endpoints.length > 0 && (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <Card key={ep.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs break-all">{ep.url}</code>
                      {ep.is_active ? <Badge variant="success">Actif</Badge> : <Badge variant="error">Inactif</Badge>}
                      {ep.failure_count > 0 && (
                        <Badge variant="error" className="gap-1">
                          <AlertCircle className="h-3 w-3" />{ep.failure_count} échecs
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ep.events.map((event) => (
                        <Badge key={event} variant="neutral" className="font-mono text-[10px]">{event}</Badge>
                      ))}
                    </div>
                    {ep.last_triggered_at && (
                      <p className="text-xs text-textSecondary">
                        Dernier déclenchement : {formatDateTime(ep.last_triggered_at, lang)}
                        {ep.last_status_code && ` · HTTP ${ep.last_status_code}`}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm('Supprimer ce webhook ?')) archive.mutate(ep.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={handleClose} title={newSecret ? 'Webhook créé' : 'Nouveau webhook'} size="lg">
        {newSecret ? (
          <div className="space-y-3">
            <Alert variant="warning" title="⚠ Copie ce secret maintenant">
              Tu ne pourras plus le revoir. Il sert à valider les requêtes via la signature HMAC.
            </Alert>
            <div className="rounded-lg border border-border bg-background p-3">
              <code className="font-mono text-xs break-all">{newSecret}</code>
            </div>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(newSecret)}>
              Copier dans le presse-papier
            </Button>
            <DialogFooter>
              <Button onClick={handleClose}>J&apos;ai copié, fermer</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL HTTPS *</Label>
              <Input id="url" type="url" placeholder="https://votre-domaine.com/webhooks/sensads" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Événements à recevoir *</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newEvents.has(event)} onChange={() => toggleEvent(event)} />
                    <code className="font-mono text-xs">{event}</code>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Annuler</Button>
              <Button type="submit" isLoading={create.isPending}>
                <Send className="h-4 w-4" />Créer
              </Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </div>
  );
}
