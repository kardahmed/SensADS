/**
 * QuoteActions — Boutons d'action selon le statut du devis × rôle utilisateur.
 *
 * Workflow :
 *   draft → submitted → approved → accepted → converted
 *                     ↓
 *                  rejected / cancelled / expired
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  ArrowRightLeft,
  Trash2,
  Pencil,
} from 'lucide-react';
import type { Quote, UserRole } from '@sensads/core';
import { useUpdateQuoteStatus } from '@/hooks/useQuotes';
import { useCreatePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';

interface Props {
  quote: Quote;
  currentUserId: string;
  role: UserRole;
}

export function QuoteActions({ quote, currentUserId, role }: Props): JSX.Element {
  const navigate = useNavigate();
  const update = useUpdateQuoteStatus();
  const createPo = useCreatePurchaseOrder();
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isStaff = ['super_admin', 'admin', 'traffic_manager'].includes(role);
  const isAdmin = ['super_admin', 'admin'].includes(role);
  const isClientOwner = role === 'client_owner';
  const isCreator = quote.createdBy === currentUserId;
  const baseRoute = isStaff ? '/admin/quotes' : '/client/quotes';

  const transition = async (
    newStatus: Quote['status'],
    successMessage: string,
    reason?: string,
  ) => {
    try {
      await update.mutateAsync({ id: quote.id, newStatus, reason });
      toast.show({ variant: 'success', title: successMessage });
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 5) {
      toast.show({ variant: 'error', title: 'Motif obligatoire (min 5 caractères)' });
      return;
    }
    await transition('rejected', 'Devis rejeté', rejectReason);
    setRejectOpen(false);
    setRejectReason('');
  };

  const handleConvert = async () => {
    if (!confirm(`Convertir ce devis en BDC pour ${quote.totalDzd.toLocaleString('fr-DZ')} DZD ?`)) return;
    try {
      const po = await createPo.mutateAsync({
        organizationId: quote.organizationId,
        quoteId: quote.id,
        amountTtcDzd: quote.totalDzd,
      });
      toast.show({ variant: 'success', title: 'BDC créé', message: `${po.number}` });
      const baseRoute = isStaff ? '/admin/purchase-orders' : '/client/purchase-orders';
      navigate(`${baseRoute}/${po.id}`);
    } catch (err) {
      toast.show({
        variant: 'error',
        title: 'Erreur conversion',
        message: err instanceof Error ? err.message : 'Inconnu',
      });
    }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler ce devis ? Action irréversible.')) return;
    await transition('cancelled', 'Devis annulé');
  };

  const buttons: JSX.Element[] = [];

  // ============================================
  // DRAFT : modifier, soumettre, annuler
  // ============================================
  if (quote.status === 'draft' && (isCreator || isStaff)) {
    buttons.push(
      <Button
        key="edit"
        variant="outline"
        onClick={() => navigate(`${baseRoute}/${quote.id}/edit`)}
      >
        <Pencil className="h-4 w-4" />
        Modifier
      </Button>,
      <Button key="submit" onClick={() => transition('submitted', 'Devis soumis pour validation')}>
        <Send className="h-4 w-4" />
        Soumettre
      </Button>,
      <Button key="cancel" variant="outline" onClick={handleCancel}>
        <Trash2 className="h-4 w-4" />
        Annuler
      </Button>,
    );
  }

  // ============================================
  // SUBMITTED : staff approuve/rejette
  // ============================================
  if (quote.status === 'submitted' && isStaff) {
    buttons.push(
      <Button key="approve" onClick={() => transition('approved', 'Devis approuvé')}>
        <CheckCircle2 className="h-4 w-4" />
        Approuver
      </Button>,
      <Button key="reject" variant="danger" onClick={() => setRejectOpen(true)}>
        <XCircle className="h-4 w-4" />
        Rejeter
      </Button>,
    );
  }

  // SUBMITTED : creator client peut retirer
  if (quote.status === 'submitted' && isCreator && !isStaff) {
    buttons.push(
      <Button
        key="withdraw"
        variant="outline"
        onClick={() => transition('draft', 'Devis remis en brouillon')}
      >
        Retirer (revenir en brouillon)
      </Button>,
    );
  }

  // ============================================
  // APPROVED : client_owner accepte
  // ============================================
  if (quote.status === 'approved' && isClientOwner) {
    buttons.push(
      <Button key="accept" onClick={() => transition('accepted', 'Devis accepté')}>
        <ThumbsUp className="h-4 w-4" />
        Accepter
      </Button>,
    );
  }

  // ============================================
  // ACCEPTED : staff convertit en BDC
  // ============================================
  if (quote.status === 'accepted' && isStaff) {
    buttons.push(
      <Button key="convert" onClick={handleConvert}>
        <ArrowRightLeft className="h-4 w-4" />
        Convertir en BDC
      </Button>,
    );
  }

  // ============================================
  // SUPER ADMIN : peut annuler n'importe quand
  // ============================================
  if (
    role === 'super_admin' &&
    !['cancelled', 'rejected', 'converted'].includes(quote.status)
  ) {
    if (!buttons.find((b) => b.key === 'cancel')) {
      buttons.push(
        <Button key="cancel-admin" variant="outline" onClick={handleCancel}>
          <Trash2 className="h-4 w-4" />
          Annuler (admin)
        </Button>,
      );
    }
  }

  if (buttons.length === 0) {
    return (
      <div className="text-sm text-textSecondary italic">
        Aucune action disponible pour ce statut et ton rôle.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">{buttons}</div>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Motif du rejet"
        description="Le client verra ce motif"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Motif (min 5 caractères)</Label>
            <Textarea
              id="rejectReason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: tarifs hors enveloppe budgétaire..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handleReject} isLoading={update.isPending}>
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </>
  );
}
