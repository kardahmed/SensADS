/**
 * /admin/quotes/:id ou /client/quotes/:id — Détail d'un devis.
 */

import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Building2, User, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatPercentage,
  getPlatform,
} from '@sensads/core';
import { useAuth } from '@/hooks/useAuth';
import { useQuote } from '@/hooks/useQuotes';
import { useOrganization } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { QuoteActions } from './QuoteActions';
import { WorkflowTimeline } from './WorkflowTimeline';

export function QuoteDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const { profile, isStaff } = useAuth();

  const { data: quote, isLoading, error } = useQuote(id);
  const { data: org } = useOrganization(quote?.organizationId);

  const baseRoute = isStaff ? '/admin/quotes' : '/client/quotes';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <Alert variant="error" title="Devis introuvable">
        {error instanceof Error ? error.message : 'Ce devis n\'existe pas ou a été supprimé.'}
      </Alert>
    );
  }

  const isExpired =
    quote.validUntil &&
    new Date(quote.validUntil) < new Date() &&
    !['accepted', 'converted', 'rejected', 'cancelled'].includes(quote.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(baseRoute)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-textPrimary">{quote.number}</h1>
              <StatusBadge status={quote.status} type="quote" language={lang} />
              {isExpired && <Badge variant="warning">Expiré</Badge>}
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {org?.name ?? '—'} · Créé le {formatDate(quote.createdAt, lang)}
              {quote.validUntil && (
                <span className={isExpired ? ' text-warning' : ''}>
                  {' '}· Valide jusqu&apos;au {formatDate(quote.validUntil, lang)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-textSecondary">Total TTC</p>
          <p className="text-2xl font-bold tabular-nums text-textPrimary">
            {formatAmount(quote.totalDzd, lang)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-4">
          {profile && (
            <QuoteActions
              quote={quote}
              currentUserId={profile.id}
              role={profile.role}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lines */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lignes du devis</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/40 text-left">
                      <th className="p-3 font-medium text-textSecondary">Plateforme</th>
                      <th className="p-3 font-medium text-textSecondary">Tarif</th>
                      <th className="p-3 text-right font-medium text-textSecondary">Qté</th>
                      <th className="p-3 text-right font-medium text-textSecondary">Prix unit. DZD</th>
                      <th className="p-3 text-right font-medium text-textSecondary">Total DZD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.lines.map((line) => {
                      const platform = line.tariff ? getPlatform(line.tariff.platform) : null;
                      return (
                        <tr key={line.id} className="border-b border-border/40 last:border-0">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
                                style={{ backgroundColor: platform?.color ?? '#9CA3AF' }}
                              >
                                {platform?.iconText ?? '?'}
                              </div>
                              <span>{platform?.name ?? line.tariff?.platform ?? '—'}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="neutral">
                              {line.tariff?.optimization_goal?.toUpperCase() ?? '—'}
                            </Badge>
                            <p className="mt-0.5 text-xs text-textSecondary">{line.tariff?.name ?? '—'}</p>
                          </td>
                          <td className="p-3 text-right tabular-nums">{line.quantity}</td>
                          <td className="p-3 text-right tabular-nums text-textSecondary">
                            {formatAmount(line.unitPriceDzd, lang)}
                          </td>
                          <td className="p-3 text-right tabular-nums font-medium text-textPrimary">
                            {formatAmount(line.totalDzd, lang)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-textPrimary">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Totals */}
          <Card>
            <CardHeader>
              <CardTitle>Récapitulatif</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-textSecondary">Sous-total HT</span>
                <span className="tabular-nums">{formatAmount(quote.subtotalDzd, lang)}</span>
              </div>
              {quote.discountAmountDzd > 0 && (
                <div className="flex justify-between text-success">
                  <span>Remise ({formatPercentage(quote.discountPercentage, lang)})</span>
                  <span className="tabular-nums">- {formatAmount(quote.discountAmountDzd, lang)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-textSecondary">
                  TVA ({formatPercentage(quote.vatRate, lang)})
                </span>
                <span className="tabular-nums">+ {formatAmount(quote.vatAmountDzd, lang)}</span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-textPrimary">Total TTC</span>
                  <span className="text-lg font-bold tabular-nums text-textPrimary">
                    {formatAmount(quote.totalDzd, lang)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client info */}
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
                {org.legalName && (
                  <p className="text-xs text-textSecondary pl-6">{org.legalName}</p>
                )}
                {org.nif && (
                  <p className="text-xs text-textSecondary pl-6">NIF : {org.nif}</p>
                )}
                {org.wilaya && (
                  <p className="text-xs text-textSecondary pl-6">{org.wilaya}, {org.country}</p>
                )}
                {isStaff && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => navigate(`/admin/clients/${org.id}`)}
                  >
                    Voir le client
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTimeline quote={quote} language={lang} />
            </CardContent>
          </Card>

          {/* Snapshot taux */}
          {Object.keys(quote.exchangeRateSnapshot ?? {}).length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Snapshot taux de change</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-textSecondary">
                  Taux figés au moment de la création (jamais recalculés).
                </p>
                <ul className="space-y-1 text-xs">
                  {Object.entries(quote.exchangeRateSnapshot).map(([currency, rate]) => (
                    <li key={currency} className="flex justify-between">
                      <span className="text-textSecondary">1 {currency} =</span>
                      <span className="tabular-nums">{rate} DZD</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="border-t border-border pt-4 text-xs text-textSecondary flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Mis à jour le {formatDateTime(quote.updatedAt, lang)}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" /> Créé par <code className="font-mono">{quote.createdBy.slice(0, 8)}</code>
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" /> ID : <code className="font-mono">{quote.id.slice(0, 8)}</code>
        </span>
      </div>
    </div>
  );
}
