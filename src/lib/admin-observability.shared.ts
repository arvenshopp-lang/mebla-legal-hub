/** أنواع مشتركة للبحث العالمي وسجل النشاط ولوحة المراقبة في لوحة إدارة المنصة. */

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type SearchGroupKey =
  | "organizations"
  | "users"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "tickets"
  | "mail"
  | "pages"
  | "staff"
  | "logs";

export type SearchGroup = { key: SearchGroupKey; label: string; hits: SearchHit[] };

export type GlobalSearchResult = {
  query: string;
  groups: SearchGroup[];
  /** الأقسام التي استُثنيت لعدم توفر الصلاحية — تُعرض للموظف بشفافية. */
  restricted: string[];
};

export const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  organizations: "المكاتب",
  users: "المستخدمون",
  subscriptions: "الاشتراكات",
  invoices: "الفواتير",
  payments: "المدفوعات",
  tickets: "التذاكر",
  mail: "البريد",
  pages: "الصفحات",
  staff: "الموظفون",
  logs: "سجل التدقيق",
};

export type ActivitySource = "admin" | "tenant" | "failure";

/**
 * تصنيف مُنظّم لسبب العطل يُعرض للموظف بلغة عربية واضحة دون أي تفاصيل تقنية
 * أو نصوص المزوّد الخام.
 */
export type FailureKind = "permanent" | "retryable" | "unknown";

export type FailureDetail = {
  code: string;
  codeLabel: string;
  statusLabel: string;
  kind: FailureKind;
  kindLabel: string;
  advice: string;
};

export const FAILURE_KIND_LABELS: Record<FailureKind, string> = {
  permanent: "فشل نهائي — لا إعادة محاولة",
  retryable: "فشل مؤقت — تُعاد المحاولة",
  unknown: "سبب غير مصنّف",
};

/** رموز الأعطال المعروفة: عنوان عربي + إرشاد عملي. */
const FAILURE_CODES: Record<string, { label: string; advice: string; kind: FailureKind }> = {
  recipient_suppressed: {
    label: "عنوان المستلم موقوف عن الاستقبال",
    advice: "أُوقف العنوان بسبب ارتداد أو شكوى أو إلغاء اشتراك سابق. اطلب من المستلم تأكيد رغبته في الاستقبال أو استخدم عنواناً بديلاً.",
    kind: "permanent",
  },
  invalid_recipient: {
    label: "عنوان المستلم غير صالح",
    advice: "راجع صحة كتابة البريد في بيانات المكتب أو التذكرة ثم أعد الإرسال.",
    kind: "permanent",
  },
  invalid_sender: {
    label: "عنوان المُرسِل غير مقبول",
    advice: "تأكد من أن صندوق الإرسال مربوط بنطاق موثّق في مركز التكاملات.",
    kind: "permanent",
  },
  email_not_configured: {
    label: "خدمة البريد غير مهيأة",
    advice: "أكمل إعداد صندوق البريد ومفاتيح المزوّد قبل إعادة الإرسال.",
    kind: "permanent",
  },
  domain_not_verified: {
    label: "نطاق الإرسال غير موثّق",
    advice: "أكمل توثيق النطاق، ثم ستُرسل الرسائل تلقائياً.",
    kind: "permanent",
  },
  rate_limited: {
    label: "تجاوز حد الإرسال المسموح",
    advice: "الإرسال مؤجّل تلقائياً حتى انتهاء المهلة، ولا يلزم أي إجراء.",
    kind: "retryable",
  },
  timeout: {
    label: "انتهت مهلة الاتصال بالمزوّد",
    advice: "ستُعاد المحاولة تلقائياً بتراجع زمني متزايد.",
    kind: "retryable",
  },
  provider_error: {
    label: "عطل مؤقت في خدمة الإرسال",
    advice: "ستُعاد المحاولة تلقائياً. إن تكرر لأكثر من ساعة فراجع حالة المزوّد.",
    kind: "retryable",
  },
};

