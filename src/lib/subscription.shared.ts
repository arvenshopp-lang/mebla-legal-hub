/**
 * Subscription domain model shared by the client UI and the server functions.
 * Every number here originates from the database (`my_subscription_overview`).
 */

export type SubscriptionState = "active" | "trial" | "expired" | "suspended" | "cancelled" | "none";

export type PlanFeatureKey =
  | "ai_enabled"
  | "esignature_enabled"
  | "voice_enabled"
  | "api_enabled"
  | "pdf_search_enabled"
  | "client_upload_enabled"
  | "public_office_page";

export type SubscriptionPlan = {
  code: string;
  name_ar: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_users: number | null;
  max_cases: number | null;
  max_clients: number | null;
  max_documents: number | null;
  storage_gb: number | null;
  ocr_pages_monthly: number | null;
  ai_enabled: boolean;
  esignature_enabled: boolean;
  voice_enabled: boolean;
  api_enabled: boolean;
  pdf_search_enabled: boolean;
  client_upload_enabled: boolean;
  public_office_page: boolean;
  support_level: string;
  sla_hours: number;
  features: string[];
};

export type SubscriptionRecord = {
  id: string;
  plan_code: string;
  plan_label: string;
  status: string;
  amount: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  auto_renew: boolean;
  suspended_at: string | null;
  suspension_reason: string | null;
  cancelled_at: string | null;
  days_remaining: number;
};

export type SubscriptionUsage = {
  users: number;
  cases: number;
  clients: number;
  documents: number;
  storage_bytes: number;
  ocr_pages: number;
};

export type SubscriptionHistoryEntry = {
  id: string;
  plan_label: string;
  status: string;
  starts_at: string;
  ends_at: string;
  amount: number;
  currency: string;
  suspended_at: string | null;
};

export type SubscriptionInvoice = {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  issued_at: string;
  pdf_path: string | null;
};

export type UpgradePlanOption = {
  code: string;
  name_ar: string;
  price_monthly: number;
  sort_order: number;
  max_users: number | null;
  max_cases: number | null;
  esignature_enabled: boolean;
  voice_enabled: boolean;
  api_enabled: boolean;
  ai_enabled: boolean;
  public_office_page: boolean;
};

export type SubscriptionOverview = {
  state: SubscriptionState;
  now: string;
  subscription: SubscriptionRecord | null;
  plan: SubscriptionPlan;
  usage: SubscriptionUsage;
  history: SubscriptionHistoryEntry[];
  invoices: SubscriptionInvoice[];
  upgrade_plans: UpgradePlanOption[];
};

export const STATE_LABELS: Record<SubscriptionState, string> = {
  active: "نشط",
  trial: "تجريبي",
  expired: "منتهي",
  suspended: "موقوف",
  cancelled: "ملغي",
  none: "بانتظار التفعيل",
};

export const STATE_TONES: Record<SubscriptionState, "green" | "info" | "red" | "warn" | "muted"> = {
  active: "green",
  trial: "info",
  expired: "red",
  suspended: "warn",
  cancelled: "muted",
  none: "muted",
};

/** Paid capabilities are only in force while the subscription is live. */
export const LIVE_STATES: SubscriptionState[] = ["active", "trial"];

export function isLive(state: SubscriptionState) {
  return LIVE_STATES.includes(state);
}

/* ------------------------------------------------------------- limits ---- */

export type LimitKey = "users" | "cases" | "clients" | "documents" | "storage" | "ocr_pages";

export type LimitRow = {
  key: LimitKey;
  label: string;
  used: number;
  max: number | null;
  /** formatted "used / max" for display */
  display: string;
  percent: number | null;
  tone: "ok" | "warn" | "danger";
};

const GB = 1073741824;

function fmtGb(bytes: number) {
  return `${(bytes / GB).toFixed(bytes >= GB ? 1 : 2)} GB`;
}

