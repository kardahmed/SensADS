/**
 * /tm/kpis — Vue agrégée des campagnes du TM avec saisie KPIs rapide.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Search } from 'lucide-react';
import { dbCampaignToCampaign, formatAmount, getPlatform, type Campaign } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

export function TmKpisPage(): JSX.Element {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['tm-campaigns', profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<Campaign[]> => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('*, organizations!inner(assigned_tm_id, name)')
        .eq('organizations.assigned_tm_id', profile.id)
        .in('status', ['active', 'paused', 'completed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => dbCampaignToCampaign(row as never));
    },
  });

  const filtered = (campaigns ?? []).filter((c) =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.number.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">{t('nav.kpis')}</h1>
        <p className="mt-1 text-sm text-textSecondary">Saisie rapide des KPIs sur tes campagnes actives.</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
          <Input className="pl-9" placeholder="Nom ou CAM-..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="Aucune campagne" description="Aucune campagne assignée ou correspondant à la recherche." />
      )}

      {!isLoading && filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/40 text-left">
                  <th className="p-3 font-medium text-textSecondary">N°</th>
                  <th className="p-3 font-medium text-textSecondary">Nom</th>
                  <th className="p-3 font-medium text-textSecondary">Plateforme</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Budget</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Dépensé</th>
                  <th className="p-3 font-medium text-textSecondary">Statut</th>
                  <th className="p-3 text-right font-medium text-textSecondary">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const platform = getPlatform(c.platform);
                  const ratio = c.budgetDzd > 0 ? c.totalSpentDzd / c.budgetDzd : 0;
                  return (
                    <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-background/40">
                      <td className="p-3"><span className="font-mono text-xs">{c.number}</span></td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: platform?.color ?? '#9CA3AF' }}>
                            {platform?.iconText ?? '?'}
                          </div>
                          <span className="text-xs">{platform?.name ?? c.platform}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatAmount(c.budgetDzd, lang)}</td>
                      <td className="p-3 text-right tabular-nums">
                        <div>{formatAmount(c.totalSpentDzd, lang)}</div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
                          <div className={ratio > 0.9 ? 'h-full bg-error' : ratio > 0.7 ? 'h-full bg-warning' : 'h-full bg-success'} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                      </td>
                      <td className="p-3"><StatusBadge status={c.status} type="campaign" language={lang} /></td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/tm/campaigns/${c.id}`)}>
                          Saisir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
