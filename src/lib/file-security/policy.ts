/**
 * سياسة أمن الملفات المشتركة (متصفح + خادم).
 *
 * القاعدة الحاكمة: أي ملف عدائي حتى يثبت العكس (Fail-Closed). لا تُسلَّم بايتات
 * أي مستند لأي مستهلك قبل قرار إفراج صريح مرتبط ببصمة محتوى ومعرّف قرار.
 */

/** الحالات الأمنية للمستند — مطابقة لنوع قاعدة البيانات. */
export const DOCUMENT_SECURITY_STATES = [
  "uploaded",
  "quarantined",
  "scanning",
  "clean",
  "malicious",
  "unscannable",
  "failed",
  "released",
] as const;

export type DocumentSecurityState = (typeof DOCUMENT_SECURITY_STATES)[number];

/**
 * غرض التسليم. كل غرض يجب أن يُصرَّح به عند كل طلب بايتات، ويُسجَّل في السجل
 * الأمني حتى يبقى الأثر قابلاً للتدقيق.
 */
export type ReleasePurpose =
  | "view" /* عرض مائي داخلي */
  | "share" /* رابط مشاركة خارجي */
  | "print" /* طباعة مختومة */
  | "download" /* تنزيل نسخة مائية */
  | "process" /* استخراج نص / OCR داخلي */
  | "email_attachment"; /* تسليم مرفق بريد */

/** الحالة الوحيدة التي تسمح بتسليم البايتات لأي غرض. */
export const RELEASABLE_STATES: readonly DocumentSecurityState[] = ["released"];

/**
 * أغراض تُسلَّم فيها البايتات الأصلية الخام دون ختم. تبقى مسموحة داخلياً فقط،
 * ولا يجوز أن تُعاد إلى متصفح أو رابط عام.
 */
export const RAW_BYTE_PURPOSES: readonly ReleasePurpose[] = ["process"];

/** حدود استهلاك صارمة لحماية الموارد (منع إنهاك الخدمة). */
export const FILE_SECURITY_LIMITS = {
  /** أقصى حجم كائن يُقرأ داخل الطلب. */
  maxBytes: 20 * 1024 * 1024,
  /** أقصى عدد بايتات تُقرأ لفحص البصمة البنيوية. */
  headerBytes: 8 * 1024,
  /** أقصى عدد محاولات فحص قبل اعتبار الملف غير قابل للفحص. */
  maxScanAttempts: 3,
  /** أقصى عدد كائنات يزيلها التنظيف في مرور واحد لكل مكتب. */
  cleanupMaxObjectsPerOrg: 500,
} as const;

/** رسالة موحّدة للمستخدم عند منع التسليم — بلا تفاصيل داخلية. */
export const RELEASE_DENIED_MESSAGE =
  "هذا الملف غير متاح حالياً لأسباب أمنية. يخضع الملف للفحص، وسيتاح بعد اكتمال الفحص.";

export const RELEASE_MALICIOUS_MESSAGE =
  "تم منع هذا الملف لأسباب أمنية بعد فشل فحص المحتوى، ولا يمكن عرضه أو تنزيله.";

/** رسالة المستخدم المناسبة لكل حالة أمنية. */
export function releaseDenialMessage(state: DocumentSecurityState): string {
  return state === "malicious" ? RELEASE_MALICIOUS_MESSAGE : RELEASE_DENIED_MESSAGE;
}