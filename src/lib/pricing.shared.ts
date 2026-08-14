/**
 * كتالوج الباقات العام — منطق عرض مشترك بين الخادم والواجهة.
 * كل قيمة معروضة تأتي من `platform_plans` مباشرة، ولا يوجد أي سعر أو حد مكتوب يدوياً.
 */

import { fmtNumber } from "@/lib/format";
import { FEATURE_LABELS, SUPPORT_LABELS, type PlanFeatureKey } from "@/lib/subscription.shared";

export type PublicPlan = {
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
  support_level: string | null;
  sla_hours: number | null;
  sort_order: number;
  ai_enabled: boolean;
  esignature_enabled: boolean;
  voice_enabled: boolean;
  api_enabled: boolean;
  pdf_search_enabled: boolean;
  client_upload_enabled: boolean;
  public_office_page: boolean;
};

export type BillingCycle = "monthly" | "yearly";

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "شهري",
  yearly: "سنوي",
};

/**
 * جاهزية الميزة على مستوى المنصة (قاعدة صدق الميزات).
 * الميزة تُعرض «متوفرة» فقط إذا كانت منفّذة فعلياً في المنصة ومشمولة في الباقة،
 * وإلا تُعرض «قريباً» بوضوح بدل الوعد بما ليس جاهزاً.
 */
export const FEATURE_READINESS: Record<PlanFeatureKey, "available" | "coming_soon"> = {
  pdf_search_enabled: "available",
  client_upload_enabled: "available",
  public_office_page: "available",
  ai_enabled: "available",
  esignature_enabled: "available",
  voice_enabled: "coming_soon",
  api_enabled: "coming_soon",
};

/** ترتيب عرض المزايا في البطاقات وجدول المقارنة. */
export const PUBLIC_FEATURE_ORDER: PlanFeatureKey[] = [
  "pdf_search_enabled",
  "client_upload_enabled",
  "public_office_page",
  "ai_enabled",
  "esignature_enabled",
  "voice_enabled",
  "api_enabled",
];

export type FeatureCell = {
  key: PlanFeatureKey;
  label: string;
  /** مشمولة في الباقة */
  included: boolean;
  /** مشمولة في الباقة لكن التنفيذ على مستوى المنصة لم يُطلق بعد */
  comingSoon: boolean;
};

export function planFeatureCells(plan: PublicPlan): FeatureCell[] {
  return PUBLIC_FEATURE_ORDER.map((key) => {
    const included = Boolean(plan[key]);
    return {
      key,
      label: FEATURE_LABELS[key],
      included,
      comingSoon: included && FEATURE_READINESS[key] === "coming_soon",
    };
  });
}

/* ------------------------------------------------------------- الحدود ---- */

export type PlanLimitRow = { key: string; label: string; value: string };

const UNLIMITED = "غير محدود";

const limit = (n: number | null, suffix = "") =>
  n === null ? UNLIMITED : `${fmtNumber(n)}${suffix}`;

export function planLimitRows(plan: PublicPlan): PlanLimitRow[] {
  return [
    { key: "users", label: "المستخدمون", value: limit(plan.max_users) },
    { key: "cases", label: "القضايا", value: limit(plan.max_cases) },
    { key: "clients", label: "العملاء", value: limit(plan.max_clients) },
    { key: "documents", label: "المستندات", value: limit(plan.max_documents) },
    { key: "storage", label: "مساحة التخزين", value: limit(plan.storage_gb, " GB") },
    {
      key: "ocr",
      label: "صفحات القراءة الضوئية شهرياً",
      value: limit(plan.ocr_pages_monthly),
    },
  ];
}

export function planSupportRows(plan: PublicPlan): PlanLimitRow[] {
  return [
    {
      key: "support",
      label: "مستوى الدعم",
      value: plan.support_level ? (SUPPORT_LABELS[plan.support_level] ?? plan.support_level) : "—",
    },
    {
      key: "sla",
      label: "زمن الاستجابة المستهدف",
      value: plan.sla_hours ? `${fmtNumber(plan.sla_hours)} ساعة` : "—",
    },
  ];
}

/* ------------------------------------------------------------- الأسعار ---- */

export function cyclePrice(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "monthly" ? plan.price_monthly : plan.price_yearly;
}

/** السعر الشهري الفعلي عند الدفع السنوي — يُستخدم للمقارنة فقط. */
export function monthlyEquivalent(plan: PublicPlan): number {
  return plan.price_yearly / 12;
}

/**
 * نسبة التوفير عند الدفع السنوي، محسوبة من الأسعار الفعلية.
 * تُرجع null إذا لم يوجد توفير حقيقي.
 */
export function yearlySavingPercent(plan: PublicPlan): number | null {
  const full = plan.price_monthly * 12;
  if (full <= 0 || plan.price_yearly <= 0 || plan.price_yearly >= full) return null;
  return Math.round(((full - plan.price_yearly) / full) * 100);
}

/** أعلى نسبة توفير سنوي بين الباقات المنشورة — لعرضها على المبدّل. */
export function bestYearlySaving(plans: PublicPlan[]): number | null {
  const values = plans.map(yearlySavingPercent).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

export function priceLabel(plan: PublicPlan, cycle: BillingCycle): string {
  return fmtNumber(Math.round(cyclePrice(plan, cycle)));
}

export function cycleSuffix(cycle: BillingCycle): string {
  return cycle === "monthly" ? "/ شهرياً" : "/ سنوياً";
}

/** الباقة الموصى بها بصرياً: الوسطى بين الباقات المنشورة. */
export function highlightedPlanCode(plans: PublicPlan[]): string | null {
  if (plans.length === 0) return null;
  return plans[Math.min(1, plans.length - 1)].code;
}

export const PRICING_NOTES = [
  "الأسعار بالريال السعودي، وتُطبّق الأنظمة الضريبية السعودية على الفواتير الصادرة.",
  "الدفع الإلكتروني غير مفعّل حالياً؛ تُفعّل الباقة بالتنسيق مع فريق مِهلة بعد إنشاء الحساب.",
  "يمكنك الانتقال بين الباقات في أي وقت، وتبقى بياناتك كما هي.",
];

export const PRICING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "هل أحتاج بطاقة دفع لإنشاء الحساب؟",
    a: "لا. تنشئ حساب المكتب وتبدأ العمل، ثم تُفعّل الباقة المناسبة بالتنسيق مع فريق مِهلة.",
  },
  {
    q: "ما الفرق بين الدفع الشهري والسنوي؟",
    a: "المزايا والحدود متطابقة، والدفع السنوي أقل تكلفة على مدار السنة كما يظهر في مبدّل مدة الاشتراك.",
  },
  {
    q: "ماذا يحدث إذا تجاوزت حدود الباقة؟",
    a: "يمنع النظام إضافة بيانات جديدة تتجاوز الحد ويطلب ترقية الباقة، وتبقى بياناتك الحالية كاملة ومتاحة للقراءة والتنزيل.",
  },
  {
    q: "هل يمكن تغيير الباقة أو إلغاؤها؟",
    a: "نعم، يمكن الترقية أو التخفيض أو الإلغاء من صفحة الاشتراك داخل مساحة عمل المكتب.",
  },
  {
    q: "هل هناك باقة مخصصة للمؤسسات الكبيرة؟",
    a: "نعم. تواصل معنا لتحديد الحدود ومستوى الدعم والتكاملات المناسبة لحجم مؤسستك.",
  },
];
