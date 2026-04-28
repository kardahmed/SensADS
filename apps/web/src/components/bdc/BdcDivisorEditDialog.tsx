/**
 * BdcDivisorEditDialog — Dialog de modification du divisor d'un BDC en cours.
 *
 * Note obligatoire (min 5 chars), simulateur d'impact prévisionnel sur la marge,
 * preview des chiffres avant/après. Le client ne voit aucun changement.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Lock, Unlock } from 'lucide-react';
import {
  cashMarginDzd,
  formatAmount,
  formatPercentage,
  totalMarkup,
  type BdcFinancialConfig,
} from '@sensads/core';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { newDivisor: number; note: string; marginImpactDzd: number }) => void | Promise<void>;
  bdcNumber: string;
  amountDzd: number;
  remainingAmountDzd: number;
  parallelRateLocked: number;
  feesPctLocked: number;
  currentDivisor: number;
  isSubmitting?: boolean;
}

export function BdcDivisorEditDialog({
  open,
  onClose,
  onConfirm,
  bdcNumber,
  amountDzd,
  remainingAmountDzd,
  parallelRateLocked,
  feesPctLocked,
  currentDivisor,
  isSubmitting,
}: Props): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';

  const [newDivisor, setNewDivisor] = useState(currentDivisor);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setNewDivisor(currentDivisor);
      setNote('');
    }
  }, [open, currentDivisor]);

  // Marges avant et après (sur le budget restant uniquement, le passé étant figé via snapshots)
  const oldConfig: BdcFinancialConfig = {
    parallelRate: parallelRateLocked || 1,
    feesPct: feesPctLocked,
    divisor: currentDivisor,
  };
  const newConfig: BdcFinancialConfig = {
    parallelRate: parallelRateLocked || 1,
    feesPct: feesPctLocked,
    divisor: Math.max(1, newDivisor),
  };

  const oldMarginRemaining = useMemo(() => {
    try { return cashMarginDzd(remainingAmountDzd, oldConfig); } catch { return 0; }
  }, [remainingAmountDzd, oldConfig]);

  const newMarginRemaining = useMemo(() => {
    try { return cashMarginDzd(remainingAmountDzd, newConfig); } catch { return 0; }
  }, [remainingAmountDzd, newConfig]);

  const marginImpact = newMarginRemaining - oldMarginRemaining;

  const oldMarkup = useMemo(() => {
    try { return totalMarkup(oldConfig); } catch { return 0; }
  }, [oldConfig]);

  const newMarkup = useMemo(() => {
    try { return totalMarkup(newConfig); } catch { return 0; }
  }, [newConfig]);

  const noteValid = note.trim().length >= 5;
  const divisorValid = newDivisor >= 1 && newDivisor !== currentDivisor;
  const canSubmit = noteValid && divisorValid && !isSubmitting;

  const impactColor = marginImpact > 0 ? 'text-success' : marginImpact < 0 ? 'text-error' : 'text-textSecondary';

  return (
    <Dialog open={open} onClose={onClose} title={`Modifier le divisor du BDC ${bdcNumber}`}>
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-background/30 p-3">
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-textSecondary">
            <Lock className="h-3 w-3" /> Verrouillé (figé à la création)
          </p>
          <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-textSecondary">Cours parallèle</p>
              <p className="font-mono font-bold">{parallelRateLocked} DZD/USD</p>
            </div>
            <div>
              <p className="text-xs text-textSecondary">Frais</p>
              <p className="font-mono font-bold">{(feesPctLocked * 100).toFixed(2)}%</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-textSecondary">
              <Unlock className="h-3 w-3" /> Modification
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="div">Nouveau divisor</Label>
              <Input
                id="div"
                type="number"
                step="0.1"
                min="1"
                value={newDivisor}
                onChange={(e) => setNewDivisor(Number(e.target.value) || 1)}
              />
              <p className="text-xs text-textSecondary">
                Actuel : <span className="font-mono">{currentDivisor}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">
                Note <span className="text-xs text-textSecondary">(min 5 caractères, obligatoire)</span>
              </Label>
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: cours parallèle marché passé à 285, ajustement marge avant prochain BDC"
              />
              {note.length > 0 && note.trim().length < 5 && (
                <p className="text-xs text-error">Note trop courte (min 5 caractères).</p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border bg-background/30 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-textSecondary">Impact prévisionnel</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-textSecondary">Markup avant</p>
                <p className="font-mono font-bold">× {oldMarkup.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-textSecondary">Markup après</p>
                <p className="font-mono font-bold">× {newMarkup.toFixed(5)}</p>
              </div>
            </div>

            <div className="border-t border-border pt-2 text-xs">
              <p className="text-textSecondary">Sur le restant : {formatAmount(remainingAmountDzd, lang)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-textSecondary">Marge avant</p>
                <p className="font-mono font-bold">{formatAmount(oldMarginRemaining, lang)}</p>
              </div>
              <div>
                <p className="text-textSecondary">Marge après</p>
                <p className="font-mono font-bold">{formatAmount(newMarginRemaining, lang)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-xs text-textSecondary">Impact total</span>
              <span className={`flex items-center gap-1 font-mono font-bold ${impactColor}`}>
                <ArrowRight className="h-3 w-3" />
                {marginImpact > 0 ? '+' : ''}{formatAmount(marginImpact, lang)}
              </span>
            </div>

            <p className="text-xs italic text-textSecondary">
              Le client ne verra aucun changement. Son budget consommé final restera{' '}
              {formatAmount(amountDzd, lang)}.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            isLoading={isSubmitting}
            onClick={() =>
              void onConfirm({
                newDivisor,
                note: note.trim(),
                marginImpactDzd: marginImpact,
              })
            }
          >
            Confirmer le changement
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
