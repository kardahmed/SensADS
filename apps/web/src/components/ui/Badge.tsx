import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'violet';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-accent/10 text-accent border-accent/20',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-error/10 text-error border-error/20',
  info: 'bg-accent/10 text-accent border-accent/20',
  neutral: 'bg-textSecondary/10 text-textSecondary border-border',
  violet: 'bg-violet/10 text-violet border-violet/20',
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