/** وصف حالة HTTP بصياغة عربية دون كشف نص المزوّد. */
function statusLabelOf(status: number | null): string {
  if (status === null) return "بدون رمز حالة";
  if (status === 401 || status === 403) return `${status} · رفض صلاحية أو حجب من الخدمة`;
  if (status === 404) return `${status} · العنصر المطلوب غير موجود عند المزوّد`;
  if (status === 408) return `${status} · انتهت المهلة`;
  if (status === 422) return `${status} · بيانات الطلب غير مقبولة`;
  if (status === 429) return `${status} · تجاوز حد الإرسال`;
  if (status >= 400 && status < 500) return `${status} · طلب مرفوض نهائياً`;
  if (status >= 500) return `${status} · عطل مؤقت في الخدمة`;
  return String(status);
}

export function classifyFailure(
  code: string | null,
  httpStatus: number | null,
  permanentHint?: boolean | null,
): FailureDetail {
  const key = (code ?? "").trim();
  const known = FAILURE_CODES[key];
  const retryableStatus = httpStatus === 408 || httpStatus === 429;
  const kind: FailureKind =
    known?.kind ??
    (permanentHint === true
      ? "permanent"
      : permanentHint === false
        ? "retryable"
        : httpStatus !== null && httpStatus >= 400 && httpStatus < 500 && !retryableStatus
          ? "permanent"
          : httpStatus !== null && (httpStatus >= 500 || retryableStatus)
            ? "retryable"
            : "unknown");
  return {
    code: key || "—",
    codeLabel: known?.label ?? "سبب غير معروف — راجع مرجع العطل مع الفريق التقني",
    statusLabel: statusLabelOf(httpStatus),
    kind,
    kindLabel: FAILURE_KIND_LABELS[kind],
    advice:
      known?.advice ??
      (kind === "retryable"
        ? "ستُعاد المحاولة تلقائياً، ولا يلزم إجراء فوري."
        : "أرفق مرجع العطل عند التصعيد للفريق التقني."),
  };
}

/** مفاتيح لا تُنقل إلى المتصفح إطلاقاً (نصوص مزوّد أو أثر تقني). */
export const HIDDEN_METADATA_KEYS = new Set([
  "provider_message",
  "provider_response",
  "raw_error",
  "stack",
  "user_agent",
  "token",
  "access_token",
  "authorization",
]);

/** أسماء عربية لمفاتيح البيانات الإضافية المعروفة. */
export const METADATA_LABELS: Record<string, string> = {
  attempts: "عدد المحاولات",
  recipients: "عدد المستلمين",
  message_id: "معرّف الرسالة",
  organization_id: "معرّف المكتب",
  request_id: "معرّف الطلب",
  correlation_id: "معرّف الارتباط",
  path: "المسار",
  http_status: "رمز الحالة",
  error_code: "رمز العطل",
  permanent: "فشل نهائي",
  origin: "المصدر",
};

export type ActivityEvent = {
  id: string;
  source: ActivitySource;
  action: string;
  actor: string;
  entityType: string;
  entityId: string | null;
  description: string;
  ip: string | null;
  device: string | null;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
  /** يُملأ لأحداث الأعطال فقط. */
  failure?: FailureDetail;
};

export type ActivityFeed = { events: ActivityEvent[]; total: number; hasMore: boolean };

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  admin: "عملية إدارية",
  tenant: "نشاط مكتب",
  failure: "عطل مسجّل",
};

export type QueueSnapshot = {
  key: string;
  label: string;
  pending: number;
  failed: number;
  done24h: number;
  oldestPendingAt: string | null;
  /** توضيح لمصدر الرقم حتى لا تُقرأ الأصفار على أنها تعطل. */
  note: string;
};

export type MonitoringSnapshot = {
  checkedAt: string;
  latency: {
    database: number;
    storage: number;
    slowestIntegration: { name: string; ms: number } | null;
  };
  queues: QueueSnapshot[];
  storage: { documents: number; bytes: number };
  sessions: { active24h: number; total: number; revoked30d: number };
  security: {
    adminOps24h: number;
    failures24h: number;
    blockedLookups24h: number;
    lastFailureRef: string | null;
  };
  integrations: { checks24h: number; failures24h: number; lastCheckAt: string | null };
};
