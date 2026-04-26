import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface AccordionItemProps {
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionItem({
  title,
  badge,
  defaultOpen = false,
  children,
}: AccordionItemProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-background/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-textSecondary transition-transform',
              open && 'rotate-180',
            )}
          />
          <div className="flex-1 min-w-0">{title}</div>
          {badge}
        </div>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

export function Accordion({ children }: { children: ReactNode }): JSX.Element {
  return <div className="space-y-2">{children}</div>;
}
