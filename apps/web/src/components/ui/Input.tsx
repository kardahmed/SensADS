import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm',
          'text-textPrimary placeholder:text-textSecondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-error focus-visible:ring-error' : 'border-border',
          className,
        )}
        aria-invalid={!!error}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  ),
);
Input.displayName = 'Input';
