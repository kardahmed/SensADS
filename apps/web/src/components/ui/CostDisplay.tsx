/**
 * CostDisplay — Affichage d'un coût avec respect de la préférence DZD/USD/Both.
 *
 * À utiliser PARTOUT dans l'UI où on affiche un montant en lien avec un coût
 * (spend, CPM, CPC, CPA, budget consommé, etc.). À NE PAS confondre avec
 * `formatAmount()` qui reste utilisé pour les montants à devise fixe (ex : facture en DZD obligatoire).
 *
 * Exige toujours les deux valeurs (DZD + USD) même si une seule sera affichée :
 * - Les deux sont stockées en DB via les snapshots (pas de calcul live).
 * - Si l'utilisateur passe de "DZD" à "USD" en mode Both, on a déjà la valeur sous la main.
 *
 * @example
 *   <CostDisplay amountDzd={126.57} amountUsd={0.4868} />
 *   // mode DZD  → "126,57 DZD"
 *   // mode USD  → "0,49 USD"
 *   // mode BOTH → "126,57 DZD · 0,49 USD"
 */

import { formatAmount } from '@sensads/core';
import { useTranslation } from 'react-i18next';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { cn } from '@/lib/cn';

interface CostDisplayProps {
  amountDzd: number | null | undefined;
  amountUsd: number | null | undefined;
  /** Précision DZD (default 2) */
  decimalsDzd?: number;
  /** Précision USD (default 4 pour les petites valeurs CPM/CPC) */
  decimalsUsd?: number;
  /** Style compact pour les tableaux */
  compact?: boolean;
  className?: string;
}

export function CostDisplay({
  amountDzd,
  amountUsd,
  decimalsDzd = 2,
  decimalsUsd = 4,
  compact = false,
  className,
}: CostDisplayProps): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { mode } = useDisplayCurrency();

  const formattedDzd = formatAmount(amountDzd ?? 0, lang, 'DZD', {
    minDecimals: decimalsDzd,
    maxDecimals: decimalsDzd,
  });

  const formattedUsd = formatAmount(amountUsd ?? 0, lang, 'USD', {
    minDecimals: Math.min(decimalsUsd, 2),
    maxDecimals: decimalsUsd,
  });

  if (mode === 'DZD') {
    return <span className={cn('tabular-nums', className)}>{formattedDzd}</span>;
  }

  if (mode === 'USD') {
    return <span className={cn('tabular-nums', className)}>{formattedUsd}</span>;
  }

  // BOTH
  if (compact) {
    return (
      <span className={cn('tabular-nums', className)}>
        {formattedDzd}
        <span className="mx-1 text-textSecondary">·</span>
        <span className="text-xs text-textSecondary">{formattedUsd}</span>
      </span>
    );
  }

  return (
    <span className={cn('tabular-nums', className)}>
      <span>{formattedDzd}</span>
      <span className="mx-1 text-textSecondary">·</span>
      <span className="text-textSecondary">{formattedUsd}</span>
    </span>
  );
}

/**
 * Toggle DZD/USD/Both pour le header global.
 */
interface CurrencyToggleProps {
  className?: string;
}

export function CurrencyToggle({ className }: CurrencyToggleProps): JSX.Element {
  const { mode, setMode } = useDisplayCurrency();

  const next = mode === 'DZD' ? 'USD' : mode === 'USD' ? 'BOTH' : 'DZD';
  const label = mode === 'BOTH' ? 'DZD+USD' : mode;

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      title={`Devise affichage : ${mode}. Cliquer pour passer à ${next}`}
      className={cn(
        'rounded-md border border-border bg-card px-2 py-1 text-xs font-bold tabular-nums text-textPrimary transition-colors hover:bg-background/40',
        className,
      )}
    >
      {label}
    </button>
  );
}
