/**
 * /account — Page profil utilisateur.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { User, Mail, Shield, Languages } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { setLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const profileSchema = z.object({
  fullName: z.string().min(2).max(200),
  preferredLanguage: z.enum(['fr', 'en']),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z
      .string()
      .min(12, 'Min 12 caractères')
      .regex(/[A-Z]/, '1 majuscule')
      .regex(/[a-z]/, '1 minuscule')
      .regex(/\d/, '1 chiffre')
      .regex(/[^\w]/, '1 caractère spécial'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  });

export function AccountPage(): JSX.Element {
  const { t } = useTranslation();
  const { profile, refresh } = useAuth();
  const toast = useToast();
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const {
    register: regProfile,
    handleSubmit: submitProfile,
    formState: { errors: profileErrors },
  } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.fullName ?? '',
      preferredLanguage: profile?.preferredLanguage ?? 'fr',
    },
  });

  const {
    register: regPwd,
    handleSubmit: submitPwd,
    formState: { errors: pwdErrors },
    reset: resetPwd,
  } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const onSaveProfile = submitProfile(async (data) => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.fullName, preferred_language: data.preferredLanguage })
        .eq('id', profile.id);
      if (error) throw error;
      setLanguage(data.preferredLanguage);
      toast.show({ variant: 'success', title: 'Profil mis à jour' });
      await refresh();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setSavingProfile(false);
    }
  });

  const onChangePassword = submitPwd(async (data) => {
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) throw error;
      toast.show({ variant: 'success', title: 'Mot de passe modifié' });
      resetPwd();
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    } finally {
      setSavingPassword(false);
    }
  });

  if (!profile) return <div />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Mon profil</h1>
        <p className="mt-1 text-sm text-textSecondary">Gère tes informations personnelles et ton mot de passe.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nom complet</Label>
                <Input id="fullName" error={profileErrors.fullName?.message} {...regProfile('fullName')} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 text-textSecondary" />
                  <span>{profile.email}</span>
                  <Badge variant="neutral" className="ml-auto">Non modifiable</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lang">Langue préférée</Label>
              <Select id="lang" {...regProfile('preferredLanguage')}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-background/30 p-3">
              <User className="h-4 w-4 text-textSecondary" />
              <span className="text-sm">Rôle :</span>
              <Badge variant="default">{profile.role}</Badge>
            </div>

            <div className="flex justify-end">
              <Button type="submit" isLoading={savingProfile}>
                <Languages className="h-4 w-4" />Enregistrer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" error={pwdErrors.currentPassword?.message} {...regPwd('currentPassword')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" error={pwdErrors.newPassword?.message} {...regPwd('newPassword')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmer</Label>
              <Input id="confirm" type="password" autoComplete="new-password" error={pwdErrors.confirm?.message} {...regPwd('confirm')} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" isLoading={savingPassword}>
                <Shield className="h-4 w-4" />Changer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="hidden">{t('common.save')}</div>
    </div>
  );
}
