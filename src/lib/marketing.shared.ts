/** أنواع مشتركة لوحدة التسويق — الواجهة ودوال الخادم. */

export const MARKETING_CAMPAIGN_STATUS = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;
export type MarketingCampaignStatus = (typeof MARKETING_CAMPAIGN_STATUS)[number];

export const MARKETING_CAMPAIGN_STATUS_LABELS: Record<MarketingCampaignStatus, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  running: "قيد التشغيل",
  paused: "متوقفة مؤقتاً",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

export type MarketingCampaignRow = {
  id: string;
  name: string;
  channel: string;
  objective: string | null;
  status: MarketingCampaignStatus;
  budget_amount: number;
  spend_amount: number;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page_slug: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  owner_staff_id: string | null;
  owner_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  leads_count?: number;
  deals_count?: number;
};

export type MarketingConversionEventRow = {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  lead_id: string | null;
  organization_id: string | null;
  event_key: string;
  label: string | null;
  value_amount: number;
  source: string | null;
  utm: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

export type MarketingReferralRow = {
  id: string;
  code: string;
  referrer_kind: string;
  referrer_name: string | null;
  referrer_email: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  reward_note: string | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingProviderStatus = {
  provider_key: string;
  display_name_ar: string;
  category_label: string;
  configured: boolean;
  is_enabled: boolean;
  status: string;
  last_checked_at: string | null;
  environment: string | null;
};
