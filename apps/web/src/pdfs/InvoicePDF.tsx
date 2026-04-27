/**
 * InvoicePDF — Document facture (mode CLAIR, mentions fiscales obligatoires).
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatAmount, formatDate, formatPercentage } from '@sensads/core';
import type { Invoice, Organization, Campaign } from '@sensads/core';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#0A2540' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '2 solid #00D4FF' },
  brandName: { fontSize: 20, fontWeight: 'bold', color: '#0A2540' },
  brandTagline: { fontSize: 9, color: '#8898AA', marginTop: 2 },
  brandLine: { fontSize: 8, color: '#425466', marginTop: 4 },
  docTitle: { fontSize: 22, fontWeight: 'bold', color: '#00D4FF', textAlign: 'right' },
  docNumber: { fontSize: 12, fontFamily: 'Courier', marginTop: 4, textAlign: 'right' },
  docDate: { fontSize: 9, color: '#8898AA', marginTop: 2, textAlign: 'right' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: '#00D4FF', marginBottom: 6, letterSpacing: 1 },

  clientBlock: { backgroundColor: '#F6F9FC', padding: 12, borderRadius: 4 },
  clientName: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  clientLine: { fontSize: 9, color: '#425466', marginBottom: 2 },

  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0A2540', color: '#FFFFFF', padding: 6 },
  tableHeaderCell: { fontSize: 9, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', padding: 8, borderBottom: '1 solid #E6EBF1' },
  cell: { fontSize: 9 },
  cellLabel: { width: '60%' },
  cellAmount: { width: '40%', textAlign: 'right', fontWeight: 'bold' },

  totals: { marginLeft: 'auto', width: '50%', marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 10, color: '#425466' },
  totalValue: { fontSize: 10, fontFamily: 'Courier' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8, marginTop: 6, borderTop: '2 solid #0A2540' },
  grandTotalLabel: { fontSize: 13, fontWeight: 'bold' },
  grandTotalValue: { fontSize: 16, fontFamily: 'Courier', fontWeight: 'bold' },

  paymentBlock: { marginTop: 20, padding: 10, backgroundColor: '#F0FDF4', borderRadius: 4, border: '1 solid #10B981' },
  paymentTitle: { fontSize: 10, fontWeight: 'bold', color: '#10B981', marginBottom: 4 },
  paymentText: { fontSize: 9, color: '#065F46', lineHeight: 1.4 },

  legalBlock: { marginTop: 16, padding: 10, backgroundColor: '#F6F9FC', borderRadius: 4 },
  legalText: { fontSize: 8, color: '#425466', lineHeight: 1.4 },

  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, paddingTop: 8, borderTop: '1 solid #E6EBF1', flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#8898AA' },
});

interface AgencyData {
  agency_name: string;
  agency_address?: string | null;
  agency_nif?: string | null;
  agency_vat_id?: string | null;
  agency_email?: string | null;
  agency_phone?: string | null;
}

interface Props {
  invoice: Invoice;
  organization: Organization;
  campaign: Campaign | null;
  agency?: AgencyData;
  language?: 'fr' | 'en';
}

export function InvoicePDF({ invoice, organization, campaign, agency, language = 'fr' }: Props): JSX.Element {
  const lang = language;

  return (
    <Document title={`Facture ${invoice.number}`} author={agency?.agency_name ?? 'SENSIUM-X'}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>{agency?.agency_name ?? 'SENSIUM-X'}</Text>
            <Text style={styles.brandTagline}>Digital Traffic Management</Text>
            {agency?.agency_address && <Text style={styles.brandLine}>{agency.agency_address}</Text>}
            {agency?.agency_nif && <Text style={styles.brandLine}>NIF : {agency.agency_nif}</Text>}
            {agency?.agency_vat_id && <Text style={styles.brandLine}>VAT-ID : {agency.agency_vat_id}</Text>}
            {agency?.agency_phone && <Text style={styles.brandLine}>{agency.agency_phone}</Text>}
            {agency?.agency_email && <Text style={styles.brandLine}>{agency.agency_email}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>FACTURE</Text>
            <Text style={styles.docNumber}>{invoice.number}</Text>
            <Text style={styles.docDate}>Date : {formatDate(invoice.createdAt, lang)}</Text>
            {invoice.validatedAt && <Text style={styles.docDate}>Validée : {formatDate(invoice.validatedAt, lang)}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facturé à</Text>
          <View style={styles.clientBlock}>
            <Text style={styles.clientName}>{organization.name}</Text>
            {organization.legalName && <Text style={styles.clientLine}>{organization.legalName}</Text>}
            {organization.address && <Text style={styles.clientLine}>{organization.address}</Text>}
            {organization.wilaya && <Text style={styles.clientLine}>{organization.wilaya}, {organization.country}</Text>}
            {organization.nif && <Text style={styles.clientLine}>NIF : {organization.nif}</Text>}
            {organization.nis && <Text style={styles.clientLine}>NIS : {organization.nis}</Text>}
            {organization.rc && <Text style={styles.clientLine}>RC : {organization.rc}</Text>}
            {organization.vatId && <Text style={styles.clientLine}>VAT-ID : {organization.vatId}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail des prestations</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.cellLabel]}>Description</Text>
              <Text style={[styles.tableHeaderCell, styles.cellAmount]}>Montant HT</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.cellLabel]}>
                Campagne {campaign?.number ?? ''} — {campaign?.name ?? 'Prestation'}{'\n'}
                <Text style={{ fontSize: 8, color: '#8898AA' }}>
                  Plateforme {campaign?.platform ?? ''} · Période du {campaign ? formatDate(campaign.startDate, lang) : ''}{campaign?.endDate ? ` au ${formatDate(campaign.endDate, lang)}` : ''}
                </Text>
              </Text>
              <Text style={[styles.cell, styles.cellAmount]}>{formatAmount(invoice.subtotalDzd, lang)}</Text>
            </View>
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total HT</Text>
              <Text style={styles.totalValue}>{formatAmount(invoice.subtotalDzd, lang)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA ({formatPercentage(invoice.vatRate, lang)})</Text>
              <Text style={styles.totalValue}>{formatAmount(invoice.vatAmountDzd, lang)}</Text>
            </View>
            {invoice.adjustmentAmountDzd !== 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Ajustement{invoice.adjustmentReason ? ` (${invoice.adjustmentReason})` : ''}</Text>
                <Text style={styles.totalValue}>{formatAmount(invoice.adjustmentAmountDzd, lang)}</Text>
              </View>
            )}
            {invoice.currencyTranslationGainLossDzd !== 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Différentiel taux de change</Text>
                <Text style={styles.totalValue}>{formatAmount(invoice.currencyTranslationGainLossDzd, lang)}</Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL TTC</Text>
              <Text style={styles.grandTotalValue}>{formatAmount(invoice.totalDzd, lang)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentBlock}>
          <Text style={styles.paymentTitle}>Conditions de paiement</Text>
          <Text style={styles.paymentText}>
            Paiement par virement bancaire sous 30 jours à compter de la date d&apos;émission.
            En cas de retard, des pénalités de 3 fois le taux d&apos;intérêt légal seront appliquées
            (article L. 441-6 du code de commerce).
          </Text>
        </View>

        <View style={styles.legalBlock}>
          <Text style={styles.legalText}>
            TVA acquittée selon le régime déclaratif en vigueur. Le défaut de paiement à l&apos;échéance entraîne
            l&apos;exigibilité immédiate de toutes les sommes dues. En cas de non-paiement, le recouvrement
            sera confié à un huissier de justice après mise en demeure restée infructueuse.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {agency?.agency_name ?? 'SENSIUM-X'}
            {agency?.agency_nif ? ` · NIF ${agency.agency_nif}` : ''}
          </Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
