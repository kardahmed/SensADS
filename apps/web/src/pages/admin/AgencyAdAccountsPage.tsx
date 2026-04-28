/**
 * /admin/ad-accounts — Gestion des comptes publicitaires de l'agence.
 *
 * L'agence a plusieurs comptes pub multi-devises (USD/INR/EUR/AED…) qu'elle utilise
 * pour optimiser les coûts. Chaque compte a sa devise + son CPM moyen observé qui sert
 * au simulator pour estimer les impressions livrables.
 *
 * Réservé super_admin/admin (RLS).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Pencil, Trash2 } from 'lucide-react';
import { PLATFORMS } from '@sensads/core';
import {
  useAgencyAdAccounts,
  useCreateAgencyAdAccount,
  useDeleteAgencyAdAccount,
  useUpdateAgencyAdAccount,
} from '@/hooks/useAgencyAdAccounts';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'MAD', 'TND', 'SAR', 'QAR', 'CAD', 'CHF'];

interface FormState {
  id?: string;
  name: string;
  platform: string;
  accountCurrency: string;
  observedCpmAccountCurrency: number;
  externalAccountId: string;
  notes: string;
  status: 'active' | 'paused' | 'archived' | 'banned';
}

const EMPTY_FORM: FormState = {
  name: '',
  platform: 'facebook',
  accountCurrency: 'USD',
  observedCpmAccountCurrency: 0.30,
  externalAccountId: '',
  notes: '',
  status: 'active',
};

export function AgencyAdAccountsPage(): JSX.Element {
  const accounts = useAgencyAdAccounts();
  const create = useCreateAgencyAdAccount();
  const update = useUpdateAgencyAdAccount();
  const del = useDeleteAgencyAdAccount();
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const onSave = async (): Promise<void> => {
    if (!form.name || form.observedCpmAccountCurrency <= 0) {
      toast.show({ variant: 'error', title: 'Nom et CPM > 0 obligatoires' });
      return;
    }
    try {
      if (form.id) {
        await update.mutateAsync({
          id: form.id,
          name: form.name,
          observedCpmAccountCurrency: form.observedCpmAccountCurrency,
          status: form.status,
          notes: form.notes,
        });
      } else {
        await create.mutateAsync({
          name: form.name,
          platform: form.platform,
          accountCurrency: form.accountCurrency,
          observedCpmAccountCurrency: form.observedCpmAccountCurrency,
          externalAccountId: form.externalAccountId || undefined,
          notes: form.notes,
        });
      }
      toast.show({ variant: 'success', title: form.id ? 'Compte mis à jour' : 'Compte créé' });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const onEdit = (id: string): void => {
    const acc = accounts.data?.find((a) => a.id === id);
    if (!acc) return;
    setForm({
      id: acc.id,
      name: acc.name,
      platform: acc.platform,
      accountCurrency: acc.accountCurrency,
      observedCpmAccountCurrency: acc.observedCpmAccountCurrency,
      externalAccountId: acc.externalAccountId ?? '',
      notes: acc.notes ?? '',
      status: acc.status,
    });
    setDialogOpen(true);
  };

  const onDelete = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Supprimer le compte "${name}" ?`)) return;
    try {
      await del.mutateAsync(id);
      toast.show({ variant: 'success', title: 'Compte supprimé' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">Comptes publicitaires agence</h1>
            <p className="text-sm text-textSecondary">
              Gère tes comptes Meta/TikTok/Google multi-devises. Le calculator et le wizard de campagne
              utilisent cette liste pour proposer le compte optimal selon le coût.
            </p>
          </div>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setDialogOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Nouveau compte
        </Button>
      </div>

      {accounts.isLoading && <Skeleton className="h-64 w-full" />}

      {!accounts.isLoading && (accounts.data ?? []).length === 0 && (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="Aucun compte configuré"
          description="Ajoute tes comptes pub agence pour activer le simulateur et la création de campagnes."
        />
      )}

      {!accounts.isLoading && (accounts.data ?? []).length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/30 text-left text-xs uppercase text-textSecondary">
                  <th className="p-3">Nom</th>
                  <th className="p-3">Plateforme</th>
                  <th className="p-3">Devise</th>
                  <th className="p-3 text-right">CPM observé</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">ID externe</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {(accounts.data ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-border/40 hover:bg-background/30">
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3">{a.platform}</td>
                    <td className="p-3 font-mono">{a.accountCurrency}</td>
                    <td className="p-3 text-right font-mono">
                      {a.observedCpmAccountCurrency.toFixed(2)} {a.accountCurrency}
                    </td>
                    <td className="p-3">
                      <Badge variant={a.status === 'active' ? 'success' : a.status === 'banned' ? 'error' : 'neutral'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs text-textSecondary">{a.externalAccountId ?? '—'}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(a.id)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void onDelete(a.id, a.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={form.id ? 'Modifier le compte' : 'Nouveau compte agence'}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom du compte *</Label>
            <Input
              id="name"
              placeholder="ex: sensads_inr_01"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl">Plateforme *</Label>
              <Select
                id="pl"
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                disabled={!!form.id}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur">Devise *</Label>
              <Select
                id="cur"
                value={form.accountCurrency}
                onChange={(e) => setForm((f) => ({ ...f, accountCurrency: e.target.value }))}
                disabled={!!form.id}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cpm">
              CPM moyen observé ({form.accountCurrency}) *
              <span className="ml-1 text-xs font-normal text-textSecondary">
                — utilisé par le simulator
              </span>
            </Label>
            <Input
              id="cpm"
              type="number"
              step="0.01"
              min="0.001"
              value={form.observedCpmAccountCurrency}
              onChange={(e) => setForm((f) => ({ ...f, observedCpmAccountCurrency: Number(e.target.value) || 0 }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ext">ID compte Meta (optionnel)</Label>
            <Input
              id="ext"
              placeholder="act_4567823910456"
              value={form.externalAccountId}
              onChange={(e) => setForm((f) => ({ ...f, externalAccountId: e.target.value }))}
            />
          </div>

          {form.id && (
            <div className="space-y-1.5">
              <Label htmlFor="st">Statut</Label>
              <Select
                id="st"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FormState['status'] }))}
              >
                <option value="active">Actif</option>
                <option value="paused">En pause</option>
                <option value="archived">Archivé</option>
                <option value="banned">Banni Meta</option>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nt">Notes</Label>
            <Textarea
              id="nt"
              rows={2}
              placeholder="ex: Compte indien — CPM bas, à utiliser pour notoriété"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => void onSave()} isLoading={create.isPending || update.isPending}>
              {form.id ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
