/**
 * /admin/settings — Paramètres globaux de l'app (super_admin only).
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

const schema = z.object({
  vatRate: z.coerce.number().min(0).max(1),
  invoiceMinimumAmountDzd: z.coerce.number().min(0),
  agencyName: z.string().min(2),
  agencyAddress: z.string().optional().or(z.literal('')),
  agencyNif: z.string().optional().or(z.literal('')),
  agencyVatId: z.string().optional().or(z.literal('')),
  agencyEmail: z.string().email().optional().or(z.literal('')),
  agencyPhone: z.string().optional().or(z.literal('')),
});

type FormInput = z.infer<typeof schema>;

export function AppSettingsPage(): JSX.Element {
  const { data: settings, isLoading } = useAppSettings();
  const toast = useToast();
  const qc = useQueryClient();
  const [notifEnabled, setNotifEnabled] = useState(true);

  const update = useMutation({
    mutationFn: async (input: FormInput & { notifications_enabled: boolean }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({
          vat_rate: input.vatRate,
          invoice_minimum_amount_dzd: input.invoiceMinimumAmountDzd,
          agency_name: input.agencyName,
          agency_address: input.agencyAddress || null,
          agency_nif: input.agencyNif || null,
          agency_vat_id: input.agencyVatId || null,
          agency_email: input.agencyEmail || null,
          agency_phone: input.agencyPhone || null,
          notifications_enabled: input.notifications_enabled,
        })
        .eq('id', SETTINGS_ID);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['app-settings'] });
      toast.show({ variant: 'success', title: 'Paramètres mis à jour' });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (settings) {
      reset({
        vatRate: settings.vatRate,
        invoiceMinimumAmountDzd: settings.invoiceMinimumAmountDzd,
        agencyName: settings.agencyName,
        agencyAddress: settings.agencyAddress ?? '',
        agencyNif: settings.agencyNif ?? '',
        agencyVatId: settings.agencyVatId ?? '',
        agencyEmail: '',
        agencyPhone: '',
      });
      setNotifEnabled(settings.notificationsEnabled);
    }
  }, [settings, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      await update.mutateAsync({ ...data, notifications_enabled: notifEnabled });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!settings) return <Alert variant="error" title="Paramètres introuvables">app_settings n&apos;existe pas. Vérifie la migration 002.</Alert>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Paramètres app</h1>
          <p className="text-sm text-textSecondary">Configuration globale (super_admin uniquement).</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Identité de l&apos;agence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agencyName">Nom agence *</Label>
              <Input id="agencyName" error={errors.agencyName?.message} {...register('agencyName')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agencyAddress">Adresse</Label>
              <Textarea id="agencyAddress" rows={2} {...register('agencyAddress')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agencyNif">NIF agence</Label>
                <Input id="agencyNif" {...register('agencyNif')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyVatId">VAT-ID</Label>
                <Input id="agencyVatId" {...register('agencyVatId')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Facturation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vatRate">TVA par défaut (0-1)</Label>
                <Input id="vatRate" type="number" step="0.01" min="0" max="1" {...register('vatRate')} />
                <p className="text-xs text-textSecondary">0.19 = 19%</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceMinimumAmountDzd">Seuil min facture DZD</Label>
                <Input id="invoiceMinimumAmountDzd" type="number" min="0" {...register('invoiceMinimumAmountDzd')} />
                <p className="text-xs text-textSecondary">Sous ce seuil → revue manuelle</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3">
              <div>
                <Label>Activer les notifications globalement</Label>
                <p className="text-xs text-textSecondary">Désactive pour suspendre tous les emails et notifs in-app.</p>
              </div>
              <Switch checked={notifEnabled} onCheckedChange={setNotifEnabled} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" isLoading={update.isPending} disabled={!isDirty && notifEnabled === settings.notificationsEnabled}>
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  );
}
