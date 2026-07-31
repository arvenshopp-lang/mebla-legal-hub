/**
 * فحص كلمات المرور المسرّبة بنموذج k-anonymity.
 * المتصفح يحسب SHA-1 محلياً ولا يرسل إلا أول 5 أحرف من التجزئة إلى الخادم،
 * والخادم يجلب قائمة اللواحق من Have I Been Pwned. لا تُسجَّل كلمة المرور
 * ولا التجزئة الكاملة في أي طرف.
 */

export type PasswordBreachStatus = "idle" | "checking" | "safe" | "breached" | "unavailable";

export const HIBP_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";

export async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** يبحث عن اللاحقة داخل نص استجابة النطاق ويعيد عدد مرات الظهور. */
export function countBreachesInRange(rangeBody: string, suffix: string): number {
  for (const line of rangeBody.split("\n")) {
    const [hashSuffix, count] = line.trim().split(":");
    if (hashSuffix && hashSuffix.toUpperCase() === suffix) return Number(count) || 1;
  }
  return 0;
}

export function isValidHashPrefix(prefix: string): boolean {
  return /^[0-9A-F]{5}$/.test(prefix);
}
