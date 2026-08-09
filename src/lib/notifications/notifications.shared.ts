/**
 * محرك الإشعارات — أنواع وثوابت آمنة للمتصفح.
 * لا يحتوي أي سرّ ولا أي منطق اتصال؛ الاتصال بالمزوّد من الخادم فقط.
 */

export const NOTIFICATION_CHANNEL = "whatsapp" as const;
export const WHATSAPP_PROVIDER = "whatsline" as const;

/** الأحداث المدعومة في المرحلة الأولى — تُولَّد من Triggers قاعدة البيانات. */
export const NOTIFICATION_EVENT_TYPES = [
  "case.created",
  "case.status_changed",
  "case.closed",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  "case.created": "إنشاء قضية",
  "case.status_changed": "تغيير حالة القضية",
  "case.closed": "إغلاق القضية",
};

export function eventTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return EVENT_TYPE_LABELS[value] ?? value;
}

/** حالات الطابور — «مقبولة من المزوّد» وليست «تم التسليم». */
export type QueueStatus =
  | "queued"
  | "scheduled"
  | "processing"
  | "provider_accepted"
  | "failed"
  | "cancelled";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  queued: "في الطابور",
  scheduled: "مجدولة",
  processing: "قيد الإرسال",
  provider_accepted: "مقبولة من المزوّد",
  failed: "فاشلة",
  cancelled: "ملغاة",
};

export const QUEUE_STATUS_TONES: Record<QueueStatus, "green" | "gold" | "red" | "muted" | "info"> =
  {
    queued: "info",
    scheduled: "info",
    processing: "gold",
    provider_accepted: "green",
    failed: "red",
    cancelled: "muted",
  };

export const PROVIDER_STATUS_LABELS: Record<string, string> = {
  not_configured: "غير مهيأ",
  connected: "متصل",
  degraded: "اتصال متدهور",
  failed: "فشل الاتصال",
  disabled: "معطّل",
};

/** رموز أخطاء المزوّد المطبّعة ورسائلها العربية الآمنة. */
export const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
  AUTH_FAILED: "تعذّر التحقق من بيانات ربط المزوّد.",
  INVALID_PHONE: "رقم الجوال غير صالح للإرسال.",
  TEMPLATE_NOT_FOUND: "القالب غير موجود أو غير معتمد عند المزوّد.",
  DEVICE_OFFLINE: "الجهاز/المُرسِل الرسمي غير متصل.",
  RATE_LIMITED: "المزوّد رفض الطلب لتجاوز الحد المسموح.",
  TIMEOUT: "انتهت مدة الانتظار قبل استجابة المزوّد.",
  PROVIDER_5XX: "المزوّد أرجع خطأً داخلياً.",
  INVALID_REQUEST: "المزوّد رفض بيانات الطلب.",
  NETWORK_ERROR: "تعذّر الوصول إلى المزوّد.",
  UNKNOWN_PROVIDER_ERROR: "المزوّد أرجع خطأً غير متوقع.",
  MISSING_CREDENTIALS: "أسرار ربط المزوّد غير مكتملة على الخادم.",
  ENDPOINT_NOT_FOUND: "لم يُعرَف مسار متوافق عند المزوّد لهذه العملية.",
  /* أخطاء تهيئة داخلية — لا علاقة لها بالمزوّد */
  PROVIDER_DISABLED: "تكامل واتساب معطّل في لوحة الإدارة.",
  RULE_DISABLED: "قاعدة الإشعار غير مفعّلة لهذا المكتب.",
  MAPPING_MISSING: "لا يوجد ربط قالب معتمد لهذا الحدث.",
  MAPPING_DISABLED: "ربط القالب موجود لكنه غير مفعّل.",
  VARIABLE_MISMATCH: "عدد متغيرات القالب لا يطابق الربط المحدد.",
  DEVICE_MISSING: "لم يُحدَّد جهاز/مُرسِل رسمي افتراضي.",
  RECIPIENT_OPTED_OUT: "المستلم أوقف إشعارات واتساب.",
  PHONE_MISSING: "لا يوجد رقم جوال صالح للمستلم.",
  TEST_PHONE_MISSING: "وضع الاختبار مفعّل بلا رقم اختبار مصرّح.",
  TEST_MODE_BLOCKED: "وضع الاختبار يمنع الإرسال لغير رقم الاختبار.",
  ENTITY_MISSING: "الكيان المرتبط بالحدث غير موجود.",
  ORG_HOURLY_LIMIT: "تجاوز حد الإرسال للمكتب في الساعة.",
  RECIPIENT_HOURLY_LIMIT: "تجاوز حد الإرسال للمستلم في الساعة.",
  PROVIDER_HOURLY_LIMIT: "تجاوز حد الإرسال العام في الساعة.",
  COOLDOWN: "أُلغيت لتقارب الأحداث ضمن فترة التهدئة.",
  MAX_ATTEMPTS: "استُنفدت المحاولات المسموحة.",
};

export function providerErrorMessage(code: string | null | undefined): string {
  if (!code) return "تعذّر إكمال العملية.";
  return PROVIDER_ERROR_MESSAGES[code] ?? "تعذّر إكمال العملية.";
}

