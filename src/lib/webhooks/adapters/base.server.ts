/**
 * عقد المُحوِّلات — الطبقة الوحيدة التي تُضاف عند ربط مزوّد جديد.
 * المُحوِّل لا يتحقق من الهوية ولا يكتب في قاعدة البيانات: مسؤوليته الترجمة فقط.
 */

/** الحدث الموحّد داخل مِهلة — أي مزوّد يُترجم إلى هذا الشكل. */
export type NormalizedWebhookEvent = {
  /** نوع الحدث الموحّد، مثل `message.received`. */
  type: string;
  /** معرّف الحدث لدى المزوّد — أساس منع التكرار. */
  providerEventId: string | null;
  /** زمن وقوع الحدث عند المزوّد بصيغة ISO إن توفّر. */
  occurredAt: string | null;
  /** موضوع الحدث بشكل منقّح (رقم مقنّع أو معرّف محادثة) للعرض في السجل. */
  subject: string | null;
  /** بيانات الحدث الموحّدة — تُستهلك من المعالجات الداخلية. */
  data: Record<string, unknown>;
};

export interface WebhookAdapter {
  readonly adapterType: string;
  /** تحويل الحمولة الخام إلى صفر أو أكثر من الأحداث الموحّدة. */
  normalize(payload: unknown): NormalizedWebhookEvent[];
  /** نسخة منقّحة من الحمولة تُخزَّن في السجل (بدون أرقام كاملة أو أسرار). */
  redact(payload: unknown): Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|authorization|apikey|api_key|signature|access_key)/i;
const PHONE_KEY_PATTERN = /(phone|mobile|msisdn|whatsapp|recipient|from|to|wa_id|number)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * تنقية عامة تعمل مع أي مزوّد: حجب الأسرار، وتقنيع أي حقل يشبه رقم جوال،
 * وقص النصوص الطويلة، وتحديد العمق وعدد العناصر لمنع تضخّم السجل.
 */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[عمق أقصى]";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactPayload(item, depth + 1));
  if (!isPlainObject(value)) return "[غير مدعوم]";

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 60)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[محجوب]";
      continue;
    }
    if (PHONE_KEY_PATTERN.test(key) && typeof raw === "string" && /\d{6,}/.test(raw)) {
      const digits = raw.replace(/[^\d]/g, "");
      out[key] = `•••${digits.slice(-3)}`;
      continue;
    }
    out[key] = redactPayload(raw, depth + 1);
  }
  return out;
}

export function redactRecord(value: unknown): Record<string, unknown> {
  const result = redactPayload(value);
  return isPlainObject(result) ? result : { value: result };
}

export function readString(source: unknown, ...keys: string[]): string | null {
  if (!isPlainObject(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function readObject(source: unknown, key: string): Record<string, unknown> | null {
  if (!isPlainObject(source)) return null;
  const value = source[key];
  return isPlainObject(value) ? value : null;
}

/** توحيد الطابع الزمني: يقبل ISO أو ثوانٍ أو ميلي ثانية. */
export function toIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.length <= 11 ? Number(value) * 1000 : value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}