/**
 * Toast — système de notifications minimaliste.
 *
 * Pas de lib externe — implémentation maison via Context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-success/10 border-success/30 text-success',
  error: 'bg-error/10 border-error/30 text-error',
  warning: 'bg-warning/10 border-warning/30 text-warning',
  info: 'bg-accent/10 border-accent/30 text-accent',
};

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback<ToastContextValue['show']>((toast) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex w-80 items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
                variantStyles[toast.variant],
              )}
              role="alert"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-textPrimary">{toast.title}</p>
                {toast.message && <p className="mt-0.5 text-textSecondary">{toast.message}</p>}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="text-textSecondary hover:text-textPrimary"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
