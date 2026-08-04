/**
 * أنواع مؤشرات لوحة إدارة المنصة ونطاقاتها الزمنية.
 * كل رقم هنا مصدره استعلام حقيقي في `admin_platform_metrics` — لا قيم ثابتة.
 */
export const METRIC_RANGES = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "آخر ٧ أيام" },
  { id: "30d", label: "آخر ٣٠ يوماً" },
  { id: "month", label: "هذا الشهر" },
  { id: "year", label: "هذا العام" },
  { id: "custom", label: "نطاق مخصص" },
] as const;

export type MetricRangeId = (typeof METRIC_RANGES)[number]["id"];

/** يحوّل اختيار المستخدم إلى نطاق زمني فعلي بتوقيت الرياض. */
export function resolveRange(
  id: MetricRangeId,
  custom?: { from?: string; to?: string },
): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (id) {
    case "today":
      return { from: startOfDay.toISOString(), to };
    case "7d":
      return { from: new Date(startOfDay.getTime() - 6 * 86400000).toISOString(), to };
    case "30d":
      return { from: new Date(startOfDay.getTime() - 29 * 86400000).toISOString(), to };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to };
    case "custom": {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : startOfDay;
      const end = custom?.to ? new Date(`${custom.to}T23:59:59`) : now;
      return { from: from.toISOString(), to: end.toISOString() };
    }
  }
}

export interface PlatformMetrics {
  range: { from: string; to: string };
  generated_at: string;
  organizations: {
    total: number; active: number; suspended: number; trial: number;
    no_subscription: number; new_in_range: number;
  };
  users: {
    total: number; active: number; suspended: number; new_in_range: number;
    phone_verified: number; mfa_enabled: number; without_org: number;
  };
  subscriptions: {
    total: number; active: number; trial: number; expiring_14d: number; expired: number;
    cancelled: number; suspended: number; auto_renew: number; new_in_range: number;
  };
  usage: {
    cases: number; cases_in_range: number; clients: number; documents: number;
    documents_in_range: number; storage_bytes: number; ocr_pages_in_range: number;
    hearings_in_range: number;
  };
  messaging: {
    sms_sent_in_range: number; sms_failed_in_range: number;
    notifications_in_range: number; broadcasts_in_range: number;
  };
  support: {
    open: number; closed: number; new_in_range: number; unassigned: number;
    avg_first_reply_hours: number;
  };
  reliability: {
    failures_in_range: number;
    failures_by_surface: { label: string; count: number }[];
    auth_failures_in_range: number;
    audit_events_in_range: number;
  };
  /** فارغ لمن لا يملك صلاحية التقارير المالية. */
  revenue: null | {
    in_range: number; today: number; month: number; year: number; total: number;
    mrr: number; arr: number; arpu: number; paying_organizations: number;
    churn_rate: number; churned_in_range: number;
    trials_in_range: number; trial_conversion_rate: number;
    invoices: {
      total: number; in_range: number; paid: number; pending: number; overdue: number;
      paid_amount: number; outstanding_amount: number;
    };
    by_plan: { label: string; count: number; amount: number }[];
    by_month: { month: string; amount: number; count: number }[];
  };
}
