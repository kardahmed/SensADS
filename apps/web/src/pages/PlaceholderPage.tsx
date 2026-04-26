/**
 * PlaceholderPage — Stub pour pages non encore implémentées.
 * Sert temporairement avant que chaque écran soit construit (ROADMAP S2+).
 */

import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
  title: string;
  phase?: string;
}

export function PlaceholderPage({ title, phase }: Props): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Construction className="h-8 w-8" />}
        title={title}
        description={
          phase
            ? `Cette page sera implémentée en ${phase}. Voir ROADMAP.md.`
            : 'Cette page sera implémentée prochainement. Voir ROADMAP.md.'
        }
      />
    </div>
  );
}
