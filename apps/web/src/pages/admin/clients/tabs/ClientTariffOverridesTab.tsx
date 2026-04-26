import { useState } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  computeMargin,
  formatAmount,
  formatPercentage,
  getPlatform,
} from '@sensads/core';
import {
  useTariffOverrides,
  useUpsertTariffOverride,
  useDeleteTariffOverride,
} from '@/hooks/useTariffOverrides';
import { useTariffs } from '@/hooks/useTariffs';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MarginBadge } from '@/components/ui/MarginBadge';
import { Badge } from '@/components/ui/Badge';

interface Props {
  organizationId: string;
}

export function ClientTariffOverridesTab({ organizationId }: Props): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const { data: overridesData, isLoading } = useTariffOverrides(organizationId);
  const { data: allTariffs } = useTariffs();
  const upsert = useUpsertTariffOverride();
  const remove = useDeleteTariffOverride();
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTariffId, setSelectedTariffId] = useState('');
  const [customPurchase, setCustomPurchase] = useState('');
  const [customSelling, setCustomSelling] = useState('');
  const [notes, setNotes] = useState('');

  const overriddenIds = new Set((overridesData ?? []).map((o) => o.override.tariffId));
  const availableTariffs = (allTariffs ?? []).filter((t) => !overriddenIds.has(t.id));

  const handleAdd = () => {
    setSelectedTariffId('');
    setCustomPurchase('');
    setCustomSelling('');
    setNotes('');
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTariffId) {
      toast.show({ variant: 'warning', title: 'Sélectionne un tarif' });
      return;
    }
    const cp = customPurchase ? Number(customPurchase) : null;
    const cs = customSelling ? Number(customSelling) : null;

    if (cp !== null && cp <= 0) {
      toast.show({ variant: 'error', title: 'Prix achat doit être > 0' });
      return;
    }
    if (cs !== null && cp !== null && cs < cp) {
      toast.show({ variant: 'error', title: 'Prix vente doit être ≥ prix achat' });
      return;
    }

    try {
      await upsert.mutateAsync({
        organizationId,
        tariffId: selectedTariffId,
        customPurchasePriceUsd: cp,
        customSellingPriceUsd: cs,
        notes: notes || null,
      });
      toast.show({ variant: 'success', title: 'Tarif spécial ajouté' });
      setDialogOpen(false);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce tarif spécial ? Le client repassera au tarif standard.')) return;
    try {
      await remove.mutateAsync({ id, organizationId });
      toast.show({ variant: 'success', title: 'Tarif spécial supprimé' });
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-textSecondary">
          Tarifs négociés spécifiquement pour ce client. Override le tarif standard pour les devis.
        </p>
        <Button onClick={handleAdd} disabled={availableTariffs.length === 0}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!overridesData || overridesData.length === 0) && (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="Aucun tarif spécial"
          description="Le client utilise les tarifs standard. Ajoute des prix négociés si applicable."
        />
      )}

      {!isLoading && overridesData && overridesData.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/40 text-left">
                    <th className="p-3 font-medium text-textSecondary">Plateforme</th>
                    <th className="p-3 font-medium text-textSecondary">Tarif</th>
                    <th className="p-3 text-right font-medium text-textSecondary">Prix achat custom</th>
                    <th className="p-3 text-right font-medium text-textSecondary">Prix vente custom</th>
                    <th className="p-3 text-right font-medium text-textSecondary">Marge</th>
                    <th className="p-3 font-medium text-textSecondary">Notes</th>
                    <th className="p-3 text-right font-medium text-textSecondary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overridesData.map(({ override, tariff }) => {
                    const platform = tariff ? getPlatform(tariff.platform) : null;
                    const margin =
                      override.customPurchasePriceUsd && override.customSellingPriceUsd
                        ? computeMargin(
                            override.customPurchasePriceUsd,
                            override.customSellingPriceUsd,
                          )
                        : null;
                    return (
                      <tr key={override.id} className="border-b border-border/40 last:border-0">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
                              style={{ backgroundColor: platform?.color ?? '#9CA3AF' }}
                            >
                              {platform?.iconText ?? '?'}
                            </div>
                            <span>{platform?.name ?? tariff?.platform ?? '—'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="neutral">
                            {tariff?.optimization_goal?.toUpperCase() ?? '—'}
                          </Badge>
                          <p className="mt-0.5 text-xs text-textSecondary">{tariff?.name ?? '—'}</p>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {override.customPurchasePriceUsd
                            ? formatAmount(override.customPurchasePriceUsd, lang, 'USD')
                            : <span className="text-textSecondary/60">standard</span>}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {override.customSellingPriceUsd
                            ? formatAmount(override.customSellingPriceUsd, lang, 'USD')
                            : <span className="text-textSecondary/60">standard</span>}
                        </td>
                        <td className="p-3 text-right">
                          {margin !== null ? (
                            <MarginBadge margin={margin} language={lang} />
                          ) : (
                            <span className="text-xs text-textSecondary/60">—</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-textSecondary">
                          {override.notes ?? <span className="opacity-50">—</span>}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(override.id)}
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog ajout */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Nouveau tarif spécial"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tariffId">Tarif standard à override *</Label>
            <Select
              id="tariffId"
              value={selectedTariffId}
              onChange={(e) => setSelectedTariffId(e.target.value)}
              required
            >
              <option value="">Sélectionner...</option>
              {availableTariffs.map((t) => {
                const p = getPlatform(t.platform);
                return (
                  <option key={t.id} value={t.id}>
                    {p?.name ?? t.platform} · {t.optimizationGoal.toUpperCase()} · {t.name}
                  </option>
                );
              })}
            </Select>
            {availableTariffs.length === 0 && (
              <p className="text-xs text-warning">
                Tous les tarifs ont déjà un override pour ce client.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customPurchase">Prix achat USD (optionnel)</Label>
              <Input
                id="customPurchase"
                type="number"
                step="0.01"
                min="0.01"
                value={customPurchase}
                onChange={(e) => setCustomPurchase(e.target.value)}
                placeholder="Vide = standard"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customSelling">Prix vente USD (optionnel)</Label>
              <Input
                id="customSelling"
                type="number"
                step="0.01"
                min="0.01"
                value={customSelling}
                onChange={(e) => setCustomSelling(e.target.value)}
                placeholder="Vide = standard"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (raison du tarif spécial)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: contrat annuel négocié 2026..."
            />
          </div>

          {customPurchase && customSelling && Number(customPurchase) > 0 && (
            <p className="text-xs text-textSecondary">
              Marge calculée :{' '}
              <span className="font-semibold">
                {formatPercentage(
                  computeMargin(Number(customPurchase), Number(customSelling)),
                  lang,
                )}
              </span>
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" isLoading={upsert.isPending}>
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
