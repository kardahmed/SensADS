/**
 * /tm/forecasts & /admin/forecasts & /client/forecasts — Prévisions budgétaires
 * avec 3 scénarios (pessimiste/réaliste/optimiste).
 *
 * Calcul automatique des projections à partir des benchmarks de la plateforme
 * pour l'objectif `awareness` par défaut. Multiplicateurs : pessimiste = 0.8,
 * réaliste = 1.0, optimiste = 1.2 sur impressions/clics/conversions.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Plus, Send, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatAmount, formatDate, formatPercentage, getPlatform, PLATFORMS } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useBenchmarks } from '@/hooks/useBenchmarks';
import {
  useForecasts,
  useCreateForecast,
  useUpdateForecastStatus,
  type ForecastScenarioType,
} from '@/hooks/useForecasts';
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

const SCENARIO_MULTIPLIERS: Record<ForecastScenarioType, number> = {
  pessimistic: 0.8,
  realistic: 1.0,
  optimistic: 1.2,
};

const SCENARIO_LABELS: Record<ForecastScenarioType, { label: string; color: string }> = {
  pessimistic: { label: 'Pessimiste', color: 'text-warning' },
  realistic: { label: 'Réaliste', color: 'text-accent' },
  optimistic: { label: 'Optimiste', color: 'text-success' },
};

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' | 'info' }> = {
  draft: { label: 'Brouillon', variant: 'neutral' },
  shared_with_client: { label: 'Partagée', variant: 'info' },
  approved: { label: 'Approuvée', variant: 'success' },
  converted_to_quote: { label: 'Convertie devis', variant: 'success' },
  expired: { label: 'Expirée', variant: 'neutral' },
};

const schema = z.object({
  organizationId: z.string().uuid({ message: 'Sélectionne un client' }),
  title: z.string().min(2, 'Titre trop court').max(200),
  description: z.string().optional().or(z.literal('')),
  startDate: z.string().min(1, 'Date début requise'),
  endDate: z.string().min(1, 'Date fin requise'),
  totalBudgetDzd: z.coerce.number().positive('Budget > 0'),
  primaryPlatform: z.string().min(1, 'Plateforme requise'),
});

type FormInput = z.infer<typeof schema>;

interface BenchData {
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
}

function computeScenario(scenario: ForecastScenarioType, budget: number, b: BenchData): {
  impressions: number;
  clicks: number;
  conversions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
} {
  const m = SCENARIO_MULTIPLIERS[scenario];
  const impressions = b.cpm > 0 ? Math.round((budget / b.cpm) * 1000 * m) : 0;
  const ctr = b.ctr > 0 ? b.ctr / 100 : 0.01;
  const clicks = Math.round(impressions * ctr * m);
  const cpa = b.cpa > 0 ? b.cpa : Math.max(b.cpc * 10, 1);
  const conversions = cpa > 0 ? Math.max(0, Math.round((budget / cpa) * m)) : 0;
  return {
    impressions,
    clicks,
    conversions,
    cpm: b.cpm,
    cpc: b.cpc,
    ctr,
    cpa,
  };
}

export function ForecastsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isStaff, profile } = useAuth();
  const toast = useToast();

  const [creating, setCreating] = useState(false);

  const forecasts = useForecasts();
  const orgs = useOrganizations({ pageSize: 100 });
  const benchmarksQ = useBenchmarks();
  const create = useCreateForecast();
  const updateStatus = useUpdateForecastStatus();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: profile?.organizationId ?? '',
      totalBudgetDzd: 100000,
      primaryPlatform: 'facebook',
    },
  });

  const watchPlatform = watch('primaryPlatform');
  const watchBudget = watch('totalBudgetDzd');

  const benchmark = useMemo(() => {
    const list = benchmarksQ.data ?? [];
    const match = list.find((b) => b.platform === watchPlatform && b.optimizationGoal === 'awareness');
    if (match) return { cpm: match.cpm, cpc: match.cpc, ctr: match.ctr, cpa: match.cpa };
    const anyForPlatform = list.find((b) => b.platform === watchPlatform);
    if (anyForPlatform) return { cpm: anyForPlatform.cpm, cpc: anyForPlatform.cpc, ctr: anyForPlatform.ctr, cpa: anyForPlatform.cpa };
    return { cpm: 5, cpc: 0.5, ctr: 1, cpa: 10 };
  }, [benchmarksQ.data, watchPlatform]);

  const previewScenarios = useMemo(() => {
    const budget = Number(watchBudget) || 0;
    return (['pessimistic', 'realistic', 'optimistic'] as const).map((s) => ({
      scenario: s,
      ...computeScenario(s, budget, benchmark),
    }));
  }, [watchBudget, benchmark]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const scenarios = (['pessimistic', 'realistic', 'optimistic'] as const).map((s) => {
        const c = computeScenario(s, data.totalBudgetDzd, benchmark);
        return {
          scenario: s,
          estimatedImpressions: c.impressions,
          estimatedClicks: c.clicks,
          estimatedConversions: c.conversions,
          estimatedCpm: c.cpm,
          estimatedCpc: c.cpc,
          estimatedCtr: c.ctr,
          estimatedCpa: c.cpa,
          estimatedRevenueDzd: data.totalBudgetDzd,
        };
      });
      await create.mutateAsync({
        organizationId: data.organizationId,
        title: data.title,
        description: data.description || undefined,
        startDate: data.startDate,
        endDate: data.endDate,
        platforms: [data.primaryPlatform],
        totalBudgetDzd: data.totalBudgetDzd,
        scenarios,
      });
      toast.show({ variant: 'success', title: 'Prévision créée', message: '3 scénarios générés.' });
      setCreating(false);
      reset();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  });

  const onChangeStatus = async (id: string, status: 'shared_with_client' | 'approved'): Promise<void> => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.show({ variant: 'success', title: 'Statut mis à jour' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TrendingUp className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">Prévisions budgétaires</h1>
            <p className="text-sm text-textSecondary">3 scénarios automatiques (pessimiste / réaliste / optimiste) à partir des benchmarks marché.</p>
          </div>
        </div>
        {isStaff && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle prévision
          </Button>
        )}
      </div>

      {forecasts.isLoading && <Skeleton className="h-64 w-full" />}

      {!forecasts.isLoading && (forecasts.data ?? []).length === 0 && (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" />}
          title="Aucune prévision"
          description={isStaff ? 'Crée une prévision avec budget + plateforme cible.' : 'Aucune prévision partagée pour le moment.'}
        />
      )}

      {!forecasts.isLoading && (forecasts.data ?? []).length > 0 && (
        <div className="space-y-4">
          {(forecasts.data ?? []).map((f) => {
            const meta = STATUS_LABELS[f.status] ?? STATUS_LABELS.draft;
            const orderedScenarios: ForecastScenarioType[] = ['pessimistic', 'realistic', 'optimistic'];
            return (
              <Card key={f.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{f.title}</CardTitle>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-textSecondary">
                        {f.number} · {formatDate(f.startDate, lang)} → {formatDate(f.endDate, lang)} · Budget {formatAmount(f.totalBudgetDzd, lang)}
                      </p>
                      <p className="mt-1 text-xs text-textSecondary">
                        Plateformes : {(f.platforms ?? []).map((p) => getPlatform(p)?.name ?? p).join(', ')}
                      </p>
                    </div>
                    {isStaff && (
                      <div className="flex flex-wrap gap-2">
                        {f.status === 'draft' && (
                          <Button size="sm" variant="outline" onClick={() => void onChangeStatus(f.id, 'shared_with_client')}>
                            <Send className="mr-1 h-3 w-3" /> Partager client
                          </Button>
                        )}
                        {f.status === 'shared_with_client' && (
                          <Button size="sm" variant="primary" onClick={() => void onChangeStatus(f.id, 'approved')}>
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Marquer approuvée
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {orderedScenarios.map((sType) => {
                      const sc = (f.scenarios ?? []).find((x) => x.scenario === sType);
                      const labelMeta = SCENARIO_LABELS[sType];
                      return (
                        <div key={sType} className="rounded-lg border border-border bg-background/30 p-4">
                          <p className={`text-xs font-bold uppercase tracking-wider ${labelMeta.color}`}>{labelMeta.label}</p>
                          {sc ? (
                            <ul className="mt-3 space-y-1.5 text-sm">
                              <li className="flex justify-between"><span className="text-textSecondary">Impressions</span><span className="font-mono">{sc.estimatedImpressions.toLocaleString('fr-FR')}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">Clics</span><span className="font-mono">{sc.estimatedClicks.toLocaleString('fr-FR')}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">Conversions</span><span className="font-mono">{sc.estimatedConversions.toLocaleString('fr-FR')}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">CPM</span><span className="font-mono">{formatAmount(sc.estimatedCpm, lang, 'USD')}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">CPC</span><span className="font-mono">{formatAmount(sc.estimatedCpc, lang, 'USD')}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">CTR</span><span className="font-mono">{formatPercentage(sc.estimatedCtr, lang)}</span></li>
                              <li className="flex justify-between"><span className="text-textSecondary">CPA</span><span className="font-mono">{formatAmount(sc.estimatedCpa, lang, 'USD')}</span></li>
                            </ul>
                          ) : (
                            <p className="mt-3 text-xs italic text-textSecondary">Pas de projection</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nouvelle prévision">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input id="title" placeholder="Lancement printemps 2026" error={errors.title?.message} {...register('title')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizationId">Client *</Label>
            <Select id="organizationId" {...register('organizationId')}>
              <option value="">— Choisir —</option>
              {(orgs.data?.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
            {errors.organizationId && <p className="text-xs text-error">{errors.organizationId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate">Début *</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Fin *</Label>
              <Input id="endDate" type="date" {...register('endDate')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="primaryPlatform">Plateforme cible *</Label>
              <Select id="primaryPlatform" {...register('primaryPlatform')}>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalBudgetDzd">Budget DZD *</Label>
              <Input id="totalBudgetDzd" type="number" step="1" min="1" {...register('totalBudgetDzd')} />
              {errors.totalBudgetDzd && <p className="text-xs text-error">{errors.totalBudgetDzd.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>

          <div className="rounded-lg border border-border bg-background/30 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-textSecondary">
              <FileSpreadsheet className="h-3 w-3" /> Aperçu scénarios
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {previewScenarios.map((p) => {
                const meta = SCENARIO_LABELS[p.scenario];
                return (
                  <div key={p.scenario}>
                    <p className={`font-bold ${meta.color}`}>{meta.label}</p>
                    <p className="text-textSecondary">{p.impressions.toLocaleString('fr-FR')} impr.</p>
                    <p className="text-textSecondary">{p.clicks.toLocaleString('fr-FR')} clics</p>
                    <p className="text-textSecondary">{p.conversions.toLocaleString('fr-FR')} conv.</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-textSecondary">
              Basé sur le benchmark MENA · CTR {formatPercentage(benchmark.ctr / 100, lang)} · CPA {formatAmount(benchmark.cpa, lang, 'USD')}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCreating(false)}>Annuler</Button>
            <Button type="submit" isLoading={create.isPending}>Créer la prévision</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
