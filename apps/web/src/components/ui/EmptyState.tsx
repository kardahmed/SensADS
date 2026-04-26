import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 p-12 text-center', className)}>
      <div className="rounded-full bg-card p-4 text-textSecondary">
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <h3 className="text-lg font-semibold text-textPrimary">{title}</h3>
      {description && <p className="max-w-sm text-sm text-textSecondary">{description}</p>}
      {action}
    </div>
  );
}
