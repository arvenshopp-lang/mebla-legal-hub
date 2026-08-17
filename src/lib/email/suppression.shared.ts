/**
 * حجب المستلمين — العقود المشتركة (مملوكة لمِهلة، مستقلة عن أي مزوّد).
 *
 * لا وصول لقاعدة بيانات ولا لمزوّد بريد في هذا الملف، فيصلح للاختبار المباشر.
 * التطبيع (trim + lowercase) هو المرجع الوحيد للمقارنة والبحث.
 */

/** أسباب الحجب المسموح بها — مطابقة تماماً لقيد CHECK في القاعدة. */
export const SUPPRESSION_REASONS = ["bounce_hard", "complaint", "manual", "unsubscribe"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export function isSuppressionReason(value: string): value is SuppressionReason {
  return (SUPPRESSION_REASONS as readonly string[]).includes(value);
}

/** أسباب لا يجوز رفعها ذاتياً من الواجهة: الشكوى دليل قانوني على رفض المستلم. */
export const NON_LIFTABLE_REASONS: readonly SuppressionReason[] = ["complaint"];

export function isLiftableReason(reason: SuppressionReason): boolean {
  return !NON_LIFTABLE_REASONS.includes(reason);
}

/**
 * فئات البريد التي يمس الحجب. رسائل المصادقة/الأمان خارج هذا النموذج تماماً
 * (لا تُطبَّق عليها دلالات إلغاء الاشتراك) ولذلك لا تظهر هنا.
 */
export const SUPPRESSION_CATEGORIES = [
  "human_mail",
  "team_invitation",
  "notification",
  "sales",
  "billing",
] as const;
export type SuppressionCategory = (typeof SUPPRESSION_CATEGORIES)[number];

/**
 * أي أسباب تمنع الإرسال لكل فئة:
 * - الارتداد الصلب والشكوى يمنعان كل شيء (سلامة تسليم وسمعة النطاق).
 * - الحجب اليدوي قرار تشغيلي يمنع كل شيء أيضاً.
 * - إلغاء الاشتراك اختياري: لا يمنع الفواتير الإلزامية تعاقدياً.
 */
const CATEGORY_BLOCKING_REASONS: Record<SuppressionCategory, readonly SuppressionReason[]> = {
  human_mail: ["bounce_hard", "complaint", "manual", "unsubscribe"],
  team_invitation: ["bounce_hard", "complaint", "manual"],
  notification: ["bounce_hard", "complaint", "manual", "unsubscribe"],
  sales: ["bounce_hard", "complaint", "manual", "unsubscribe"],
  billing: ["bounce_hard", "complaint", "manual"],
};

export function blocksCategory(reason: SuppressionReason, category: SuppressionCategory): boolean {
  return CATEGORY_BLOCKING_REASONS[category].includes(reason);
}

/** التطبيع الكنسي للعنوان: تقليم ثم تحويل لأحرف صغيرة. لا تعديل آخر. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function looksLikeAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  return normalized.includes("@") && !/\s/.test(normalized);
}

/** تقنيع العنوان لأي سجل تشغيلي — لا يُطبع العنوان الخام أبداً. */
export function maskAddress(address: string): string {
  const normalized = normalizeAddress(address);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${normalized.slice(0, Math.min(2, at))}•••${normalized.slice(at)}`;
}

/**
 * هل رفض النقل يستوجب حجباً صلباً؟ فقط رفض نهائي خاص بالمستلم:
 * - SMTP: رمز 5xx مع رفض المستلم.
 * - HTTP: رفض المزوّد للمستلم برمز 400 أو 422 (رد فعلي من المزوّد).
 * المهل الزمنية وأعطال الاتصال والمصادقة و4xx المؤقتة لا تُنتج حجباً إطلاقاً،
 * وكذلك غياب المستلم محلياً (بلا رد من المزوّد) لا يُنتج حجباً.
 */
export function qualifiesAsHardBounce(input: {
  errorCode: string;
  smtpCode: number | null | undefined;
}): boolean {
  const code = input.smtpCode;
  if (input.errorCode === "smtp_rejected_recipient") {
    return typeof code === "number" && code >= 500 && code < 600;
  }
  if (input.errorCode === "mail_http_rejected_recipient") {
    return code === 400 || code === 422;
  }
  return false;
}
