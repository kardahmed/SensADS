import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ALGERIAN_WILAYAS, type Organization } from '@sensads/core';
import { useUpdateOrganization } from '@/hooks/useOrganizations';
import { useTrafficManagers } from '@/hooks/useTrafficManagers';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';

const schema = z.object({
  name: z.string().min(2).max(200),
  legalName: z.string().max(200).optional().or(z.literal('')),
  nif: z.string().regex(/^\d{15}$/, 'NIF doit contenir 15 chiffres').optional().or(z.literal('')),
  nis: z.string().regex(/^\d{15}$/, 'NIS doit contenir 15 chiffres').optional().or(z.literal('')),
  rc: z.string().min(3).max(50).optional().or(z.literal('')),
  vatId: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  wilaya: z.string().optional().or(z.literal('')),
  country: z.string().min(2).max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  assignedTmId: z.string().optional().or(z.literal('')),
  maxSubAccounts: z.coerce.number().int().min(0).max(100),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  organization: Organization;
}

export function ClientInfoTab({ organization }: Props): JSX.Element {
  const { data: tms } = useTrafficManagers();
  const update = useUpdateOrganization();
  const toast = useToast();
  const [sandboxMode, setSandboxMode] = useState(organization.sandboxMode);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization.name,
      legalName: organization.legalName ?? '',
      nif: organization.nif ?? '',
      nis: organization.nis ?? '',
      rc: organization.rc ?? '',
      vatId: organization.vatId ?? '',
      address: organization.address ?? '',
      wilaya: organization.wilaya ?? '',
      country: organization.country,
      phone: organization.phone ?? '',
      email: organization.email ?? '',
      assignedTmId: organization.assignedTmId ?? '',
      maxSubAccounts: organization.maxSubAccounts,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await update.mutateAsync({
        id: organization.id,
        name: data.name,
        legalName: data.legalName || null,
        nif: data.nif || null,
        nis: data.nis || null,
        rc: data.rc || null,
        vatId: data.vatId || null,
        address: data.address || null,
        wilaya: data.wilaya || null,
        country: data.country,
        phone: data.phone || null,
        email: data.email || null,
        assignedTmId: data.assignedTmId || null,
        maxSubAccounts: data.maxSubAccounts,
        sandboxMode,
      });
      toast.show({ variant: 'success', title: 'Client mis à jour' });
      reset(data);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nom commercial *</Label>
              <Input id="name" error={errors.name?.message} {...register('name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName">Raison sociale</Label>
              <Input id="legalName" {...register('legalName')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="nif">NIF</Label>
              <Input id="nif" error={errors.nif?.message} {...register('nif')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nis">NIS</Label>
              <Input id="nis" error={errors.nis?.message} {...register('nis')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc">Registre Commerce</Label>
              <Input id="rc" {...register('rc')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vatId">VAT-ID (UE)</Label>
            <Input id="vatId" {...register('vatId')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coordonnées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" type="tel" {...register('phone')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email org</Label>
              <Input id="email" type="email" {...register('email')} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wilaya">Wilaya</Label>
              <Select id="wilaya" {...register('wilaya')}>
                <option value="">—</option>
                {ALGERIAN_WILAYAS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Pays</Label>
              <Input id="country" {...register('country')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Textarea id="address" rows={2} {...register('address')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assignedTmId">Traffic Manager assigné</Label>
              <Select id="assignedTmId" {...register('assignedTmId')}>
                <option value="">Aucun</option>
                {tms?.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.fullName ?? tm.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSubAccounts">Max sous-comptes</Label>
              <Input
                id="maxSubAccounts"
                type="number"
                min="0"
                max="100"
                {...register('maxSubAccounts')}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-3">
            <div>
              <Label htmlFor="sandbox-toggle">Mode sandbox</Label>
              <p className="text-xs text-textSecondary">
                Activé : pas de facturation réelle. À désactiver pour mise en production.
              </p>
            </div>
            <Switch
              id="sandbox-toggle"
              checked={sandboxMode}
              onCheckedChange={setSandboxMode}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty && sandboxMode === organization.sandboxMode}>
          Enregistrer les modifications
        </Button>
      </div>
    </form>
  );
}
