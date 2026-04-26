/**
 * ErrorBoundary — capture les erreurs React et les persiste dans error_logs.
 *
 * Affiche une page user-friendly au lieu d'un écran blanc.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '@/lib/error-logger';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    void logError(error, {
      level: 'fatal',
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md text-center space-y-6">
          <Logo size={64} showText={false} className="justify-center" />
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">Quelque chose s&apos;est mal passé</h1>
            <p className="mt-2 text-sm text-textSecondary">
              Une erreur inattendue s&apos;est produite. Notre équipe a été notifiée.
            </p>
          </div>
          {this.state.error && import.meta.env.DEV && (
            <pre className="rounded-lg border border-border bg-card p-4 text-left text-xs text-error overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={() => window.location.reload()}>Recharger</Button>
            <Button variant="outline" onClick={this.reset}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
