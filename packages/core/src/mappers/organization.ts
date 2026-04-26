import type { Organization } from '../types';

export interface DbOrganization {
  id: string;
  name: string;
  legal_name: string | null;
  nif: string | null;
  nis: string | null;
  rc: string | null;
  vat_id: string | null;
  is_eu_vat_valid: boolean;
  address: string | null;
  wilaya: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  owner_id: string;
  assigned_tm_id: string | null;
  sandbox_mode: boolean;
  max_sub_accounts: number;
  features: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
}

export function dbOrganizationToOrganization(db: DbOrganization): Organization {
  return {
    id: db.id,
    name: db.name,
    legalName: db.legal_name,
    nif: db.nif,
    nis: db.nis,
    rc: db.rc,
    vatId: db.vat_id,
    isEuVatValid: db.is_eu_vat_valid,
    address: db.address,
    wilaya: db.wilaya,
    country: db.country,
    phone: db.phone,
    email: db.email,
    ownerId: db.owner_id,
    assignedTmId: db.assigned_tm_id,
    sandboxMode: db.sandbox_mode,
    maxSubAccounts: db.max_sub_accounts,
    features: db.features,
    createdAt: db.created_at,
    deletedAt: db.deleted_at,
  };
}
