import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'flex h-10 w-full appearance-none rounded-lg border bg-background/50 px-3 pr-9 py-2 text-sm',
            'text-textPrimary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-error' : 'border-border',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  ),
);
Select.displayName = 'Select';
