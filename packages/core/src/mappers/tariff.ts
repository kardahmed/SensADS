import type { ClientTariffOverride, PlatformTariff } from '../types';

export interface DbPlatformTariff {
  id: string;
  platform: string;
  optimization_goal: string;
  name: string;
  purchase_price_usd: number;
  selling_price_usd: number;
  margin_percentage: number;
  min_budget_dzd: number;
  status: 'active' | 'archived';
  created_at: string;
}

export interface DbClientTariffOverride {
  id: string;
  organization_id: string;
  tariff_id: string;
  custom_purchase_price_usd: number | null;
  custom_selling_price_usd: number | null;
  notes: string | null;
  created_at: string;
}

export function dbTariffToTariff(db: DbPlatformTariff): PlatformTariff {
  return {
    id: db.id,
    platform: db.platform,
    optimizationGoal: db.optimization_goal,
    name: db.name,
    purchasePriceUsd: db.purchase_price_usd,
    sellingPriceUsd: db.selling_price_usd,
    marginPercentage: db.margin_percentage,
    minBudgetDzd: db.min_budget_dzd,
    status: db.status,
    createdAt: db.created_at,
  };
}

export function dbOverrideToOverride(db: DbClientTariffOverride): ClientTariffOverride {
  return {
    id: db.id,
    organizationId: db.organization_id,
    tariffId: db.tariff_id,
    customPurchasePriceUsd: db.custom_purchase_price_usd,
    customSellingPriceUsd: db.custom_selling_price_usd,
    notes: db.notes,
    createdAt: db.created_at,
  };
}
