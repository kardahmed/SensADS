import type { CampaignKpi } from '../types';

export interface DbCampaignKpi {
  id: string;
  campaign_id: string;
  ad_set_id: string | null;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
  platform_metrics: Record<string, number>;
  exchange_rate_snapshot: number;
  spend_dzd: number;
  source: 'manual' | 'api' | 'ga4';
  created_by: string | null;
  created_at: string;
}

export function dbKpiToKpi(db: DbCampaignKpi): CampaignKpi {
  return {
    id: db.id,
    campaignId: db.campaign_id,
    adSetId: db.ad_set_id,
    date: db.date,
    spend: db.spend,
    impressions: db.impressions,
    clicks: db.clicks,
    conversions: db.conversions,
    reach: db.reach,
    frequency: db.frequency,
    cpm: db.cpm,
    cpc: db.cpc,
    ctr: db.ctr,
    cpa: db.cpa,
    platformMetrics: db.platform_metrics,
    exchangeRateSnapshot: db.exchange_rate_snapshot,
    spendDzd: db.spend_dzd,
    source: db.source,
    createdBy: db.created_by,
    createdAt: db.created_at,
  };
}
