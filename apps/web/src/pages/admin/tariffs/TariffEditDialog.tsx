import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { PlatformTariff } from '@sensads/core';
import { useUpdateTariff } from '@/hooks/useTariffs';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const schema = z
  .object({
    name: z.string().min(1).max(100),
    purchasePriceUsd: z.coerce.number().positive('Doit être > 0'),
    sellingPriceUsd: z.coerce.number().positive(),
    minBudgetDzd: z.coerce.number().nonnegative(),
  })
  .refine((d) => d.sellingPriceUsd >= d.purchasePriceUsd, {
    message: 'Prix vente doit être ≥ prix achat',
    path: ['sellingPriceUsd'],
  });

type FormInput = z.infer<typeof schema>;

interface Props {
  tariff: PlatformTariff | null;
  open: boolean;
  onClose: () => void;
}

export function TariffEditDialog({ tariff, open, onClose }: Props): JSX.Element {
  const updateTariff = useUpdateTariff();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tariff) {
      reset({
        name: tariff.name,
        purchasePriceUsd: tariff.purchasePriceUsd,
        sellingPriceUsd: tariff.sellingPriceUsd,
        minBudgetDzd: tariff.minBudgetDzd,
      });
    }
  }, [tariff, reset]);

  const onSubmit = handleSubmit(async (data) => {
    if (!tariff) return;
    try {
      await updateTariff.mutateAsync({ id: tariff.id, ...data });
      toast.show({ variant: 'success', title: 'Tarif mis à jour' });
      onClose();
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  });

  if (!tariff) return <Dialog open={false} onClose={onClose}>{null}</Dialog>;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Modifier le tarif"
      description={`${tariff.platform} · ${tariff.optimizationGoal}`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nom du tarif</Label>
          <Input id="name" error={errors.name?.message} {...register('name')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="purchasePriceUsd">Prix achat (USD)</Label>
            <Input
              id="purchasePriceUsd"
              type="number"
              step="0.01"
              min="0.01"
              error={errors.purchasePriceUsd?.message}
              {...register('purchasePriceUsd')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellingPriceUsd">Prix vente (USD)</Label>
            <Input
              id="sellingPriceUsd"
              type="number"
              step="0.01"
              min="0.01"
              error={errors.sellingPriceUsd?.message}
              {...register('sellingPriceUsd')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minBudgetDzd">Budget minimum (DZD)</Label>
          <Input
            id="minBudgetDzd"
            type="number"
            step="100"
            min="0"
            error={errors.minBudgetDzd?.message}
            {...register('minBudgetDzd')}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Enregistrer
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