function tone(percent: number | null): LimitRow["tone"] {
  if (percent === null) return "ok";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

const NUM = (n: number) => n.toLocaleString("ar-SA-u-nu-latn");

export function buildLimits(plan: SubscriptionPlan, usage: SubscriptionUsage): LimitRow[] {
  const rows: Array<{
    key: LimitKey;
    label: string;
    used: number;
    max: number | null;
    fmt?: (n: number) => string;
  }> = [
    { key: "users", label: "المستخدمون", used: usage.users, max: plan.max_users },
    { key: "cases", label: "القضايا", used: usage.cases, max: plan.max_cases },
    { key: "clients", label: "العملاء", used: usage.clients, max: plan.max_clients },
    { key: "documents", label: "المستندات", used: usage.documents, max: plan.max_documents },
    {
      key: "storage",
      label: "مساحة التخزين",
      used: usage.storage_bytes,
      max: plan.storage_gb === null ? null : plan.storage_gb * GB,
      fmt: fmtGb,
    },
    {
      key: "ocr_pages",
      label: "صفحات القراءة الضوئية (شهرياً)",
      used: usage.ocr_pages,
      max: plan.ocr_pages_monthly,
    },
  ];

  return rows.map(({ key, label, used, max, fmt }) => {
    const format = fmt ?? ((n: number) => NUM(n));
    const percent =
      max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : max === 0 ? 100 : null;
    return {
      key,
      label,
      used,
      max,
      display: max === null ? `${format(used)} / غير محدود` : `${format(used)} / ${format(max)}`,
      percent,
      tone: tone(percent),
    };
  });
}

/* ----------------------------------------------------------- features ---- */

export type FeatureRow = {
  key: PlanFeatureKey;
  label: string;
  available: boolean;
  /** shown when the feature is missing */
  requiredPlan: string | null;
};

export const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  pdf_search_enabled: "البحث داخل المستندات",
  client_upload_enabled: "روابط رفع المستندات للعملاء",
  ai_enabled: "المساعد القانوني الذكي",
  esignature_enabled: "التوقيع الإلكتروني",
  voice_enabled: "تسجيل الصوت وتحويله لنص",
  api_enabled: "الوصول عبر API",
  public_office_page: "الصفحة العامة للمكتب",
};

export const FEATURE_ORDER: PlanFeatureKey[] = [
  "pdf_search_enabled",
  "client_upload_enabled",
  "public_office_page",
  "ai_enabled",
  "esignature_enabled",
  "voice_enabled",
  "api_enabled",
];

/** The cheapest public plan that includes the given capability. */
export function findRequiredPlan(
  feature: PlanFeatureKey,
  plans: UpgradePlanOption[],
): string | null {
  if (feature === "pdf_search_enabled" || feature === "client_upload_enabled") {
    return plans.length > 0 ? plans[0].name_ar : null;
  }
  const match = plans
    .filter((p) => Boolean(p[feature as keyof UpgradePlanOption]))
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  return match?.name_ar ?? null;
}

export function buildFeatureRows(overview: SubscriptionOverview): FeatureRow[] {
  const live = isLive(overview.state);
  return FEATURE_ORDER.map((key) => {
    const inPlan = Boolean(overview.plan[key]);
    const available = inPlan && (live || key === "pdf_search_enabled");
    return {
      key,
      label: FEATURE_LABELS[key],
      available,
      requiredPlan: available ? null : findRequiredPlan(key, overview.upgrade_plans),
    };
  });
}

export function hasFeature(
  overview: SubscriptionOverview | null | undefined,
  feature: PlanFeatureKey,
) {
  if (!overview) return false;
  if (!overview.plan[feature]) return false;
  return feature === "pdf_search_enabled" ? true : isLive(overview.state);
}

export const SUPPORT_LABELS: Record<string, string> = {
  community: "دعم عبر مركز المساعدة",
  standard: "دعم عادي",
  priority: "دعم ذو أولوية",
  dedicated: "مدير حساب مخصص",
};

/* -------------------------------------------------- expiry messaging ----- */

export function remainingLabel(state: SubscriptionState, days: number | null): string {
  if (state === "suspended") return "الاشتراك موقوف حالياً";
  if (state === "cancelled") return "تم إلغاء الاشتراك";
  if (state === "none" || days === null) return "لا يوجد اشتراك مفعّل";
  if (days < 0) return `انتهى منذ ${NUM(Math.abs(days))} يوماً`;
  if (days === 0) return "ينتهي اليوم";
  if (days === 1) return "متبقي يوم واحد";
  return `متبقي ${NUM(days)} يوماً`;
}

export type ExpiryNotice = {
  tone: "info" | "warn" | "danger";
  title: string;
  body: string;
} | null;

