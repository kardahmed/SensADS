import type { CurrencyCode } from '../constants';
import type { AppSettings } from '../types';

export interface DbAppSettings {
  id: string;
  vat_rate: number;
  invoice_minimum_amount_dzd: number;
  default_exchange_rates: Record<CurrencyCode, number>;
  branding_logo_url: string | null;
  agency_name: string;
  agency_address: string | null;
  agency_nif: string | null;
  agency_vat_id: string | null;
  notifications_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

export function dbAppSettingsToAppSettings(db: DbAppSettings): AppSettings {
  return {
    id: db.id,
    vatRate: db.vat_rate,
    invoiceMinimumAmountDzd: db.invoice_minimum_amount_dzd,
    defaultExchangeRates: db.default_exchange_rates,
    brandingLogoUrl: db.branding_logo_url,
    agencyName: db.agency_name,
    agencyAddress: db.agency_address,
    agencyNif: db.agency_nif,
    agencyVatId: db.agency_vat_id,
    notificationsEnabled: db.notifications_enabled,
    updatedBy: db.updated_by,
    updatedAt: db.updated_at,
  };
}
