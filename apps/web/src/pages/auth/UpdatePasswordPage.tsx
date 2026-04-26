/**
 * UpdatePasswordPage — Page pour reset password (callback link).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';

const schema = z
  .object({
    password: z.string().min(12, 'Min 12 caractères')
      .regex(/[A-Z]/, '1 majuscule requise')
      .regex(/[a-z]/, '1 minuscule requise')
      .regex(/\d/, '1 chiffre requis')
      .regex(/[^\w]/, '1 caractère spécial requis'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  });

type Input_ = z.infer<typeof schema>;

export function UpdatePasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Input_>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: data.password });
    if (err) {
      setError(err.message);
      return;
    }
    toast.show({ variant: 'success', title: 'Mot de passe mis à jour' });
    navigate('/');
  });

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Choisis un mot de passe fort">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="space-y-2">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmer</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirm?.message}
            {...register('confirm')}
          />
        </div>
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Mettre à jour
        </Button>
      </form>
    </AuthLayout>
  );
}