export function expiryNotice(overview: SubscriptionOverview | null | undefined): ExpiryNotice {
  if (!overview) return null;
  const days = overview.subscription?.days_remaining ?? null;

  if (overview.state === "suspended") {
    return {
      tone: "danger",
      title: "الاشتراك موقوف",
      body:
        overview.subscription?.suspension_reason?.trim() ||
        "تم إيقاف الاشتراك مؤقتاً. تواصل مع فريق مِهلة لإعادة التفعيل.",
    };
  }
  if (overview.state === "expired") {
    return {
      tone: "danger",
      title: "انتهى اشتراكك",
      body: "تم إيقاف المزايا المدفوعة. بياناتك محفوظة ويمكنك قراءتها وتنزيلها، لكن إضافة بيانات جديدة مقيّدة بحدود الباقة المجانية.",
    };
  }
  if (overview.state === "cancelled") {
    return { tone: "warn", title: "تم إلغاء الاشتراك", body: "يمكنك تفعيل باقة جديدة في أي وقت." };
  }
  if (overview.state === "none") {
    return {
      tone: "info",
      title: "بانتظار التفعيل",
      body: "أنت تعمل حالياً على حدود الباقة المجانية. فعّل باقة للحصول على كامل المزايا.",
    };
  }
  if (days === null) return null;
  if (days <= 1)
    return {
      tone: "danger",
      title: days <= 0 ? "ينتهي اشتراكك اليوم" : "متبقي يوم واحد",
      body: "جدّد الآن حتى لا تتوقف المزايا المدفوعة.",
    };
  if (days <= 3)
    return {
      tone: "danger",
      title: `متبقي ${NUM(days)} أيام على انتهاء الاشتراك`,
      body: "نوصي بالتجديد الآن لتفادي توقف المزايا.",
    };
  if (days <= 7)
    return { tone: "danger", title: `متبقي ${NUM(days)} أيام`, body: "اشتراكك على وشك الانتهاء." };
  if (days <= 14)
    return {
      tone: "warn",
      title: `متبقي ${NUM(days)} يوماً`,
      body: "يمكنك التجديد مبكراً من صفحة الاشتراك.",
    };
  if (days <= 30)
    return { tone: "info", title: `متبقي ${NUM(days)} يوماً`, body: "اشتراكك ينتهي خلال شهر." };
  return null;
}

/* ------------------------------------------- server error translation ---- */

const QUOTA_LABELS: Record<string, string> = {
  cases: "عدد القضايا",
  clients: "عدد العملاء",
  documents: "عدد المستندات",
  users: "عدد المستخدمين",
  storage: "مساحة التخزين",
  ocr_pages: "صفحات القراءة الضوئية",
};

const FEATURE_CODE_LABELS: Record<string, string> = {
  client_upload: "روابط رفع المستندات للعملاء",
  esignature: "التوقيع الإلكتروني",
  voice: "تسجيل الصوت",
  api: "الوصول عبر API",
  ai: "المساعد القانوني الذكي",
  ocr: "القراءة الضوئية",
};

/**
 * Turns a raw database/server rejection into professional Arabic copy.
 * Returns null when the error is not subscription related.
 */
export function translateSubscriptionError(message?: string | null): string | null {
  if (!message) return null;
  const quota = /QUOTA_EXCEEDED:([a-z_]+)/.exec(message);
  if (quota) {
    const label = QUOTA_LABELS[quota[1]] ?? "أحد حدود الباقة";
    return `بلغت الحد الأقصى لـ${label} في باقتك الحالية. ارفع الباقة من صفحة الاشتراك للمتابعة.`;
  }
  const feature = /FEATURE_UNAVAILABLE:([a-z_]+)/.exec(message);
  if (feature) {
    const label = FEATURE_CODE_LABELS[feature[1]] ?? "هذه الميزة";
    return `${label} غير متوفرة ضمن باقتك الحالية.`;
  }
  if (message.includes("SUBSCRIPTION_SUSPENDED")) {
    return "الاشتراك موقوف حالياً، لذلك لا يمكن إضافة بيانات جديدة.";
  }
  if (message.includes("SUBSCRIPTION_INACTIVE")) {
    return "هذه العملية تتطلب اشتراكاً نشطاً.";
  }
  return null;
}

/** Ready-to-use toast payload for any mutation failure. */
export function describeMutationError(
  message?: string | null,
  fallback = "حاول مرة أخرى.",
): string {
  return translateSubscriptionError(message) ?? fallback;
}
