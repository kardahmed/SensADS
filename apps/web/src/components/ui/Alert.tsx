import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  info: 'bg-accent/10 border-accent/30 text-accent',
  success: 'bg-success/10 border-success/30 text-success',
  warning: 'bg-warning/10 border-warning/30 text-warning',
  error: 'bg-error/10 border-error/30 text-error',
};

export function Alert({ variant = 'info', title, children, className, ...props }: AlertProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn('rounded-lg border p-4 text-sm', variantClasses[variant], className)}
      {...props}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