/** المتغيرات المسموح استخدامها في ربط القوالب — لا بيانات حساسة. */
export const TEMPLATE_VARIABLE_TOKENS = [
  "client.first_name",
  "client.display_name",
  "case.safe_reference",
  "case.status_label",
  "case.court_name",
  "organization.name",
  "track.code",
] as const;

export type TemplateVariableToken = (typeof TEMPLATE_VARIABLE_TOKENS)[number];

export const TEMPLATE_VARIABLE_LABELS: Record<TemplateVariableToken, string> = {
  "client.first_name": "الاسم الأول للعميل",
  "client.display_name": "اسم العميل المعروض",
  "case.safe_reference": "رقم القضية المعروض",
  "case.status_label": "حالة القضية بالعربية",
  "case.court_name": "اسم المحكمة",
  "organization.name": "اسم المكتب",
  "track.code": "رمز متابعة القضية (10 أرقام)",
};

export function isTemplateVariableToken(value: string): value is TemplateVariableToken {
  return (TEMPLATE_VARIABLE_TOKENS as readonly string[]).includes(value);
}

/* ------------------------------------------------------ تطبيع أرقام الجوال */

export type PhoneNormalizationResult =
  | { ok: true; e164: string; digits: string }
  | { ok: false; reason: string };

/**
 * تطبيع مركزي إلى E.164 السعودي: يقبل `05…` و`5…` و`9665…` و`+9665…`.
 * الأرقام غير السعودية الصحيحة دولياً تُقبل كما هي إن بدأت بـ `+` وطولها منطقي.
 */
export function normalizePhone(input: string | null | undefined): PhoneNormalizationResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "الرقم غير موجود." };
  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return { ok: false, reason: "الرقم لا يحتوي أرقاماً." };

  let national: string | null = null;
  if (digits.startsWith("966")) national = digits.slice(3);
  else if (digits.startsWith("00966")) national = digits.slice(5);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else if (digits.startsWith("5")) national = digits;

  if (national !== null) {
    if (/^5\d{8}$/.test(national)) {
      return { ok: true, e164: `+966${national}`, digits: `966${national}` };
    }
    if (!hadPlus || digits.startsWith("966")) {
      return { ok: false, reason: "رقم الجوال السعودي يجب أن يكون 9 خانات تبدأ بـ 5." };
    }
  }

  if (hadPlus && digits.length >= 8 && digits.length <= 15) {
    return { ok: true, e164: `+${digits}`, digits };
  }
  return { ok: false, reason: "صيغة الرقم غير مدعومة." };
}

/** إخفاء الرقم في الواجهة والسجلات: آخر ثلاث خانات فقط. */
export function maskPhoneValue(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (digits.length < 4) return "•••";
  return `${"•".repeat(Math.max(3, digits.length - 3))}${digits.slice(-3)}`;
}

/* --------------------------------------------------------------- عروض العرض */

export type WhatsAppProviderStateView = {
  provider: string;
  isEnabled: boolean;
  testMode: boolean;
  testPhoneMasked: string | null;
  hasTestPhone: boolean;
  defaultDeviceId: string | null;
  status: string;
  statusLabel: string;
  devicesCount: number;
  templatesCount: number;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  perOrgHourlyLimit: number;
  perRecipientHourlyLimit: number;
  providerHourlyLimit: number;
  credentialsReady: boolean;
};

export type WhatsAppDeviceView = {
  id: string;
  providerDeviceId: string;
  phoneMasked: string | null;
  displayName: string | null;
  status: string | null;
  isDefault: boolean;
  lastSyncedAt: string;
};

export type WhatsAppTemplateView = {
  id: string;
  providerTemplateId: string;
  providerDeviceId: string | null;
  name: string;
  language: string | null;
  category: string | null;
  status: string | null;
  body: string | null;
  bodyVariableCount: number;
  buttonVariableCount: number;
  lastSyncedAt: string;
};

export type TemplateMappingView = {
  id: string;
  eventType: string;
  eventLabel: string;
  internalTemplateKey: string;
  providerTemplateId: string | null;
  providerTemplateName: string | null;
  providerDeviceId: string | null;
  bodyVariableMapping: string[];
  buttonVariableMapping: string[];
  isEnabled: boolean;
  updatedAt: string;
};

export type QueueRowView = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  eventType: string;
  eventLabel: string;
  status: QueueStatus;
  statusLabel: string;
  recipientType: string;
  recipientPhoneMasked: string | null;
  providerTemplateId: string | null;
  isTest: boolean;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  acceptedAt: string | null;
  failedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  latencyMs: number | null;
  createdAt: string;
};

export type QueueStats = {
  total: number;
  queued: number;
  accepted: number;
  failed: number;
  cancelled: number;
  successRate: number;
  avgLatencyMs: number | null;
  failuresByCode: { code: string; label: string; count: number }[];
};

export type ProviderActionResult = {
  ok: boolean;
  message: string;
  statusCode: number | null;
  latencyMs: number | null;
  detail: string | null;
};

export type SyncResult = ProviderActionResult & { synced: number };
