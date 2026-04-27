/**
 * KpiEntryDialog — Saisie d'un KPI quotidien.
 *
 * Calcule la conversion DZD via le taux figé (snapshot) côté client.
 * En production, idéalement passer par Edge Function compute-kpi-conversion.
 */

import { useState } from 'react';
import { useClientFinancialSettings } from '@/hooks/useClientFinancialSettings';
import { useUpsertKpi } from '@/hooks/useKpis';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';

interface Props {
  campaignId: string;
  organizationId: string;
  open: boolean;
  onClose: () => void;
}

export function KpiEntryDialog({ campaignId, organizationId, open, onClose }: Props): JSX.Element {
  const { data: settings } = useClientFinancialSettings(organizationId);
  const upsert = useUpsertKpi();
  const toast = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [spend, setSpend] = useState('');
  const [impressions, setImpressions] = useState('');
  const [clicks, setClicks] = useState('');
  const [conversions, setConversions] = useState('');
  const [reach, setReach] = useState('');

  const spendNum = Number(spend) || 0;
  const exchangeRate = settings?.exchangeRate ?? 1;
  // Conversion DZD = spend × exchangeRate (sans ratio marge ici, source = devise du tarif client)
  const spendDzd = spendNum * exchangeRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      toast.show({ variant: 'error', title: 'Paramètres financiers manquants pour ce client' });
      return;
    }
    try {
      await upsert.mutateAsync({
        campaignId,
        date,
        spend: spendNum,
        impressions: Number(impressions) || 0,
        clicks: Number(clicks) || 0,
        conversions: Number(conversions) || 0,
        reach: Number(reach) || 0,
        exchangeRateSnapshot: exchangeRate,
        spendDzd,
        source: 'manual',
      });
      toast.show({ variant: 'success', title: 'KPI enregistré' });
      // Reset form
      setSpend('');
      setImpressions('');
      setClicks('');
      setConversions('');
      setReach('');
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Saisir KPI quotidien">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert variant="info">
          Source : {settings?.sourceCurrency ?? '?'} · Taux figé : 1 {settings?.sourceCurrency} = {exchangeRate} DZD
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input id="date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="spend">Dépense ({settings?.sourceCurrency ?? '—'}) *</Label>
            <Input id="spend" type="number" step="0.01" min="0" value={spend} onChange={(e) => setSpend(e.target.value)} required />
            {spendNum > 0 && (
              <p className="text-xs text-textSecondary">≈ {spendDzd.toLocaleString('fr-DZ')} DZD</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="impressions">Impressions *</Label>
            <Input id="impressions" type="number" min="0" value={impressions} onChange={(e) => setImpressions(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clicks">Clics *</Label>
            <Input id="clicks" type="number" min="0" value={clicks} onChange={(e) => setClicks(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conversions">Conversions *</Label>
            <Input id="conversions" type="number" min="0" value={conversions} onChange={(e) => setConversions(e.target.value)} required />
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="reach">Reach (audience unique)</Label>
            <Input id="reach" type="number" min="0" value={reach} onChange={(e) => setReach(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fermer</Button>
          <Button type="submit" isLoading={upsert.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
