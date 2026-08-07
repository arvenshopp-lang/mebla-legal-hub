/**
 * بوابة الويب هوك — أنواع وثوابت آمنة للمتصفح.
 * لا يحتوي هذا الملف أي سرّ ولا أي منطق تحقق؛ التحقق على الخادم فقط.
 */

export type WebhookVerificationMode = "hmac_sha256" | "shared_secret" | "url_token";

export const VERIFICATION_MODE_LABELS: Record<WebhookVerificationMode, string> = {
  hmac_sha256: "توقيع HMAC-SHA256 على الجسم الخام",
  shared_secret: "رمز سرّي في ترويسة الطلب",
  url_token: "سرّ داخل الرابط (لمزوّد لا يرسل ترويسات)",
};

/** اسم معامل السرّ في الرابط لوضع `url_token` (المسار القصير). */
export const WEBHOOK_URL_TOKEN_PARAM = "k";

/** الاسم القديم للمعامل — يبقى مقبولاً لأي مزوّد مرتبط سابقاً. */
export const WEBHOOK_URL_TOKEN_PARAM_LEGACY = "key";

export type WebhookEventStatus =
  | "received"
  | "processed"
  | "ignored"
  | "failed"
  | "dead_letter"
  | "unauthorized"
  | "rate_limited"
  | "replayed"
  | "duplicate";

export const EVENT_STATUS_LABELS: Record<WebhookEventStatus, string> = {
  received: "مستلَم",
  processed: "مُعالَج",
  ignored: "بلا معالج",
  failed: "فشل المعالجة",
  dead_letter: "فاشل نهائياً",
  unauthorized: "تحقق مرفوض",
  rate_limited: "تجاوز الحد",
  replayed: "إعادة إرسال",
  duplicate: "حدث مكرر",
};

export const EVENT_STATUS_TONES: Record<
  WebhookEventStatus,
  "green" | "gold" | "red" | "muted" | "info"
> = {
  received: "info",
  processed: "green",
  ignored: "muted",
  failed: "red",
  dead_letter: "red",
  unauthorized: "red",
  rate_limited: "gold",
  replayed: "gold",
  duplicate: "muted",
};

export const ADAPTER_LABELS: Record<string, string> = {
  whatsline: "Whats Line Official API",
  generic_json: "مزوّد عام (JSON)",
};

/** عرض المزوّد كما يصل للمتصفح — لا يحتوي السرّ أبداً، بل تلميحاً مقنّعاً فقط. */
export type WebhookEndpointView = {
  id: string;
  slug: string;
  displayName: string;
  adapterType: string;
  verificationMode: WebhookVerificationMode;
  signatureHeader: string;
  timestampHeader: string | null;
  isEnabled: boolean;
  testMode: boolean;
  rateLimitPerMinute: number;
  hasSecret: boolean;
  secretHint: string | null;
  secretRotatedAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  notes: string | null;
  createdAt: string;
  url: string;
  eventsTotal: number;
  eventsFailed: number;
  latestEventStatus: WebhookEventStatus | null;
  latestEventAt: string | null;
};

export type WebhookConnectionTestResult = {
  ok: boolean;
  status: number;
  testedAt: string;
  message: string;
};

/** قيمة قابلة للتسلسل — الحمولة المنقّحة تُعاد للمتصفح بهذا الشكل فقط. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type WebhookEventView = {
  id: string;
  slug: string;
  adapterType: string | null;
  eventType: string | null;
  providerEventId: string | null;
  status: WebhookEventStatus;
  attempts: number;
  signatureValid: boolean;
  replayDetected: boolean;
  rejectReason: string | null;
  lastError: string | null;
  correlationId: string;
  receivedAt: string;
  processedAt: string | null;
  redactedPayload: Record<string, JsonValue>;
};

/** إخفاء أرقام الجوال: يظهر آخر ثلاث خانات فقط. */
export function maskPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 4) return "•••";
  return `${"•".repeat(Math.max(3, digits.length - 3))}${digits.slice(-3)}`;
}

/** تلميح مقنّع لسرّ التحقق — لا تُعاد القيمة الأصلية للمتصفح بعد الإنشاء. */
export function maskWebhookSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export const WEBHOOK_SECRET_FIELD = "webhook_signing_secret";

/** أصل الروابط العامة التي تُعطى للمزوّدين الخارجيين. */
export const WEBHOOK_PUBLIC_ORIGIN = "https://mehlalex.com";

/** المسار القصير — بعض المزوّدين يحدّون طول عمود الرابط لديهم. */
export const WEBHOOK_PATH_PREFIX = "/api/public/wh";

/** المسار الطويل الأصلي — يبقى يعمل للتوافق مع أي ربط قائم. */
export const WEBHOOK_LEGACY_PATH_PREFIX = "/api/public/webhooks";

/** رابط الاستقبال كما يُلصق في لوحة المزوّد. مع المفتاح في وضع `url_token` فقط. */
export function buildWebhookUrl(slug: string, secret?: string | null): string {
  const base = `${WEBHOOK_PUBLIC_ORIGIN}${WEBHOOK_PATH_PREFIX}/${slug}`;
  return secret ? `${base}?${WEBHOOK_URL_TOKEN_PARAM}=${encodeURIComponent(secret)}` : base;
}
