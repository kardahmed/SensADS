import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatAmount, formatDate, formatDateTime } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useCancelPurchaseOrder, useMarkPoPaid, usePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { useOrganization } from '@/hooks/useOrganizations';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';

export function PurchaseOrderDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isAdmin, isSuperAdmin, isStaff } = useAuth();
  const toast = useToast();

  const { data: po, isLoading, error } = usePurchaseOrder(id);
  const { data: org } = useOrganization(po?.organizationId);
  const cancel = useCancelPurchaseOrder();
  const markPaid = useMarkPoPaid();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const baseRoute = isStaff ? '/admin/purchase-orders' : '/client/purchase-orders';

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !po) {
    return (
      <Alert variant="error" title="BDC introuvable">
        {error instanceof Error ? error.message : 'Ce BDC n\'existe pas.'}
      </Alert>
    );
  }

  const handleCancel = async () => {
    if (cancelReason.trim().length < 5) {
      toast.show({ variant: 'error', title: 'Motif obligatoire (min 5 caractères)' });
      return;
    }
    try {
      await cancel.mutateAsync({ id: po.id, reason: cancelReason });
      toast.show({ variant: 'success', title: 'BDC annulé' });
      setCancelOpen(false);
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const handleMarkPaid = async () => {
    if (!confirm('Marquer ce BDC comme payé ?')) return;
    try {
      await markPaid.mutateAsync({ id: po.id });
      toast.show({ variant: 'success', title: 'BDC marqué payé' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const consumedRatio = po.amountTtcDzd > 0 ? po.consumedAmountDzd / po.amountTtcDzd : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-textPrimary">{po.number}</h1>
              <StatusBadge status={po.status} type="purchase_order" language={lang} />
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {org?.name ?? '—'} · Créé le {formatDate(po.createdAt, lang)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-textSecondary">Montant TTC</p>
          <p className="text-2xl font-bold tabular-nums text-textPrimary">{formatAmount(po.amountTtcDzd, lang)}</p>
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          {po.status === 'active' && isAdmin && (
            <Button onClick={handleMarkPaid}>
              <CheckCircle2 className="h-4 w-4" />
              Marquer payé
            </Button>
          )}
          {isSuperAdmin && !['cancelled', 'paid'].includes(po.status) && (
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" />
              Annuler (avec avoir)
            </Button>
          )}
          {po.fileUrl && (
            <a href={po.fileUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <FileText className="h-4 w-4" />
                Voir le document
              </Button>
            </a>
          )}
          {po.quoteId && (
            <Button variant="outline" onClick={() => navigate(`${isStaff ? '/admin' : '/client'}/quotes/${po.quoteId}`)}>
              Voir le devis source
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consommation du budget</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-textSecondary">Montant total TTC</span>
              <span className="tabular-nums font-medium">{formatAmount(po.amountTtcDzd, lang)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-textSecondary">Consommé par campagnes</span>
              <span className="tabular-nums font-medium">{formatAmount(po.consumedAmountDzd, lang)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="font-semibold text-textPrimary">Restant</span>
              <span className="tabular-nums text-lg font-bold">{formatAmount(po.remainingAmountDzd, lang)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-border">
              <div
                className={`h-full transition-all ${
                  consumedRatio > 0.9 ? 'bg-error' : consumedRatio > 0.7 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(100, consumedRatio * 100)}%` }}
              />
            </div>
            <p className="text-xs text-textSecondary">
              {Math.round(consumedRatio * 100)}% consommé
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {org && (
            <Card>
              <CardHeader>
                <CardTitle>Client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-textSecondary" />
                  <span className="font-medium text-textPrimary">{org.name}</span>
                </div>
                {org.nif && <p className="text-xs text-textSecondary pl-6">NIF : {org.nif}</p>}
                {isStaff && (
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => navigate(`/admin/clients/${org.id}`)}>
                    Voir le client
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {po.cancellationReason && (
            <Card>
              <CardHeader>
                <CardTitle>Annulation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p><span className="text-textSecondary">Date :</span> {po.cancelledAt ? formatDateTime(po.cancelledAt, lang) : '—'}</p>
                <p><span className="text-textSecondary">Motif :</span></p>
                <p className="rounded-md border border-error/30 bg-error/5 p-2 text-xs text-error">{po.cancellationReason}</p>
              </CardContent>
            </Card>
          )}

          {po.paidAt && (
            <Card>
              <CardHeader>
                <CardTitle>Paiement</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>Payé le {formatDateTime(po.paidAt, lang)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Annuler le BDC" description="Crée automatiquement un avoir (credit note)">
        <div className="space-y-3">
          <Alert variant="warning">
            ⚠ Cette action est irréversible. Un avoir sera créé pour le montant restant.
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="cancelReason">Motif obligatoire (min 5 caractères)</Label>
            <Textarea
              id="cancelReason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Annuler</Button>
            <Button variant="danger" onClick={handleCancel} isLoading={cancel.isPending}>
              Confirmer l&apos;annulation
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
