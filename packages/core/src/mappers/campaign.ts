import type { CampaignStatus } from '../constants';
import type { Campaign, SpecialAdCategory } from '../types';

export interface DbCampaign {
  id: string;
  number: string;
  organization_id: string;
  po_id: string;
  name: string;
  platform: string;
  optimization_goal: string;
  budget_dzd: number;
  budget_mode: 'cbo' | 'abo';
  start_date: string;
  end_date: string | null;
  ad_account_id: string;
  special_ad_category: SpecialAdCategory;
  disclaimer_text: string | null;
  status: CampaignStatus;
  external_id: string | null;
  total_spent_source_currency: number;
  total_spent_dzd: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  completed_at: string | null;
  rejected_reason: string | null;
  created_by: string;
  created_at: string;
}

export function dbCampaignToCampaign(db: DbCampaign): Campaign {
  return {
    id: db.id,
    number: db.number,
    organizationId: db.organization_id,
    poId: db.po_id,
    name: db.name,
    platform: db.platform,
    optimizationGoal: db.optimization_goal,
    budgetDzd: db.budget_dzd,
    budgetMode: db.budget_mode,
    startDate: db.start_date,
    endDate: db.end_date,
    adAccountId: db.ad_account_id,
    specialAdCategory: db.special_ad_category,
    disclaimerText: db.disclaimer_text,
    status: db.status,
    externalId: db.external_id,
    totalSpentSourceCurrency: db.total_spent_source_currency,
    totalSpentDzd: db.total_spent_dzd,
    submittedAt: db.submitted_at,
    approvedAt: db.approved_at,
    approvedBy: db.approved_by,
    completedAt: db.completed_at,
    rejectedReason: db.rejected_reason,
    createdBy: db.created_by,
    createdAt: db.created_at,
  };
}
