import type { Json } from "@/integrations/supabase/types";
/**
 * أنواع وتسميات مشتركة لوحدة CRM (عملاء محتملون، شركات، جهات اتصال، صفقات، أنشطة).
 * تُستخدم من دوال الخادم `crm.functions.ts` ومن مكونات الواجهة في `src/routes/mehla-admin/crm*`.
 */

export type CrmLeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted" | "lost";
export type CrmDealStatus = "open" | "won" | "lost" | "abandoned";
export type CrmEntityKind = "lead" | "company" | "contact" | "deal";
export type CrmActivityKind = "meeting" | "call" | "note" | "task" | "followup" | "email";

export const CRM_LEAD_STATUS_LABEL: Record<CrmLeadStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  qualified: "مؤهّل",
  unqualified: "غير مؤهّل",
  converted: "تم التحويل",
  lost: "مفقود",
};

export const CRM_DEAL_STATUS_LABEL: Record<CrmDealStatus, string> = {
  open: "مفتوحة",
  won: "مكسوبة",
  lost: "مفقودة",
  abandoned: "متروكة",
};

export const CRM_ACTIVITY_KIND_LABEL: Record<CrmActivityKind, string> = {
  meeting: "اجتماع",
  call: "مكالمة",
  note: "ملاحظة",
  task: "مهمة",
  followup: "متابعة",
  email: "بريد إلكتروني",
};

export const CRM_ENTITY_KIND_LABEL: Record<CrmEntityKind, string> = {
  lead: "عميل محتمل",
  company: "شركة",
  contact: "جهة اتصال",
  deal: "صفقة",
};

export type StaffOption = { id: string; full_name: string; email: string };

export type CrmLeadRow = {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: CrmLeadStatus;
  source: string | null;
  score: number;
  owner_staff_id: string | null;
  owner: StaffOption | null;
  disqualify_reason: string | null;
  converted_at: string | null;
  converted_company_id: string | null;
  converted_contact_id: string | null;
  converted_deal_id: string | null;
  last_activity_at: string | null;
  notes: string | null;
  utm: Json | null;
  created_at: string;
  updated_at: string;
};

export type CrmCompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  sector: string | null;
  size_bracket: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  organization_id: string | null;
  owner_staff_id: string | null;
  owner: StaffOption | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts_count?: number;
  deals_count?: number;
};

export type CrmContactRow = {
  id: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  is_primary: boolean;
  owner_staff_id: string | null;
  owner: StaffOption | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmPipelineStageRow = {
  id: string;
  name: string;
  sort_order: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmDealRow = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  probability: number;
  status: CrmDealStatus;
  stage_id: string | null;
  stage_name: string | null;
  company_id: string | null;
  company_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  lead_id: string | null;
  owner_staff_id: string | null;
  owner: StaffOption | null;
  source: string | null;
  utm: Json | null;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmActivityRow = {
  id: string;
  kind: CrmActivityKind;
  entity_kind: CrmEntityKind;
  subject: string;
  body: string | null;
  outcome: string | null;
  due_at: string | null;
  completed_at: string | null;
  lead_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  owner_staff_id: string | null;
  owner: StaffOption | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmPipelineSummary = {
  stage_id: string;
  stage_name: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  deals_count: number;
  total_amount: number;
  weighted_amount: number;
};

export type CrmForecast = {
  total_open_amount: number;
  total_weighted_amount: number;
  won_amount_30d: number;
  lost_amount_30d: number;
  open_deals_count: number;
};

export type CrmSourceReport = {
  source: string;
  leads_count: number;
  converted_count: number;
  deals_count: number;
  won_deals_count: number;
  won_amount: number;
};

export type CrmUtmReport = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  leads_count: number;
  deals_count: number;
  won_amount: number;
};
