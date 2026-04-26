import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AD_ACCOUNT_CURRENCIES, PLATFORMS } from '@sensads/core';
import {
  useCreateAdAccount,
  useUpdateAdAccount,
  type AdAccount,
} from '@/hooks/useAdAccounts';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

const PIXEL_TYPES = [
  'meta_pixel',
  'google_tag',
  'tiktok_pixel',
  'snapchat_pixel',
  'linkedin_tag',
  'twitter_pixel',
  'custom',
] as const;

const schema = z.object({
  platform: z.string().min(1),
  externalAccountId: z.string().min(1).max(100),
  accountName: z.string().max(200).optional().or(z.literal('')),
  accountCurrency: z.enum(AD_ACCOUNT_CURRENCIES),
  pixelId: z.string().max(100).optional().or(z.literal('')),
  pixelType: z.enum(PIXEL_TYPES).optional().or(z.literal('') as never),
  gtmContainerId: z.string().max(50).optional().or(z.literal('')),
  ga4MeasurementId: z.string().max(50).optional().or(z.literal('')),
  trackingNotes: z.string().max(1000).optional().or(z.literal('')),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  organizationId: string;
  account: AdAccount | null;
  open: boolean;
  onClose: () => void;
}

export function AdAccountDialog({ organizationId, account, open, onClose }: Props): JSX.Element {
  const create = useCreateAdAccount();
  const update = useUpdateAdAccount();
  const toast = useToast();
  const isEdit = !!account;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { accountCurrency: 'USD' },
  });

  useEffect(() => {
    if (open) {
      if (account) {
        reset({
          platform: account.platform,
          externalAccountId: account.externalAccountId,
          accountName: account.accountName ?? '',
          accountCurrency: account.accountCurrency,
          pixelId: account.pixelId ?? '',
          pixelType: account.pixelType ?? ('' as never),
          gtmContainerId: account.gtmContainerId ?? '',
          ga4MeasurementId: account.ga4MeasurementId ?? '',
          trackingNotes: account.trackingNotes ?? '',
        });
      } else {
        reset({
          platform: '',
          externalAccountId: '',
          accountName: '',
          accountCurrency: 'USD',
          pixelId: '',
          pixelType: '' as never,
          gtmContainerId: '',
          ga4MeasurementId: '',
          trackingNotes: '',
        });
      }
    }
  }, [open, account, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEdit && account) {
        await update.mutateAsync({
          id: account.id,
          organizationId,
          accountName: data.accountName || undefined,
          accountCurrency: data.accountCurrency,
          pixelId: data.pixelId || undefined,
          pixelType: data.pixelType || undefined,
          gtmContainerId: data.gtmContainerId || undefined,
          ga4MeasurementId: data.ga4MeasurementId || undefined,
          trackingNotes: data.trackingNotes || undefined,
        });
        toast.show({ variant: 'success', title: 'Ad account mis à jour' });
      } else {
        await create.mutateAsync({
          organizationId,
          platform: data.platform,
          externalAccountId: data.externalAccountId,
          accountName: data.accountName || undefined,
          accountCurrency: data.accountCurrency,
          pixelId: data.pixelId || undefined,
          pixelType: data.pixelType || undefined,
          gtmContainerId: data.gtmContainerId || undefined,
          ga4MeasurementId: data.ga4MeasurementId || undefined,
          trackingNotes: data.trackingNotes || undefined,
        });
        toast.show({ variant: 'success', title: 'Ad account créé' });
      }
      onClose();
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier l\'ad account' : 'Nouvel ad account'}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform">Plateforme *</Label>
            <Select id="platform" disabled={isEdit} error={errors.platform?.message} {...register('platform')}>
              <option value="">Sélectionner...</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="externalAccountId">ID compte externe *</Label>
            <Input
              id="externalAccountId"
              disabled={isEdit}
              placeholder="act_xxxxx ou ID brut"
              error={errors.externalAccountId?.message}
              {...register('externalAccountId')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="accountName">Nom du compte (libre)</Label>
            <Input id="accountName" placeholder="Ex: Account principal" {...register('accountName')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountCurrency">Devise du compte</Label>
            <Select id="accountCurrency" {...register('accountCurrency')}>
              {AD_ACCOUNT_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-semibold text-textPrimary">Tracking</p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pixelId">Pixel ID</Label>
                <Input id="pixelId" placeholder="123456789" {...register('pixelId')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pixelType">Type de pixel</Label>
                <Select id="pixelType" {...register('pixelType')}>
                  <option value="">—</option>
                  <option value="meta_pixel">Meta Pixel</option>
                  <option value="google_tag">Google Tag</option>
                  <option value="tiktok_pixel">TikTok Pixel</option>
                  <option value="snapchat_pixel">Snapchat Pixel</option>
                  <option value="linkedin_tag">LinkedIn Tag</option>
                  <option value="twitter_pixel">Twitter/X Pixel</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gtmContainerId">GTM Container ID</Label>
                <Input id="gtmContainerId" placeholder="GTM-XXXXXX" {...register('gtmContainerId')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ga4MeasurementId">GA4 Measurement ID</Label>
                <Input id="ga4MeasurementId" placeholder="G-XXXXXXXXXX" {...register('ga4MeasurementId')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trackingNotes">Notes tracking</Label>
              <Textarea
                id="trackingNotes"
                rows={2}
                placeholder="Configuration spécifique, anomalies..."
                {...register('trackingNotes')}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
