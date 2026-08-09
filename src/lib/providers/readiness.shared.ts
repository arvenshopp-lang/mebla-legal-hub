/**
 * جاهزية المزوّدين الخارجيين — أنواع وتسميات آمنة للمتصفح.
 *
 * قواعد ثابتة:
 *  - لا يحتوي هذا الملف أي سرّ ولا منطق اتصال.
 *  - حالة «متصل» لا تُشتق من وجود مفتاح، بل من نجاح فحص اتصال فعلي.
 */

export type ProviderDomain = "payment" | "otp" | "whatsapp";

export const DOMAIN_LABELS: Record<ProviderDomain, string> = {
  payment: "بوابات الدفع",
  otp: "الرسائل وتوثيق الجوال",
  whatsapp: "واتساب الرسمي (WABA)",
};

/** حالة المزوّد كما تُعرض للمالك. */
export type ReadinessStatus =
  | "not_linked"
  | "incomplete"
  | "not_verified"
  | "connected"
  | "failed"
  | "disabled"
  | "not_required";

export const READINESS_LABELS: Record<ReadinessStatus, string> = {
  not_linked: "غير مربوط",
  incomplete: "بيانات ناقصة",
  not_verified: "بانتظار فحص الاتصال",
  connected: "متصل",
  failed: "فشل الاتصال",
  disabled: "مزوّد معطّل",
  not_required: "لا يحتاج ربطاً",
};

export const READINESS_TONES: Record<
  ReadinessStatus,
  "green" | "gold" | "red" | "muted" | "info" | "warn"
> = {
  not_linked: "muted",
  incomplete: "warn",
  not_verified: "info",
  connected: "green",
  failed: "red",
  disabled: "muted",
  not_required: "info",
};

export type ReadinessField = {
  key: string;
  label: string;
  present: boolean;
  required: boolean;
  /** تلميح مقنّع فقط — لا تعود القيمة الحقيقية للمتصفح أبداً. */
  hint: string | null;
};

export type ProviderReadiness = {
  domain: ProviderDomain;
  key: string;
  name: string;
  description: string | null;
  status: ReadinessStatus;
  isEnabled: boolean;
  /** فحص الاتصال متاح فقط عند اكتمال الحقول المطلوبة ووجود الصلاحية. */
  canVerify: boolean;
  verifyBlockedReason: string | null;
  fields: ReadinessField[];
  lastCheckedAt: string | null;
  lastError: string | null;
  manageTo: string;
  manageLabel: string;
};

export type ReadinessOverview = {
  providers: ProviderReadiness[];
  /** نطاقات تعذّر عرضها لعدم كفاية صلاحية الموظف. */
  restrictedDomains: ProviderDomain[];
};

export function missingFields(provider: ProviderReadiness): ReadinessField[] {
  return provider.fields.filter((field) => field.required && !field.present);
}

export function readinessSummary(providers: ProviderReadiness[]): Record<ReadinessStatus, number> {
  const base: Record<ReadinessStatus, number> = {
    not_linked: 0,
    incomplete: 0,
    not_verified: 0,
    connected: 0,
    failed: 0,
    disabled: 0,
    not_required: 0,
  };
  for (const provider of providers) base[provider.status] += 1;
  return base;
}
