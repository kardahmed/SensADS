/**
 * Dialog — modal accessible avec overlay.
 *
 * Implémentation maison (sans Radix/Shadcn).
 * Trap focus + Escape pour fermer + click outside.
 */

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: DialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full rounded-xl border border-border bg-card shadow-xl',
          'max-h-[90vh] overflow-hidden flex flex-col',
          sizes[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border p-6">
            <div className="flex flex-col gap-1">
              {title && (
                <h2 id="dialog-title" className="text-lg font-semibold text-textPrimary">
                  {title}
                </h2>
              )}
              {description && <p className="text-sm text-textSecondary">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-textSecondary hover:bg-background hover:text-textPrimary"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function DialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex items-center justify-end gap-2 pt-4">{children}</div>;
}
