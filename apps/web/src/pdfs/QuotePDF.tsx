/**
 * QuotePDF — Document PDF react-pdf pour les devis.
 *
 * Mode CLAIR (exception au dark mode app).
 * Mentions fiscales algériennes obligatoires (NIF/NIS/RC).
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  formatAmount,
  formatDate,
  formatPercentage,
  getPlatform,
} from '@sensads/core';
import type { Organization } from '@sensads/core';
import type { QuoteWithLines } from '@/hooks/useQuotes';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0A2540',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '2 solid #00D4FF',
  },
  brandBlock: { flexDirection: 'column', gap: 4 },
  brandName: { fontSize: 20, fontWeight: 'bold', color: '#0A2540' },
  brandTagline: { fontSize: 9, color: '#8898AA' },
  brandAddress: { fontSize: 8, color: '#425466', marginTop: 4 },
  docInfoBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 22, fontWeight: 'bold', color: '#00D4FF' },
  docNumber: { fontSize: 12, fontFamily: 'Courier', marginTop: 4 },
  docDate: { fontSize: 9, color: '#8898AA', marginTop: 2 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#00D4FF',
    marginBottom: 6,
    letterSpacing: 1,
  },
  twoCols: { flexDirection: 'row', gap: 24 },
  col: { flex: 1 },
  clientBlock: {
    backgroundColor: '#F6F9FC',
    padding: 12,
    borderRadius: 4,
  },
  clientName: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  clientLine: { fontSize: 9, color: '#425466', marginBottom: 2 },

  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0A2540',
    color: '#FFFFFF',
    padding: 6,
  },
  tableHeaderCell: { fontSize: 9, fontWeight: 'bold' },
  tableRow: {
    flexDirection: 'row',
    padding: 6,
    borderBottom: '1 solid #E6EBF1',
  },
  tableRowAlt: {
    flexDirection: 'row',
    padding: 6,
    borderBottom: '1 solid #E6EBF1',
    backgroundColor: '#F6F9FC',
  },
  cell: { fontSize: 9 },
  cellPlatform: { width: '20%' },
  cellTariff: { width: '25%' },
  cellQty: { width: '10%', textAlign: 'right' },
  cellUnit: { width: '20%', textAlign: 'right' },
  cellTotal: { width: '25%', textAlign: 'right', fontWeight: 'bold' },

  totals: {
    marginLeft: 'auto',
    width: '40%',
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 10, color: '#425466' },
  totalValue: { fontSize: 10, fontFamily: 'Courier' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 6,
    marginTop: 4,
    borderTop: '2 solid #0A2540',
  },
  grandTotalLabel: { fontSize: 12, fontWeight: 'bold' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Courier', fontWeight: 'bold' },

  notesBlock: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#F6F9FC',
    borderRadius: 4,
  },
  notesTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  notesText: { fontSize: 9, color: '#425466', lineHeight: 1.4 },

  validityBlock: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
  },
  validityText: { fontSize: 9, color: '#92400E' },

  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    paddingTop: 8,
    borderTop: '1 solid #E6EBF1',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#8898AA' },
});

interface AppSettingsAgencyData {
  agency_name: string;
  agency_address?: string | null;
  agency_nif?: string | null;
  agency_vat_id?: string | null;
  agency_email?: string | null;
  agency_phone?: string | null;
}

interface QuotePDFProps {
  quote: QuoteWithLines;
  organization: Organization;
  agency?: AppSettingsAgencyData;
  language?: 'fr' | 'en';
}

export function QuotePDF({
  quote,
  organization,
  agency,
  language = 'fr',
}: QuotePDFProps): JSX.Element {
  const lang = language;
  return (
    <Document
      title={`Devis ${quote.number}`}
      author={agency?.agency_name ?? 'SENSIUM-X'}
      subject={`Devis pour ${organization.name}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{agency?.agency_name ?? 'SENSIUM-X'}</Text>
            <Text style={styles.brandTagline}>Digital Traffic Management</Text>
            {agency?.agency_address && (
              <Text style={styles.brandAddress}>{agency.agency_address}</Text>
            )}
            {agency?.agency_nif && (
              <Text style={styles.brandAddress}>NIF : {agency.agency_nif}</Text>
            )}
            {agency?.agency_phone && (
              <Text style={styles.brandAddress}>{agency.agency_phone}</Text>
            )}
            {agency?.agency_email && (
              <Text style={styles.brandAddress}>{agency.agency_email}</Text>
            )}
          </View>
          <View style={styles.docInfoBlock}>
            <Text style={styles.docTitle}>DEVIS</Text>
            <Text style={styles.docNumber}>{quote.number}</Text>
            <Text style={styles.docDate}>Date : {formatDate(quote.createdAt, lang)}</Text>
            {quote.validUntil && (
              <Text style={styles.docDate}>
                Valide jusqu&apos;au : {formatDate(quote.validUntil, lang)}
              </Text>
            )}
          </View>
        </View>

        {/* Client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.clientBlock}>
            <Text style={styles.clientName}>{organization.name}</Text>
            {organization.legalName && (
              <Text style={styles.clientLine}>{organization.legalName}</Text>
            )}
            {organization.address && (
              <Text style={styles.clientLine}>{organization.address}</Text>
            )}
            {organization.wilaya && (
              <Text style={styles.clientLine}>
                {organization.wilaya}, {organization.country}
              </Text>
            )}
            {organization.nif && (
              <Text style={styles.clientLine}>NIF : {organization.nif}</Text>
            )}
            {organization.nis && (
              <Text style={styles.clientLine}>NIS : {organization.nis}</Text>
            )}
            {organization.rc && <Text style={styles.clientLine}>RC : {organization.rc}</Text>}
            {organization.vatId && (
              <Text style={styles.clientLine}>VAT-ID : {organization.vatId}</Text>
            )}
          </View>
        </View>

        {/* Lignes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail des prestations</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.cellPlatform]}>Plateforme</Text>
              <Text style={[styles.tableHeaderCell, styles.cellTariff]}>Prestation</Text>
              <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qté</Text>
              <Text style={[styles.tableHeaderCell, styles.cellUnit]}>Prix unit.</Text>
              <Text style={[styles.tableHeaderCell, styles.cellTotal]}>Total HT</Text>
            </View>
            {quote.lines.map((line, idx) => {
              const platform = line.tariff ? getPlatform(line.tariff.platform) : null;
              return (
                <View key={line.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={[styles.cell, styles.cellPlatform]}>
                    {platform?.name ?? line.tariff?.platform ?? '—'}
                  </Text>
                  <Text style={[styles.cell, styles.cellTariff]}>
                    {line.tariff?.name ?? '—'} ({line.tariff?.optimization_goal?.toUpperCase()})
                  </Text>
                  <Text style={[styles.cell, styles.cellQty]}>{line.quantity}</Text>
                  <Text style={[styles.cell, styles.cellUnit]}>
                    {formatAmount(line.unitPriceDzd, lang)}
                  </Text>
                  <Text style={[styles.cell, styles.cellTotal]}>
                    {formatAmount(line.totalDzd, lang)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Totaux */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total HT</Text>
              <Text style={styles.totalValue}>{formatAmount(quote.subtotalDzd, lang)}</Text>
            </View>
            {quote.discountAmountDzd > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Remise ({formatPercentage(quote.discountPercentage, lang)})
                </Text>
                <Text style={styles.totalValue}>
                  - {formatAmount(quote.discountAmountDzd, lang)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                TVA ({formatPercentage(quote.vatRate, lang)})
              </Text>
              <Text style={styles.totalValue}>
                + {formatAmount(quote.vatAmountDzd, lang)}
              </Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL TTC</Text>
              <Text style={styles.grandTotalValue}>{formatAmount(quote.totalDzd, lang)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {quote.validUntil && (
          <View style={styles.validityBlock}>
            <Text style={styles.validityText}>
              ⚠ Ce devis est valable jusqu&apos;au {formatDate(quote.validUntil, lang)}.
              Au-delà de cette date, les tarifs pourront être révisés.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {agency?.agency_name ?? 'SENSIUM-X'}
            {agency?.agency_nif ? ` · NIF ${agency.agency_nif}` : ''}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
