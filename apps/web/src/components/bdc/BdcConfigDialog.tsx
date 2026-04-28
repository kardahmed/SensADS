/**
 * BdcConfigDialog — Dialog de saisie de la configuration financière à la création d'un BDC.
 *
 * Affiche un simulateur live de la marge à droite. Une fois validé, parallel_rate et fees_pct
 * seront 🔒 verrouillés pour la durée de vie du BDC. Seul le divisor reste 🔓 modifiable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lock, Unlock } from 'lucide-react';
import {
  cashMarginDzd,
  executableBudgetUsd,
  formatAmount,
  formatPercentage,
  totalMarkup,
  type BdcFinancialConfig,
} from '@sensads/core';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useAppSettings } from '@/hooks/useAppSettings';

export interface BdcConfigValues {
  parallelRate: number;
  feesPct: number;
  divisor: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (values: BdcConfigValues) => void | Promise<void>;
  amountDzd: number;
  title?: string;
  isSubmitting?: boolean;
  /** Config par défaut (priorité : organization > app_settings > hardcoded) */
  defaults?: Partial<BdcConfigValues>;
}

const HARDCODED_DEFAULTS: BdcConfigValues = {
  parallelRate: 260,
  feesPct: 0.06,
  divisor: 2.6,
};

export function BdcConfigDialog({
  open,
  onClose,
  onConfirm,
  amountDzd,
  title = 'Configuration financière du BDC',
  isSubmitting,
  defaults,
}: Props): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const settings = useAppSettings();

  const initial: BdcConfigValues = useMemo(
    () => ({
      parallelRate:
        defaults?.parallelRate ?? Number((settings.data as unknown as { defaultParallelRate?: number } | null)?.defaultParallelRate) ?? HARDCODED_DEFAULTS.parallelRate,
      feesPct:
        defaults?.feesPct ?? Number((settings.data as unknown as { defaultTransactionFeesPct?: number } | null)?.defaultTransactionFeesPct) ?? HARDCODED_DEFAULTS.feesPct,
      divisor:
        defaults?.divisor ?? Number((settings.data as unknown as { defaultAllocationDivisor?: number } | null)?.defaultAllocationDivisor) ?? HARDCODED_DEFAULTS.divisor,
    }),
    [defaults, settings.data],
  );

  const [values, setValues] = useState<BdcConfigValues>(initial);

  useEffect(() => {
    if (open) setValues(initial);
  }, [open, initial]);

  const config: BdcFinancialConfig = {
    parallelRate: values.parallelRate || 1,
    feesPct: Math.max(0, Math.min(0.99, values.feesPct || 0)),
    divisor: Math.max(1, values.divisor || 1),
  };

  const markup = useMemo(() => {
    try {
      return totalMarkup(config);
    } catch {
      return 0;
    }
  }, [config]);

  const realUsd = useMemo(() => {
    try {
      return executableBudgetUsd(amountDzd, config);
    } catch {
      return 0;
    }
  }, [amountDzd, config]);

  const margin = useMemo(() => {
    try {
      return cashMarginDzd(amountDzd, config);
    } catch {
      return 0;
    }
  }, [amountDzd, config]);

  const marginPct = amountDzd > 0 ? margin / amountDzd : 0;
  const marginColor = marginPct >= 0.6 ? 'text-success' : marginPct >= 0.4 ? 'text-warning' : 'text-error';

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="rounded-md border border-border bg-background/30 p-3">
          <p className="text-xs uppercase tracking-wide text-textSecondary">Montant TTC du BDC</p>
          <p className="font-mono text-xl font-bold text-textPrimary">
            {formatAmount(amountDzd, lang)}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-textSecondary">
              <Lock className="h-3 w-3" /> Verrouillé après création
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="par">Cours parallèle (DZD/USD)</Label>
              <Input
                id="par"
                type="number"
                step="1"
                min="1"
                value={values.parallelRate}
                onChange={(e) => setValues((v) => ({ ...v, parallelRate: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-textSecondary">
                Taux du marché parallèle au jour de la création. Sera figé.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fee">Frais transaction (%)</Label>
              <Input
                id="fee"
                type="number"
                step="0.01"
                min="0"
                max="99"
                value={values.feesPct * 100}
                onChange={(e) =>
                  setValues((v) => ({ ...v, feesPct: (Number(e.target.value) || 0) / 100 }))
                }
              />
              <p className="text-xs text-textSecondary">
                Pourcentage retenu (par défaut 6%). Sera figé.
              </p>
            </div>

            <p className="flex items-center gap-1 pt-2 text-xs font-bold uppercase tracking-wide text-textSecondary">
              <Unlock className="h-3 w-3" /> Modifiable plus tard
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="div">Divisor</Label>
              <Input
                id="div"
                type="number"
                step="0.1"
                min="1"
                value={values.divisor}
                onChange={(e) => setValues((v) => ({ ...v, divisor: Number(e.target.value) || 1 }))}
              />
              <p className="text-xs text-textSecondary">
                Détermine la marge agence. markup = divisor / (1 - frais). Modifiable avec note.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border bg-background/30 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-textSecondary">Simulation marge</p>

            <div>
              <p className="text-xs text-textSecondary">Markup total</p>
              <p className="font-mono text-lg font-bold text-textPrimary">× {markup.toFixed(5)}</p>
            </div>

            <div>
              <p className="text-xs text-textSecondary">Real spend USD à dépenser sur Meta</p>
              <p className="font-mono text-base text-textPrimary">
                {formatAmount(realUsd, lang, 'USD', { maxDecimals: 2 })}
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wide text-textSecondary">💰 Marge prévisionnelle</p>
              <p className={`font-mono text-2xl font-bold ${marginColor}`}>
                {formatAmount(margin, lang)}
              </p>
              <p className={`text-sm ${marginColor}`}>{formatPercentage(marginPct, lang)} du dépôt</p>
              {marginPct < 0.4 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-error">
                  <AlertTriangle className="h-3 w-3" /> Marge faible — vérifie ta config.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          <p className="font-bold">Important</p>
          <p>
            Une fois ce BDC créé, le <strong>cours parallèle</strong> ({values.parallelRate}) et les{' '}
            <strong>frais</strong> ({(values.feesPct * 100).toFixed(2)}%) ne pourront <strong>plus être modifiés</strong>{' '}
            jusqu'à consommation complète du budget. Seul le <strong>divisor</strong> reste ajustable (avec note).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm(values)}
            isLoading={isSubmitting}
            disabled={values.parallelRate <= 0 || values.divisor < 1 || values.feesPct < 0 || values.feesPct >= 1}
          >
            Créer le BDC
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
