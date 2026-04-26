/**
 * error-logger.ts — Capture les erreurs frontend dans la table error_logs.
 *
 * Remplace Sentry — zero dépendance externe.
 */

import { env } from './env';
import { supabase } from './supabase';

export interface ErrorContext {
  componentStack?: string;
  level?: 'warn' | 'error' | 'fatal';
  metadata?: Record<string, unknown>;
}

export async function logError(error: Error | unknown, ctx: ErrorContext = {}): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    await supabase.from('error_logs').insert({
      message: err.message.slice(0, 1000),
      stack: err.stack?.slice(0, 5000) ?? null,
      component_stack: ctx.componentStack?.slice(0, 5000) ?? null,
      url: window.location.href,
      user_agent: navigator.userAgent,
      app_version: env.VITE_APP_VERSION,
      environment: env.VITE_APP_ENV,
      level: ctx.level ?? 'error',
      metadata: ctx.metadata ?? {},
    });
  } catch {
    // Best effort : si Supabase down, on ignore (pas de boucle infinie)
  }
}

/** Init listeners globaux pour erreurs non-catchées et rejections de promesses. */
export function initGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    void logError(event.error ?? event.message, { level: 'error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    void logError(event.reason, { level: 'error', metadata: { type: 'unhandledRejection' } });
  });
}
