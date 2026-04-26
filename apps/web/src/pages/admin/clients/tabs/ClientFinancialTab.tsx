import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES, formatAmount, formatDateTime } from '@sensads/core';
import {
  useClientFinancialSettings,
  useUpdateClientFinancialSettings,
  useExchangeRateHistory,
} from '@/hooks/useClientFinancialSettings';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({
  sourceCurrency: z.enum(SUPPORTED_CURRENCIES),
  exchangeRate: z.coerce.number().positive('Doit être > 0'),
  discountPercentage: z.coerce.number().min(0).max(1),
  customVatRate: z.coerce.number().min(0).max(1).nullable().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  organizationId: string;
}

export function ClientFinancialTab({ organizationId }: Props): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { data: settings, isLoading } = useClientFinancialSettings(organizationId);
  const { data: history } = useExchangeRateHistory(organizationId);
  const update = useUpdateClientFinancialSettings();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (settings) {
      reset({
        sourceCurrency: settings.sourceCurrency,
        exchangeRate: settings.exchangeRate,
        discountPercentage: settings.discountPercentage,
        customVatRate: settings.customVatRate ?? undefined,
        paymentTermsDays: settings.paymentTermsDays,
      });
    }
  }, [settings, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      await update.mutateAsync({
        organizationId,
        sourceCurrency: data.sourceCurrency,
        exchangeRate: data.exchangeRate,
        discountPercentage: data.discountPercentage,
        customVatRate: data.customVatRate ?? null,
        paymentTermsDays: data.paymentTermsDays,
      });
      toast.show({ variant: 'success', title: 'Paramètres financiers mis à jour' });
      reset(data);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!settings) {
    return (
      <Alert variant="warning" title="Configuration manquante">
        Aucun paramètre financier pour ce client. La configuration n&apos;a pas été créée — réessaie en éditant le formulaire.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Devise et taux de change</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sourceCurrency">Devise source</Label>
                <Select id="sourceCurrency" {...register('sourceCurrency')}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
                <p className="text-xs text-textSecondary">
                  Devise dans laquelle le client paie ses ad accounts.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exchangeRate">Taux → DZD</Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  error={errors.exchangeRate?.message}
                  {...register('exchangeRate')}
                />
                <p className="text-xs text-textSecondary">
                  1 {settings.sourceCurrency} = ce nombre de DZD. Modifier crée une entrée historique.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conditions commerciales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="discountPercentage">Remise (0-1)</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  error={errors.discountPercentage?.message}
                  {...register('discountPercentage')}
                />
                <p className="text-xs text-textSecondary">0.10 = 10%</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customVatRate">TVA custom (0-1)</Label>
                <Input
                  id="customVatRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="Vide = défaut app"
                  error={errors.customVatRate?.message}
                  {...register('customVatRate')}
                />
                <p className="text-xs text-textSecondary">Vide = TVA app_settings (19%)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentTermsDays">Délai paiement (jours)</Label>
                <Input
                  id="paymentTermsDays"
                  type="number"
                  min="0"
                  max="365"
                  error={errors.paymentTermsDays?.message}
                  {...register('paymentTermsDays')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
            Enregistrer
          </Button>
        </div>
      </form>

      {/* Historique taux de change */}
      <Card>
        <CardHeader>
          <CardTitle>Historique du taux de change</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="py-4 text-center text-sm text-textSecondary">Aucun historique</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-textSecondary">
                    <th className="pb-2 font-medium">Devise</th>
                    <th className="pb-2 text-right font-medium">Taux</th>
                    <th className="pb-2 font-medium">Effectif depuis</th>
                    <th className="pb-2 font-medium">Effectif jusqu&apos;à</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const r = row as { id: string; currency: string; rate: number; effective_from: string; effective_to: string | null };
                    return (
                      <tr key={r.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2 font-medium">{r.currency}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatAmount(r.rate, lang, 'DZD', { minDecimals: 4 })}
                        </td>
                        <td className="py-2 text-textSecondary text-xs">{formatDateTime(r.effective_from, lang)}</td>
                        <td className="py-2 text-textSecondary text-xs">
                          {r.effective_to ? formatDateTime(r.effective_to, lang) : <span className="text-success">Actuel</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="hidden">{t('common.search')}</div>
    </div>
  );
}
