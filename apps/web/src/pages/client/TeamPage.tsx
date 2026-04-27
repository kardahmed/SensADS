/**
 * /client/team — Gestion des sous-comptes (client_owner only).
 *
 * Permet de créer une demande de sous-comptes à valider par admin.
 */

import { useState } from 'react';
import { Users, Crown, Mail, Shield, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useOrgMembers, useSubAccountRequests } from '@/hooks/useOrgMembers';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { supabase } from '@/lib/supabase';

export function TeamPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile } = useAuth();
  const toast = useToast();
  const orgId = profile?.organizationId ?? '';

  const { data: members, isLoading } = useOrgMembers(orgId);
  const { data: requests } = useSubAccountRequests(orgId);

  const [requestOpen, setRequestOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const owner = members?.find((m) => m.role === 'client_owner');
  const subAccounts = members?.filter((m) => m.role === 'client_member') ?? [];
  const pendingRequests = requests?.filter((r) => r.status === 'pending') ?? [];

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      toast.show({ variant: 'error', title: 'Motif obligatoire (min 10 caractères)' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('sub_account_requests').insert({
        organization_id: orgId,
        requested_by: profile?.id,
        requested_count: count,
        reason: reason.trim(),
      });
      if (error) throw error;
      toast.show({ variant: 'success', title: 'Demande envoyée', message: 'Un admin la traitera bientôt.' });
      setRequestOpen(false);
      setReason('');
      setCount(1);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.team')}</h1>
          <p className="mt-1 text-sm text-textSecondary">Gestion de ton équipe et demandes de sous-comptes.</p>
        </div>
        <Button onClick={() => setRequestOpen(true)}>
          <Plus className="h-4 w-4" />Demander des sous-comptes
        </Button>
      </div>

      {pendingRequests.length > 0 && (
        <Alert variant="info" title={`${pendingRequests.length} demande(s) en attente`}>
          <ul className="mt-2 space-y-1 text-sm">
            {pendingRequests.map((req) => (
              <li key={req.id}>
                +{req.requestedCount} comptes — {req.reason} ({formatDate(req.createdAt, lang)})
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {isLoading && <Skeleton className="h-20 w-full" />}

      {!isLoading && owner && (
        <Card>
          <CardHeader><CardTitle>Propriétaire</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-textPrimary">{owner.fullName ?? '—'}</p>
                  <p className="text-xs text-textSecondary flex items-center gap-1">
                    <Mail className="h-3 w-3" />{owner.email}
                  </p>
                </div>
              </div>
              <Badge variant="default">Propriétaire</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Sous-comptes ({subAccounts.length})</CardTitle></CardHeader>
        <CardContent>
          {subAccounts.length === 0 ? (
            <p className="py-4 text-center text-sm text-textSecondary">Aucun sous-compte. Demande la création de comptes via le bouton ci-dessus.</p>
          ) : (
            <div className="space-y-2">
              {subAccounts.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet/10 text-violet">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-textPrimary">{member.fullName ?? member.email}</p>
                      <p className="text-xs text-textSecondary">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant="info">
                    {member.accessLevel === 'full' ? 'Accès complet' : member.accessLevel === 'campaigns_only' ? 'Campagnes uniquement' : 'Lecture seule'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} title="Demande de sous-comptes">
        <form onSubmit={handleRequest} className="space-y-4">
          <Alert variant="info">
            Ta demande sera examinée par un admin. Une fois approuvée, ton quota augmentera.
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="count">Nombre de comptes</Label>
            <Input id="count" type="number" min="1" max="50" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motif (min 10 caractères)</Label>
            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justifie la demande..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Annuler</Button>
            <Button type="submit" isLoading={submitting}>Envoyer la demande</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
