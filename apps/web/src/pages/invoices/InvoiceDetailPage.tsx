import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, CreditCard } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';
import { dbCampaignToCampaign, formatAmount, formatDate, formatDateTime, formatPercentage, type Campaign } from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useInvoice, useMarkInvoicePaid, useValidateInvoice } from '@/hooks/useInvoices';
import { useOrganization } from '@/hooks/useOrganizations';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { InvoicePDF } from '@/pdfs/InvoicePDF';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function InvoiceDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { isAdmin, isStaff } = useAuth();
  const toast = useToast();

  const { data: invoice, isLoading, error } = useInvoice(id);
  const { data: org } = useOrganization(invoice?.organizationId);
  const { data: appSettings } = useAppSettings();
  const validate = useValidateInvoice();
  const markPaid = useMarkInvoicePaid();

  const { data: campaign } = useQuery({
    queryKey: ['campaign-for-invoice', invoice?.campaignId],
    enabled: !!invoice?.campaignId,
    queryFn: async (): Promise<Campaign | null> => {
      if (!invoice?.campaignId) return null;
      const { data, error: err } = await supabase.from('campaigns').select('*').eq('id', invoice.campaignId).single();
      if (err) return null;
      return dbCampaignToCampaign(data as never);
    },
  });

  const [paidOpen, setPaidOpen] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');

  const baseRoute = isStaff ? '/admin/invoices' : '/client/invoices';

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !invoice) {
    return <Alert variant="error" title="Facture introuvable">{error instanceof Error ? error.message : 'Facture inexistante'}</Alert>;
  }

  const handleValidate = async () => {
    try {
      await validate.mutateAsync({ id: invoice.id });
      toast.show({ variant: 'success', title: 'Facture validée' });
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync({ id: invoice.id, paymentReference: paymentRef || undefined });
      toast.show({ variant: 'success', title: 'Facture marquée payée' });
      setPaidOpen(false);
      setPaymentRef('');
    } catch (err) {
      toast.show({ variant: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Inconnu' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-textPrimary">{invoice.number}</h1>
              <StatusBadge status={invoice.status} type="invoice" language={lang} />
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {org?.name ?? '—'} · Créée le {formatDate(invoice.createdAt, lang)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-textSecondary">Total TTC</p>
          <p className="text-2xl font-bold tabular-nums text-textPrimary">{formatAmount(invoice.totalDzd, lang)}</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          {isAdmin && invoice.status === 'draft' && (
            <Button onClick={handleValidate} isLoading={validate.isPending}>
              <CheckCircle2 className="h-4 w-4" />Valider
            </Button>
          )}
          {isAdmin && ['validated', 'sent', 'overdue'].includes(invoice.status) && (
            <Button onClick={() => setPaidOpen(true)}>
              <CreditCard className="h-4 w-4" />Marquer payée
            </Button>
          )}
          {invoice.status === 'pending_review' && (
            <Alert variant="warning">
              Facture sous le seuil minimum ({formatAmount(appSettings?.invoiceMinimumAmountDzd ?? 1000, lang)}) — revue manuelle requise.
            </Alert>
          )}
          {org && appSettings && (
            <PDFDownloadLink
              document={
                <InvoicePDF
                  invoice={invoice}
                  organization={org}
                  campaign={campaign ?? null}
                  agency={{
                    agency_name: appSettings.agencyName,
                    agency_address: appSettings.agencyAddress,
                    agency_nif: appSettings.agencyNif,
                    agency_vat_id: appSettings.agencyVatId,
                  }}
                  language={lang}
                />
              }
              fileName={`${invoice.number}.pdf`}
            >
              {({ loading }) => (
                <Button variant="outline" disabled={loading}>
                  <Download className="h-4 w-4" />{loading ? 'Génération...' : 'Télécharger PDF'}
                </Button>
              )}
            </PDFDownloadLink>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Récapitulatif</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-textSecondary">Sous-total HT</span><span className="tabular-nums">{formatAmount(invoice.subtotalDzd, lang)}</span></div>
            <div className="flex justify-between"><span className="text-textSecondary">TVA ({formatPercentage(invoice.vatRate, lang)})</span><span className="tabular-nums">+ {formatAmount(invoice.vatAmountDzd, lang)}</span></div>
            {invoice.adjustmentAmountDzd !== 0 && (
              <div className="flex justify-between text-warning">
                <span>Ajustement{invoice.adjustmentReason ? ` (${invoice.adjustmentReason})` : ''}</span>
                <span className="tabular-nums">{formatAmount(invoice.adjustmentAmountDzd, lang)}</span>
              </div>
            )}
            {invoice.currencyTranslationGainLossDzd !== 0 && (
              <div className="flex justify-between"><span className="text-textSecondary">Différentiel taux de change</span><span className="tabular-nums">{formatAmount(invoice.currencyTranslationGainLossDzd, lang)}</span></div>
            )}
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-textPrimary">Total TTC</span>
                <span className="text-lg font-bold tabular-nums">{formatAmount(invoice.totalDzd, lang)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Liens</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {campaign && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`${isStaff ? '/admin' : '/client'}/campaigns/${campaign.id}`)}>
                  Voir la campagne
                </Button>
              )}
              {invoice.poId && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`${isStaff ? '/admin' : '/client'}/purchase-orders/${invoice.poId}`)}>
                  Voir le BDC
                </Button>
              )}
              {org && isStaff && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/admin/clients/${org.id}`)}>
                  Voir le client
                </Button>
              )}
            </CardContent>
          </Card>

          {invoice.paidAt && (
            <Card>
              <CardHeader><CardTitle>Paiement</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <p>Payée le {formatDateTime(invoice.paidAt, lang)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={paidOpen} onClose={() => setPaidOpen(false)} title="Marquer la facture payée">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="paymentRef">Référence de paiement (optionnel)</Label>
            <Input id="paymentRef" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Ex: VIR-2026-001" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)}>Annuler</Button>
            <Button onClick={handleMarkPaid} isLoading={markPaid.isPending}>Confirmer</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
