import { categorizeMargin, formatPercentage } from '@sensads/core';
import { Badge } from './Badge';

interface MarginBadgeProps {
  margin: number;
  language?: 'fr' | 'en';
}

export function MarginBadge({ margin, language = 'fr' }: MarginBadgeProps): JSX.Element {
  const cat = categorizeMargin(margin);
  const variant =
    cat === 'high' ? 'success' :
    cat === 'medium' ? 'warning' :
    cat === 'low' ? 'warning' :
    'error';

  return (
    <Badge variant={variant}>
      {formatPercentage(margin, language)}
    </Badge>
  );
}
