import { Check, Clock, X } from 'lucide-react';
import { formatDateTime, type Quote } from '@sensads/core';
import { cn } from '@/lib/cn';

interface Props {
  quote: Quote;
  language: 'fr' | 'en';
}

interface Event {
  label: string;
  at: string | null;
  status: 'done' | 'pending' | 'rejected';
  description?: string;
}

export function WorkflowTimeline({ quote, language }: Props): JSX.Element {
  const events: Event[] = [
    {
      label: 'Création',
      at: quote.createdAt,
      status: 'done',
    },
    {
      label: 'Soumission',
      at: quote.submittedAt,
      status: quote.submittedAt ? 'done' : 'pending',
    },
  ];

  if (quote.status === 'rejected') {
    events.push({
      label: 'Rejet',
      at: null,
      status: 'rejected',
      description: quote.rejectedReason ?? undefined,
    });
  } else if (quote.status === 'cancelled') {
    events.push({
      label: 'Annulation',
      at: null,
      status: 'rejected',
    });
  } else {
    events.push({
      label: 'Approbation',
      at: quote.approvedAt,
      status: quote.approvedAt ? 'done' : 'pending',
    });

    events.push({
      label: 'Acceptation client',
      at: quote.acceptedAt,
      status: quote.acceptedAt ? 'done' : 'pending',
    });

    if (quote.convertedToPoId || quote.status === 'converted') {
      events.push({
        label: 'Converti en BDC',
        at: null,
        status: 'done',
      });
    }
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;
        return (
          <li key={`${event.label}-${idx}`} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2',
                event.status === 'done' &&
                  'border-success bg-success/20 text-success',
                event.status === 'pending' &&
                  'border-border bg-card text-textSecondary',
                event.status === 'rejected' && 'border-error bg-error/20 text-error',
              )}
            >
              {event.status === 'done' && <Check className="h-3 w-3" />}
              {event.status === 'pending' && <Clock className="h-3 w-3" />}
              {event.status === 'rejected' && <X className="h-3 w-3" />}
            </span>
            <div className={cn('flex flex-col gap-0.5', isLast && 'pb-2')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  event.status === 'done' && 'text-textPrimary',
                  event.status === 'pending' && 'text-textSecondary',
                  event.status === 'rejected' && 'text-error',
                )}
              >
                {event.label}
              </p>
              {event.at && (
                <p className="text-xs text-textSecondary">
                  {formatDateTime(event.at, language)}
                </p>
              )}
              {event.description && (
                <p className="mt-1 rounded-md border border-error/30 bg-error/5 p-2 text-xs text-error">
                  {event.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
