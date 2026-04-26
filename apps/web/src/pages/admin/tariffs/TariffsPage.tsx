/**
 * /admin/tariffs — Grille tarifaire complète.
 *
 * Affiche les 53 tarifs seedés, groupés par plateforme dans des accordéons.
 * Super admin peut créer/modifier. Admin/TM/Client peuvent lire (RLS).
 */

import { useMemo, useState } from 'react';
import { Plus, AlertCircle, Pencil, Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  PLATFORMS,
  formatAmount,
  formatPercentage,
  getPlatform,
  type PlatformTariff,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useTariffs, useArchiveTariff } from '@/hooks/useTariffs';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';
import { MarginBadge } from '@/components/ui/MarginBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { TariffEditDialog } from './TariffEditDialog';
import { TariffCreateDialog } from './TariffCreateDialog';

export function TariffsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { data: tariffs, isLoading, error } = useTariffs();
  const toast = useToast();
  const archiveTariff = useArchiveTariff();

  const [editingTariff, setEditingTariff] = useState<PlatformTariff | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  /** Group tariffs by platform */
  const grouped = useMemo(() => {
    const map = new Map<string, PlatformTariff[]>();
    for (const tariff of tariffs ?? []) {
      const list = map.get(tariff.platform) ?? [];
      list.push(tariff);
      map.set(tariff.platform, list);
    }
    return map;
  }, [tariffs]);

  /** Stats */
  const stats = useMemo(() => {
    if (!tariffs?.length) return { total: 0, avgMargin: 0, platforms: 0 };
    const total = tariffs.length;
    const avgMargin = tariffs.reduce((sum, t) => sum + t.marginPercentage, 0) / total;
    return { total, avgMargin, platforms: grouped.size };
  }, [tariffs, grouped]);

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archiver le tarif "${name}" ?`)) return;
    try {
      await archiveTariff.mutateAsync(id);
      toast.show({ variant: 'success', title: 'Tarif archivé' });
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  if (error) {
    return (
      <Alert variant="error" title="Erreur de chargement">
        {error instanceof Error ? error.message : 'Inconnu'}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">{t('nav.tariffs')}</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Grille tarifaire en USD. Conversion DZD à la lecture via taux courant.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau tarif
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Total tarifs</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-textPrimary">{stats.total}</p>
            )}
            <p className="mt-1 text-xs text-textSecondary">{stats.platforms} plateformes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Marge moyenne</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-textPrimary">
                {formatPercentage(stats.avgMargin, lang)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-textSecondary">Plateformes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-bold text-textPrimary">{PLATFORMS.length}</p>
            )}
            <p className="mt-1 text-xs text-textSecondary">11 supportées</p>
          </CardContent>
        </Card>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!tariffs || tariffs.length === 0) && (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Aucun tarif"
          description="La grille tarifaire est vide. Lance le seed des migrations."
        />
      )}

      {/* Accordions per platform */}
      {!isLoading && tariffs && tariffs.length > 0 && (
        <Accordion>
          {PLATFORMS.map((platform) => {
            const platformTariffs = grouped.get(platform.id) ?? [];
            if (platformTariffs.length === 0) return null;

            return (
              <AccordionItem
                key={platform.id}
                defaultOpen={platform.id === 'facebook'}
                title={
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white"
                      style={{ backgroundColor: platform.color }}
                    >
                      {platform.iconText}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-textPrimary">{platform.name}</span>
                      <span className="text-xs text-textSecondary">
                        {platform.mode === 'api' ? 'API automatisée' : 'Saisie manuelle'} ·{' '}
                        {platformTariffs.length} tarif{platformTariffs.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                }
                badge={
                  platform.hasSpecialAdCategory && (
                    <Badge variant="warning">Catégorie spéciale</Badge>
                  )
                }
              >
                <TariffsTable
                  tariffs={platformTariffs}
                  lang={lang}
                  canEdit={isSuperAdmin}
                  onEdit={setEditingTariff}
                  onArchive={handleArchive}
                />
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Dialogs */}
      <TariffEditDialog
        tariff={editingTariff}
        open={!!editingTariff}
        onClose={() => setEditingTariff(null)}
      />
      <TariffCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

interface TariffsTableProps {
  tariffs: PlatformTariff[];
  lang: 'fr' | 'en';
  canEdit: boolean;
  onEdit: (t: PlatformTariff) => void;
  onArchive: (id: string, name: string) => void;
}

function TariffsTable({ tariffs, lang, canEdit, onEdit, onArchive }: TariffsTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-textSecondary">
            <th className="pb-2 font-medium">Objectif</th>
            <th className="pb-2 font-medium">Nom</th>
            <th className="pb-2 text-right font-medium">Prix achat</th>
            <th className="pb-2 text-right font-medium">Prix vente</th>
            <th className="pb-2 text-right font-medium">Marge</th>
            <th className="pb-2 text-right font-medium">Budget min</th>
            {canEdit && <th className="pb-2 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {tariffs.map((tariff) => {
            const platform = getPlatform(tariff.platform);
            return (
              <tr key={tariff.id} className="border-b border-border/40 last:border-0">
                <td className="py-3">
                  <Badge variant="neutral">{tariff.optimizationGoal.toUpperCase()}</Badge>
                </td>
                <td className="py-3 font-medium text-textPrimary">{tariff.name}</td>
                <td className="py-3 text-right tabular-nums text-textSecondary">
                  {formatAmount(tariff.purchasePriceUsd, lang, 'USD', { minDecimals: 2 })}
                </td>
                <td className="py-3 text-right tabular-nums text-textPrimary">
                  {formatAmount(tariff.sellingPriceUsd, lang, 'USD', { minDecimals: 2 })}
                </td>
                <td className="py-3 text-right">
                  <MarginBadge margin={tariff.marginPercentage} language={lang} />
                </td>
                <td className="py-3 text-right tabular-nums text-textSecondary">
                  {tariff.minBudgetDzd > 0
                    ? formatAmount(tariff.minBudgetDzd, lang)
                    : <span className="text-textSecondary/60">—</span>}
                </td>
                {canEdit && (
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(tariff)}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onArchive(tariff.id, `${platform?.name} ${tariff.name}`)}
                        aria-label="Archiver"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
