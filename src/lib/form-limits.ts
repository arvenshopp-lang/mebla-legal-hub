import { z } from "zod";

/**
 * حدود الإدخال الموحّدة لنماذج المنصة.
 * تُستخدم في `maxLength` على مستوى المدخلات وفي مخططات Zod لضمان تطابق الحدين.
 */
export const FIELD_LIMITS = {
  title: 200,
  name: 150,
  court: 150,
  shortText: 80,
  email: 255,
  phone: 20,
  location: 200,
  url: 500,
  result: 1000,
  notes: 2000,
} as const;

/** رسالة الخطأ الموحّدة لروابط الجلسات عن بُعد. */
export const REMOTE_LINK_ERROR = "يرجى إدخال رابط جلسة صحيح يبدأ بـ https://";

/** يتحقق أن النص رابط HTTPS صحيح. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** حقل رابط اختياري يُلزم بصيغة https:// عند وجود قيمة. */
export const optionalHttpsUrlSchema = z
  .string()
  .trim()
  .max(FIELD_LIMITS.url)
  .optional()
  .nullable()
  .refine((v) => !v || isHttpsUrl(v), { message: REMOTE_LINK_ERROR });
