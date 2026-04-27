/**
 * /client/quotes/new — Création d'un devis avec calcul live HT → TVA → TTC.
 *
 * Logique :
 * - Client : son organisation est fixée
 * - Admin/TM : peut choisir l'organisation
 * - Lignes ajoutables : (plateforme, objectif, quantité)
 * - Pour chaque ligne :
 *   - Cherche tariff (platform + optimization_goal)
 *   - Cherche override custom (organization + tariff)
 *   - Calcule effective_purchase + effective_selling
 *   - unit_price_dzd = selling × exchange_rate
 *   - total_dzd = unit_price × quantity
 * - Total quote :
 *   - subtotal = sum(line.total_dzd)
 *   - discount_amount = subtotal × discount_percentage
 *   - vat_amount = (subtotal - discount) × vat_rate
 *   - total = subtotal - discount + vat
 *
 * Snapshot taux de change figé au moment de la création.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  computePricing,
  createExchangeRateSnapshot,
  formatAmount,
  formatPercentage,
  getEffectivePrice,
  getPlatform,
  PLATFORMS,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useClientFinancialSettings } from '@/hooks/useClientFinancialSettings';
import { useTariffs } from '@/hooks/useTariffs';
import { useTariffOverrides } from '@/hooks/useTariffOverrides';
import { useCreateQuote } from '@/hooks/useQuotes';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface DraftLine {
  id: string; // local UUID
  platform: string;
  optimizationGoal: string;
  tariffId: string;
  quantity: number;
}

function newId(): string {
  return crypto.randomUUID();
}

export function NewQuotePage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile, isStaff } = useAuth();

  const [organizationId, setOrganizationId] = useState<string>(profile?.organizationId ?? '');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { id: newId(), platform: '', optimizationGoal: '', tariffId: '', quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Pour staff : permet de choisir l'org
  const { data: orgsData } = useOrganizations({ page: 1, pageSize: 100 });

  const { data: settings, isLoading: settingsLoading } = useClientFinancialSettings(organizationId);
  const { data: tariffs, isLoading: tariffsLoading } = useTariffs();
  const { data: overridesData } = useTariffOverrides(organizationId);
  const create = useCreateQuote();

  const overridesMap = useMemo(() => {
    const map = new Map<string, { customPurchasePriceUsd: number | null; customSellingPriceUsd: number | null }>();
    for (const item of overridesData ?? []) {
      map.set(item.override.tariffId, {
        customPurchasePriceUsd: item.override.customPurchasePriceUsd,
        customSellingPriceUsd: item.override.customSellingPriceUsd,
      });
    }
    return map;
  }, [overridesData]);

  /** Convert draft lines → pricing input for live computation */
  const computedPricing = useMemo(() => {
    if (!settings || !tariffs) return null;
    const pricingLines = [];
    for (const line of lines) {
      if (!line.tariffId || line.quantity <= 0) continue;
      const tariff = tariffs.find((t) => t.id === line.tariffId);
      if (!tariff) continue;
      const override = overridesMap.get(tariff.id);
      pricingLines.push({
        standardPurchasePriceUsd: tariff.purchasePriceUsd,
        standardSellingPriceUsd: tariff.sellingPriceUsd,
        customPurchasePriceUsd: override?.customPurchasePriceUsd,
        customSellingPriceUsd: override?.customSellingPriceUsd,
        quantity: line.quantity,
      });
    }
    if (pricingLines.length === 0) return null;
    return computePricing({
      lines: pricingLines,
      sourceCurrency: settings.sourceCurrency,
      exchangeRateToDzd: settings.exchangeRate,
      discountPercentage: settings.discountPercentage,
      vatRate: settings.customVatRate ?? 0.19,
    });
  }, [lines, tariffs, settings, overridesMap]);

  // Reset lines when org changes
  useEffect(() => {
    if (!organizationId && profile?.organizationId) {
      setOrganizationId(profile.organizationId);
    }
  }, [profile, organizationId]);

  const updateLine = (id: string, updates: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: newId(), platform: '', optimizationGoal: '', tariffId: '', quantity: 1 },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const handlePlatformChange = (lineId: string, platform: string) => {
    updateLine(lineId, { platform, optimizationGoal: '', tariffId: '' });
  };

  const handleObjectiveChange = (lineId: string, optimizationGoal: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const matchingTariff = tariffs?.find(
      (tt) => tt.platform === line.platform && tt.optimizationGoal === optimizationGoal,
    );
    updateLine(lineId, { optimizationGoal, tariffId: matchingTariff?.id ?? '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      toast.show({ variant: 'error', title: 'Organisation requise' });
      return;
    }
    if (!settings) {
      toast.show({ variant: 'error', title: 'Paramètres financiers manquants' });
      return;
    }
    if (!computedPricing || computedPricing.lines.length === 0) {
      toast.show({ variant: 'error', title: 'Au moins une ligne valide requise' });
      return;
    }

    setSubmitting(true);
    try {
      const validLines = lines.filter((l) => l.tariffId && l.quantity > 0);
      const lineInputs = validLines.map((line, idx) => {
        const computedLine = computedPricing.lines[idx]!;
        return {
          tariffId: line.tariffId,
          quantity: line.quantity,
          effectivePurchasePriceUsd: computedLine.effectivePurchasePriceUsd,
          effectiveSellingPriceUsd: computedLine.effectiveSellingPriceUsd,
          unitPriceDzd: computedLine.unitPriceDzd,
          totalDzd: computedLine.totalDzd,
        };
      });

      const snapshot = createExchangeRateSnapshot({
        [settings.sourceCurrency]: settings.exchangeRate,
      });

      const quoteId = await create.mutateAsync({
        organizationId,
        notes: notes || null,
        validUntil: validUntil || null,
        lines: lineInputs,
        subtotalDzd: computedPricing.subtotalDzd,
        discountPercentage: computedPricing.discountPercentage,
        discountAmountDzd: computedPricing.discountAmountDzd,
        vatRate: computedPricing.vatRate,
        vatAmountDzd: computedPricing.vatAmountDzd,
        totalDzd: computedPricing.totalDzd,
        exchangeRateSnapshot: snapshot,
      });

      toast.show({ variant: 'success', title: 'Devis créé', message: 'Brouillon enregistré' });
      const baseRoute = isStaff ? '/admin/quotes' : '/client/quotes';
      navigate(`${baseRoute}/${quoteId}`);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur création',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const showOrgPicker = isStaff;
  const orgPickerNeeded = showOrgPicker && !organizationId;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Nouveau devis</h1>
          <p className="text-sm text-textSecondary">
            {t('common.loading')} {/* placeholder pour tests */}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Organisation (staff only) */}
        {showOrgPicker && (
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-md">
                <Label htmlFor="organizationId">Organisation</Label>
                <Select
                  id="organizationId"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {orgsData?.data.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {orgPickerNeeded && (
          <Alert variant="info">
            Sélectionne d&apos;abord une organisation pour voir ses paramètres financiers.
          </Alert>
        )}

        {organizationId && !settingsLoading && !settings && (
          <Alert variant="error" title="Paramètres financiers manquants">
            Cette organisation n&apos;a pas de paramètres financiers configurés. Va sur la page
            détail client pour les configurer avant de créer un devis.
          </Alert>
        )}

        {organizationId && settings && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Lignes du devis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tariffsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <>
                    {lines.map((line, idx) => {
                      const platformObj = line.platform ? getPlatform(line.platform) : null;
                      const platformTariffs = tariffs?.filter((tt) => tt.platform === line.platform) ?? [];
                      const tariff = tariffs?.find((tt) => tt.id === line.tariffId);
                      const override = tariff ? overridesMap.get(tariff.id) : null;
                      const effective =
                        tariff
                          ? getEffectivePrice({
                              standardPurchasePriceUsd: tariff.purchasePriceUsd,
                              standardSellingPriceUsd: tariff.sellingPriceUsd,
                              customPurchasePriceUsd: override?.customPurchasePriceUsd,
                              customSellingPriceUsd: override?.customSellingPriceUsd,
                            })
                          : null;
                      const lineComputed = computedPricing?.lines[idx];

                      return (
                        <div
                          key={line.id}
                          className="rounded-lg border border-border bg-background/30 p-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-12">
                              <div className="md:col-span-3 space-y-1.5">
                                <Label htmlFor={`platform-${line.id}`} className="text-xs">
                                  Plateforme
                                </Label>
                                <Select
                                  id={`platform-${line.id}`}
                                  value={line.platform}
                                  onChange={(e) => handlePlatformChange(line.id, e.target.value)}
                                >
                                  <option value="">—</option>
                                  {PLATFORMS.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </Select>
                              </div>

                              <div className="md:col-span-3 space-y-1.5">
                                <Label htmlFor={`obj-${line.id}`} className="text-xs">
                                  Objectif
                                </Label>
                                <Select
                                  id={`obj-${line.id}`}
                                  value={line.optimizationGoal}
                                  onChange={(e) => handleObjectiveChange(line.id, e.target.value)}
                                  disabled={!line.platform}
                                >
                                  <option value="">—</option>
                                  {platformTariffs.map((tt) => (
                                    <option key={tt.id} value={tt.optimizationGoal}>
                                      {tt.optimizationGoal.toUpperCase()} — {tt.name}
                                    </option>
                                  ))}
                                </Select>
                              </div>

                              <div className="md:col-span-2 space-y-1.5">
                                <Label htmlFor={`qty-${line.id}`} className="text-xs">
                                  Quantité
                                </Label>
                                <Input
                                  id={`qty-${line.id}`}
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLine(line.id, { quantity: Number(e.target.value) || 0 })
                                  }
                                />
                              </div>

                              <div className="md:col-span-4 space-y-1.5">
                                <Label className="text-xs">Total ligne</Label>
                                <div className="flex h-10 items-center justify-between rounded-lg border border-border bg-card px-3">
                                  <span className="text-xs text-textSecondary">
                                    {lineComputed
                                      ? formatAmount(lineComputed.unitPriceDzd, lang) + ' / unité'
                                      : '—'}
                                  </span>
                                  <span className="font-semibold tabular-nums text-textPrimary">
                                    {lineComputed ? formatAmount(lineComputed.totalDzd, lang) : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.id)}
                              disabled={lines.length === 1}
                              aria-label="Supprimer ligne"
                              className="mt-7"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {tariff && effective && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-textSecondary">
                              {platformObj && (
                                <Badge variant="neutral">
                                  {platformObj.name} · {tariff.optimizationGoal.toUpperCase()}
                                </Badge>
                              )}
                              {override && (override.customPurchasePriceUsd || override.customSellingPriceUsd) && (
                                <Badge variant="violet">Tarif spécial client</Badge>
                              )}
                              <span>
                                Prix vente USD :{' '}
                                <span className="font-medium text-textPrimary">
                                  {formatAmount(effective.sellingPriceUsd, lang, 'USD')}
                                </span>
                              </span>
                              <span>
                                × taux {settings.sourceCurrency}→DZD :{' '}
                                <span className="font-medium text-textPrimary">
                                  {settings.exchangeRate}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <Button type="button" variant="outline" onClick={addLine}>
                      <Plus className="h-4 w-4" />
                      Ajouter une ligne
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Totals + Notes */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Notes & validité</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="validUntil">Valide jusqu&apos;au</Label>
                    <Input
                      id="validUntil"
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (visible sur le PDF)</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Conditions particulières, remarques, périodicité..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Récapitulatif</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {computedPricing ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-textSecondary">Sous-total HT</span>
                        <span className="tabular-nums">{formatAmount(computedPricing.subtotalDzd, lang)}</span>
                      </div>
                      {computedPricing.discountAmountDzd > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Remise ({formatPercentage(computedPricing.discountPercentage, lang)})</span>
                          <span className="tabular-nums">
                            - {formatAmount(computedPricing.discountAmountDzd, lang)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-textSecondary">
                          TVA ({formatPercentage(computedPricing.vatRate, lang)})
                        </span>
                        <span className="tabular-nums">+ {formatAmount(computedPricing.vatAmountDzd, lang)}</span>
                      </div>
                      <div className="border-t border-border pt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-textPrimary">Total TTC</span>
                          <span className="text-lg font-bold tabular-nums text-textPrimary">
                            {formatAmount(computedPricing.totalDzd, lang)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="py-4 text-center text-textSecondary">
                      Ajoute au moins une ligne valide
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Annuler
              </Button>
              <Button
                type="submit"
                isLoading={submitting}
                disabled={!computedPricing || computedPricing.lines.length === 0}
              >
                <FileText className="h-4 w-4" />
                Enregistrer comme brouillon
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
