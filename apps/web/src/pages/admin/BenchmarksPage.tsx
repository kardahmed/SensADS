import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { formatAmount, formatPercentage, getPlatform, PLATFORMS } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useBenchmarks, useUpdateBenchmark, type Benchmark } from '@/hooks/useBenchmarks';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

export function BenchmarksPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isAdmin } = useAuth();
  const { data: benchmarks, isLoading } = useBenchmarks();
  const update = useUpdateBenchmark();
  const toast = useToast();
  const [editing, setEditing] = useState<Benchmark | null>(null);

  const { register, handleSubmit, reset } = useForm<{ cpm: number; cpc: number; ctr: number; cpa: number; roas: number; sampleSize: number }>();

  useEffect(() => {
    if (editing) {
      reset({
        cpm: editing.cpm,
        cpc: editing.cpc,
        ctr: editing.ctr,
        cpa: editing.cpa,
        roas: editing.roas,
        sampleSize: editing.sampleSize,
      });
    }
  }, [editing, reset]);

  const onSubmit = handleSubmit(async (data) => {
    if (!editing) return;
    try {
      await update.mutateAsync({ id: editing.id, ...data });
      toast.show({ variant: 'success', title: 'Benchmark mis à jour' });
      setEditing(null);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  });

  const grouped = new Map<string, Benchmark[]>();
  for (const b of benchmarks ?? []) {
    const list = grouped.get(b.platform) ?? [];
    list.push(b);
    grouped.set(b.platform, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.benchmarks')}</h1>
        <p className="mt-1 text-sm text-textSecondary">Benchmarks marché MENA par plateforme et objectif.</p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {!isLoading && (!benchmarks || benchmarks.length === 0) && (
        <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="Aucun benchmark" description="Vide. Lance le seed des migrations." />
      )}

      {!isLoading && benchmarks && benchmarks.length > 0 && (
        <Accordion>
          {PLATFORMS.map((platform) => {
            const list = grouped.get(platform.id) ?? [];
            if (list.length === 0) return null;
            return (
              <AccordionItem
                key={platform.id}
                defaultOpen={platform.id === 'facebook'}
                title={
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: platform.color }}>
                      {platform.iconText}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{platform.name}</p>
                      <p className="text-xs text-textSecondary">{list.length} benchmarks · MENA</p>
                    </div>
                  </div>
                }
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-textSecondary">
                      <th className="pb-2 font-medium">Objectif</th>
                      <th className="pb-2 text-right font-medium">CPM</th>
                      <th className="pb-2 text-right font-medium">CPC</th>
                      <th className="pb-2 text-right font-medium">CTR</th>
                      <th className="pb-2 text-right font-medium">CPA</th>
                      <th className="pb-2 text-right font-medium">ROAS</th>
                      <th className="pb-2 text-right font-medium">Sample</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => (
                      <tr key={b.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2"><Badge variant="neutral">{b.optimizationGoal.toUpperCase()}</Badge></td>
                        <td className="py-2 text-right tabular-nums">{formatAmount(b.cpm, lang, 'USD')}</td>
                        <td className="py-2 text-right tabular-nums">{formatAmount(b.cpc, lang, 'USD')}</td>
                        <td className="py-2 text-right tabular-nums">{formatPercentage(b.ctr / 100, lang)}</td>
                        <td className="py-2 text-right tabular-nums">{formatAmount(b.cpa, lang, 'USD')}</td>
                        <td className="py-2 text-right tabular-nums">{b.roas.toFixed(2)}x</td>
                        <td className="py-2 text-right text-xs text-textSecondary">{b.sampleSize}</td>
                        {isAdmin && (
                          <td className="py-2 text-right">
                            <Button variant="ghost" size="icon" onClick={() => setEditing(b)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Éditer ${getPlatform(editing.platform)?.name} · ${editing.optimizationGoal}` : ''}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="cpm">CPM (USD)</Label><Input id="cpm" type="number" step="0.01" {...register('cpm', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label htmlFor="cpc">CPC (USD)</Label><Input id="cpc" type="number" step="0.01" {...register('cpc', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label htmlFor="ctr">CTR (%)</Label><Input id="ctr" type="number" step="0.01" {...register('ctr', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label htmlFor="cpa">CPA (USD)</Label><Input id="cpa" type="number" step="0.01" {...register('cpa', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label htmlFor="roas">ROAS (x)</Label><Input id="roas" type="number" step="0.01" {...register('roas', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label htmlFor="sampleSize">Sample size</Label><Input id="sampleSize" type="number" {...register('sampleSize', { valueAsNumber: true })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditing(null)}>Annuler</Button>
            <Button type="submit" isLoading={update.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
