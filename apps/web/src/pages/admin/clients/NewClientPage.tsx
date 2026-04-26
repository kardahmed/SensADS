/**
 * /admin/clients/new — Création d'un nouveau client.
 *
 * Crée atomiquement :
 *  - User auth (client_owner)
 *  - Organization
 *  - Default financial settings
 * via l'Edge Function admin-create-client.
 */

import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { ALGERIAN_WILAYAS, SUPPORTED_CURRENCIES } from '@sensads/core';
import { useCreateClient } from '@/hooks/useOrganizations';
import { useTrafficManagers } from '@/hooks/useTrafficManagers';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({
  // Owner
  ownerEmail: z.string().email('Email invalide'),
  ownerPassword: z
    .string()
    .min(12, 'Min 12 caractères')
    .regex(/[A-Z]/, '1 majuscule requise')
    .regex(/[a-z]/, '1 minuscule requise')
    .regex(/\d/, '1 chiffre requis')
    .regex(/[^\w]/, '1 caractère spécial requis'),
  ownerFullName: z.string().min(2).max(200),

  // Org
  orgName: z.string().min(2).max(200),
  legalName: z.string().max(200).optional().or(z.literal('')),
  nif: z
    .string()
    .regex(/^\d{15}$/, 'NIF doit contenir 15 chiffres')
    .optional()
    .or(z.literal('')),
  nis: z
    .string()
    .regex(/^\d{15}$/, 'NIS doit contenir 15 chiffres')
    .optional()
    .or(z.literal('')),
  rc: z.string().min(3).max(50).optional().or(z.literal('')),
  vatId: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  wilaya: z.string().optional().or(z.literal('')),
  country: z.string().min(2).max(100).default('Algérie'),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),

  // Config
  assignedTmId: z.string().optional().or(z.literal('')),
  maxSubAccounts: z.coerce.number().int().min(0).max(100).default(5),
  sandboxMode: z.boolean().default(true),

  // Financial
  sourceCurrency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  exchangeRate: z.coerce.number().positive().default(250),
  discountPercentage: z.coerce.number().min(0).max(1).default(0),
});

type FormInput = z.infer<typeof schema>;

export function NewClientPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: tms } = useTrafficManagers();
  const createClient = useCreateClient();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      country: 'Algérie',
      sourceCurrency: 'USD',
      exchangeRate: 250,
      discountPercentage: 0,
      maxSubAccounts: 5,
      sandboxMode: true,
    },
  });

  const sandboxMode = watch('sandboxMode');

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      const result = await createClient.mutateAsync({
        ownerEmail: data.ownerEmail,
        ownerPassword: data.ownerPassword,
        ownerFullName: data.ownerFullName,
        orgName: data.orgName,
        legalName: data.legalName || undefined,
        nif: data.nif || undefined,
        nis: data.nis || undefined,
        rc: data.rc || undefined,
        vatId: data.vatId || undefined,
        address: data.address || undefined,
        wilaya: data.wilaya || undefined,
        country: data.country,
        phone: data.phone || undefined,
        email: data.email || undefined,
        assignedTmId: data.assignedTmId || undefined,
        maxSubAccounts: data.maxSubAccounts,
        sandboxMode: data.sandboxMode,
        sourceCurrency: data.sourceCurrency,
        exchangeRate: data.exchangeRate,
        discountPercentage: data.discountPercentage,
      });
      toast.show({
        variant: 'success',
        title: 'Client créé',
        message: `${data.orgName} ajouté avec succès`,
      });
      navigate(`/admin/clients/${result.organizationId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setServerError(msg);
      toast.show({ variant: 'error', title: 'Échec création', message: msg });
    }
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/clients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Nouveau client</h1>
          <p className="text-sm text-textSecondary">
            Création d&apos;une organisation + son utilisateur propriétaire
          </p>
        </div>
      </div>

      {serverError && (
        <Alert variant="error" title="Erreur de création">
          {serverError}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {/* SECTION 1 — Compte propriétaire */}
        <Card>
          <CardHeader>
            <CardTitle>Compte propriétaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerFullName">Nom complet *</Label>
                <Input
                  id="ownerFullName"
                  placeholder="Jean Dupont"
                  error={errors.ownerFullName?.message}
                  {...register('ownerFullName')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Email *</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  autoComplete="off"
                  placeholder="contact@client.com"
                  error={errors.ownerEmail?.message}
                  {...register('ownerEmail')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerPassword">Mot de passe *</Label>
              <div className="relative">
                <Input
                  id="ownerPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min 12 caractères"
                  className="pr-10"
                  error={errors.ownerPassword?.message}
                  {...register('ownerPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-textSecondary hover:text-textPrimary"
                  aria-label={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-textSecondary">
                Minimum 12 caractères avec majuscule, minuscule, chiffre et caractère spécial.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2 — Organisation */}
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nom commercial *</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Corp"
                  error={errors.orgName?.message}
                  {...register('orgName')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legalName">Raison sociale</Label>
                <Input
                  id="legalName"
                  placeholder="Acme SARL"
                  error={errors.legalName?.message}
                  {...register('legalName')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="nif">NIF (15 chiffres)</Label>
                <Input
                  id="nif"
                  placeholder="000000000000000"
                  error={errors.nif?.message}
                  {...register('nif')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nis">NIS (15 chiffres)</Label>
                <Input
                  id="nis"
                  placeholder="000000000000000"
                  error={errors.nis?.message}
                  {...register('nis')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rc">Registre Commerce</Label>
                <Input id="rc" placeholder="RC..." error={errors.rc?.message} {...register('rc')} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vatId">VAT-ID (UE — si applicable)</Label>
                <Input id="vatId" placeholder="FR12345678901" {...register('vatId')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" type="tel" placeholder="+213..." {...register('phone')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email org (différent du owner)</Label>
              <Input id="email" type="email" placeholder="contact@acme.com" {...register('email')} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wilaya">Wilaya</Label>
                <Select id="wilaya" {...register('wilaya')}>
                  <option value="">Sélectionner...</option>
                  {ALGERIAN_WILAYAS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
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
              <Textarea
                id="address"
                rows={2}
                placeholder="Rue, ville, code postal..."
                {...register('address')}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3 — Configuration */}
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
                <Label htmlFor="sandbox-toggle" className="text-sm">
                  Mode sandbox
                </Label>
                <p className="text-xs text-textSecondary">
                  Le client est en test — pas de facturation réelle.
                </p>
              </div>
              <Switch
                id="sandbox-toggle"
                checked={sandboxMode}
                onCheckedChange={(v) => setValue('sandboxMode', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4 — Financier */}
        <Card>
          <CardHeader>
            <CardTitle>Paramètres financiers initiaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="sourceCurrency">Devise source</Label>
                <Select id="sourceCurrency" {...register('sourceCurrency')}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exchangeRate">Taux → DZD</Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  {...register('exchangeRate')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountPercentage">Remise (0 à 1)</Label>
                <Input
                  id="discountPercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="0.10 = 10%"
                  {...register('discountPercentage')}
                />
              </div>
            </div>
            <p className="text-xs text-textSecondary">
              Ces paramètres pourront être modifiés depuis l&apos;onglet Financier du client.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" type="button" onClick={() => navigate('/admin/clients')}>
            Annuler
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Créer le client
          </Button>
        </div>
      </form>
    </div>
  );
}
