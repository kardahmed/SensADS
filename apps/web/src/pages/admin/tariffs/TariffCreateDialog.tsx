import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PLATFORMS } from '@sensads/core';
import { useCreateTariff } from '@/hooks/useTariffs';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';

const schema = z
  .object({
    platform: z.string().min(1, 'Plateforme requise'),
    optimizationGoal: z.string().min(1, 'Objectif requis'),
    name: z.string().min(1).max(100),
    purchasePriceUsd: z.coerce.number().positive('Doit être > 0'),
    sellingPriceUsd: z.coerce.number().positive(),
    minBudgetDzd: z.coerce.number().nonnegative().default(0),
  })
  .refine((d) => d.sellingPriceUsd >= d.purchasePriceUsd, {
    message: 'Prix vente doit être ≥ prix achat',
    path: ['sellingPriceUsd'],
  });

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TariffCreateDialog({ open, onClose }: Props): JSX.Element {
  const createTariff = useCreateTariff();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { minBudgetDzd: 0 },
  });

  const selectedPlatform = PLATFORMS.find((p) => p.id === watch('platform'));

  const onSubmit = handleSubmit(async (data) => {
    try {
      await createTariff.mutateAsync({
        platform: data.platform,
        optimizationGoal: data.optimizationGoal,
        name: data.name,
        purchasePriceUsd: data.purchasePriceUsd,
        sellingPriceUsd: data.sellingPriceUsd,
        minBudgetDzd: data.minBudgetDzd,
        status: 'active',
      });
      toast.show({ variant: 'success', title: 'Tarif créé' });
      reset();
      onClose();
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur création',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nouveau tarif" size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="platform">Plateforme</Label>
            <Select id="platform" error={errors.platform?.message} {...register('platform')}>
              <option value="">Sélectionner...</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="optimizationGoal">Objectif d&apos;optimisation</Label>
            <Select
              id="optimizationGoal"
              error={errors.optimizationGoal?.message}
              {...register('optimizationGoal')}
            >
              <option value="">Sélectionner...</option>
              {selectedPlatform?.supportedObjectives.map((g) => (
                <option key={g} value={g}>
                  {g.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nom du tarif (ex: CPC, CPM, CPA)</Label>
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
              placeholder="0.50"
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
              placeholder="1.20"
              error={errors.sellingPriceUsd?.message}
              {...register('sellingPriceUsd')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minBudgetDzd">Budget minimum (DZD) — optionnel</Label>
          <Input
            id="minBudgetDzd"
            type="number"
            step="100"
            min="0"
            placeholder="5000"
            error={errors.minBudgetDzd?.message}
            {...register('minBudgetDzd')}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Créer le tarif
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
