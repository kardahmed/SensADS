/**
 * /admin/exchange-rates — Gestion des taux interbancaires (bank rates).
 *
 * Staff peut saisir/modifier les taux DEVISE → USD utilisés pour figer
 * le snapshot bank_rate_to_usd dans chaque KPI quotidien.
 *
 * Workflow :
 *   1. Saisie quotidienne (ou hebdo) des taux par devise
 *   2. Le taux le plus récent ≤ date du KPI est utilisé pour la conversion
 *   3. Une fois figé dans un KPI, le taux n'est jamais re-utilisé pour ce KPI
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { formatDate } from '@sensads/core';
import {
  useBankExchangeRates,
  useCreateBankRate,
  useDeleteBankRate,
  useLatestRatesByCurrency,
} from '@/hooks/useBankExchangeRates';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'MAD', 'TND', 'SAR', 'QAR', 'CAD', 'CHF'];

const STALE_DAYS_THRESHOLD = 7;

export function ExchangeRatesPage(): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    currency: 'EUR',
    rateToUsd: 0,
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const ratesQ = useBankExchangeRates({ currency: filterCurrency || undefined });
  const latestQ = useLatestRatesByCurrency();
  const create = useCreateBankRate();
  const del = useDeleteBankRate();
  const toast = useToast();

  const staleCurrencies = useMemo(() => {
    const latest = latestQ.data ?? {};
    const cutoff = Date.now() - STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
    return SUPPORTED_CURRENCIES.filter((c) => {
      if (c === 'USD') return false;
      const r = latest[c];
      if (!r) return true;
      return new Date(r.effectiveDate).getTime() < cutoff;
    });
  }, [latestQ.data]);

  const onSubmit = async (): Promise<void> => {
    if (form.rateToUsd <= 0) {
      toast.show({ variant: 'error', title: 'Taux > 0 obligatoire' });
      return;
    }
    try {
      await create.mutateAsync({
        currency: form.currency,
        rateToUsd: form.rateToUsd,
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      });
      toast.show({ variant: 'success', title: 'Taux ajouté' });
      setDialogOpen(false);
      setForm({ currency: 'EUR', rateToUsd: 0, effectiveDate: new Date().toISOString().slice(0, 10), notes: '' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const onDelete = async (id: string): Promise<void> => {
    if (!confirm('Supprimer ce taux ? Les KPIs déjà créés ne seront pas affectés (snapshots figés).')) return;
    try {
      await del.mutateAsync(id);
      toast.show({ variant: 'success', title: 'Taux supprimé' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Coins className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">Taux de change interbancaires</h1>
            <p className="text-sm text-textSecondary">
              Taux officiels DEVISE → USD utilisés pour la conversion réelle des comptes pub multi-devises.
              Les KPIs déjà créés ont leur snapshot figé.
            </p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nouveau taux
        </Button>
      </div>

      {staleCurrencies.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-bold text-warning">Taux non actualisés depuis &gt; {STALE_DAYS_THRESHOLD} jours</p>
              <p className="text-textSecondary">
                {staleCurrencies.join(', ')} — pense à mettre à jour pour des KPIs précis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Taux courants par devise</CardTitle>
        </CardHeader>
        <CardContent>
          {latestQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {SUPPORTED_CURRENCIES.map((c) => {
                const rate = latestQ.data?.[c];
                const isStale = staleCurrencies.includes(c);
                return (
                  <div
                    key={c}
                    className={`rounded-lg border p-3 ${isStale ? 'border-warning/40 bg-warning/5' : 'border-border bg-background/30'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">{c}</span>
                      {isStale && <Badge variant="warning">Stale</Badge>}
                    </div>
                    {rate ? (
                      <>
                        <p className="mt-1 font-mono text-lg font-bold">
                          {rate.rateToUsd.toFixed(c === 'INR' || c === 'MAD' ? 6 : 4)}
                        </p>
                        <p className="text-xs text-textSecondary">
                          {formatDate(rate.effectiveDate, lang)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm italic text-textSecondary">Aucun taux</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Historique</CardTitle>
            <Select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="w-auto"
            >
              <option value="">Toutes les devises</option>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ratesQ.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/30 text-left text-xs uppercase text-textSecondary">
                  <th className="p-3">Devise</th>
                  <th className="p-3 text-right">Taux → USD</th>
                  <th className="p-3">Date effective</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {(ratesQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-background/30">
                    <td className="p-3 font-mono font-bold">{r.currency}</td>
                    <td className="p-3 text-right font-mono">
                      {r.rateToUsd.toFixed(r.currency === 'INR' || r.currency === 'MAD' ? 6 : 4)}
                    </td>
                    <td className="p-3 text-xs">{formatDate(r.effectiveDate, lang)}</td>
                    <td className="p-3">
                      <Badge variant="neutral">{r.source}</Badge>
                    </td>
                    <td className="p-3 text-xs italic text-textSecondary">{r.notes ?? '—'}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => void onDelete(r.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Nouveau taux">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cur">Devise *</Label>
            <Select
              id="cur"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {SUPPORTED_CURRENCIES.filter((c) => c !== 'USD').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rate">Taux 1 {form.currency} = X USD *</Label>
            <Input
              id="rate"
              type="number"
              step="0.000001"
              min="0.0001"
              value={form.rateToUsd}
              onChange={(e) => setForm((f) => ({ ...f, rateToUsd: Number(e.target.value) || 0 }))}
            />
            <p className="text-xs text-textSecondary">
              Ex : 1 EUR = 1.08 USD (Europe), 1 INR = 0.012 USD (Inde), 1 AED = 0.272 USD (UAE).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dt">Date effective</Label>
            <Input
              id="dt"
              type="date"
              value={form.effectiveDate}
              onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nt">Notes</Label>
            <Textarea
              id="nt"
              rows={2}
              placeholder="ex: cours BCE / cours moyen interbancaire / source"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => void onSubmit()} isLoading={create.isPending}>Ajouter</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
