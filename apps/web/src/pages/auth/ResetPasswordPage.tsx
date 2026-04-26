import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({
  email: z.string().email('Email invalide'),
});

type Input_ = z.infer<typeof schema>;

export function ResetPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Input_>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    const result = await resetPassword(data.email);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  });

  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      {success ? (
        <div className="space-y-4">
          <Alert variant="success">{t('auth.reset.success')}</Alert>
          <Link
            to="/auth/login"
            className="flex items-center justify-center gap-2 text-sm text-accent hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('auth.reset.backToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.reset.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            {t('auth.reset.submit')}
          </Button>
          <Link
            to="/auth/login"
            className="flex items-center justify-center gap-2 text-sm text-textSecondary hover:text-textPrimary"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('auth.reset.backToLogin')}
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
