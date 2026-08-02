/**
 * ثوابت ومساعدات طبقة تشفير الحقول الحساسة (PII) — آمنة للمتصفح.
 * لا تحتوي هذه الوحدة على أي مادة مفتاح ولا أي منطق تشفير؛ المفاتيح والتشفير
 * وفك التشفير تحدث على الخادم فقط.
 */

/** إصدار المفتاح النشط. أي تدوير يزيد الرقم ويحتفظ بالإصدارات السابقة للقراءة. */
export const ACTIVE_PII_KEY_VERSION = 1;

/** بادئة النص المشفّر: mhl.<إصدار>.<iv>.<ciphertext> */
export const CIPHERTEXT_PREFIX = "mhl.";

export type PiiField = "national_id" | "commercial_registration";

export const PII_FIELD_LABEL: Record<PiiField, string> = {
  national_id: "رقم الهوية",
  commercial_registration: "السجل التجاري",
};

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** يحوّل الأرقام العربية/الهندية إلى لاتينية ويحذف كل ما ليس حرفاً أو رقماً. */
export function normalizePiiValue(raw: string): string {
  return raw
    .replace(ARABIC_INDIC, (d) => {
      const code = d.charCodeAt(0);
      const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(code - base);
    })
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

export function isCiphertext(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(CIPHERTEXT_PREFIX);
}

/**
 * قناع العرض الافتراضي: آخر أربعة أرقام فقط. يُحسب من طول القيمة الأصلية
 * المخزّن مع النص المشفّر، أو من القيمة نفسها عند الكشف.
 */
export function maskPiiValue(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = normalizePiiValue(value);
  if (normalized.length <= 4) return "•".repeat(normalized.length || 4);
  return `${"•".repeat(Math.min(normalized.length - 4, 10))}${normalized.slice(-4)}`;
}
