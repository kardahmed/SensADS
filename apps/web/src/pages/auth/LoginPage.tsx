import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';
import { supabase } from '@/lib/supabase';

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
});

type LoginInput = z.infer<typeof loginSchema>;

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { signIn, verifyMfa, isAuthenticated } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [error, setError] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (isAuthenticated && !needsMfa) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    const result = await signIn(data);
    if (result.error) {
      const lower = result.error.toLowerCase();
      if (lower.includes('rate') || lower.includes('too many')) {
        setError(t('auth.login.rateLimited'));
      } else {
        setError(t('auth.login.loginError'));
      }
      return;
    }
    if (result.needsMfa) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp) {
        setMfaFactorId(totp.id);
        setNeedsMfa(true);
      } else {
        setError('MFA requis mais aucun facteur configuré');
      }
    }
  });

  const onSubmitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    setIsMfaSubmitting(true);
    const { error: mfaError } = await verifyMfa({ factorId: mfaFactorId, code: mfaCode });
    setIsMfaSubmitting(false);
    if (mfaError) setError(t('auth.login.totpRequired'));
  };

  if (needsMfa) {
    return (
      <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.totpRequired')}>
        <form onSubmit={onSubmitMfa} className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="totp">{t('auth.login.totp')}</Label>
            <Input
              id="totp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button type="submit" className="w-full" isLoading={isMfaSubmitting}>
            {t('auth.login.submit')}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.login.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.login.password')}</Label>
            <Link to="/auth/reset-password" className="text-xs text-accent hover:underline">
              {t('auth.login.forgotPassword')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
        </div>
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
