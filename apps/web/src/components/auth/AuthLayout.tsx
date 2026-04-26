import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4">
          <Logo size={64} showText={false} />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-textPrimary">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-textSecondary">{subtitle}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
        <p className="text-center text-xs text-textSecondary">
          SensADS by SENSIUM-X · v0.1.0
        </p>
      </div>
    </main>
  );
}
