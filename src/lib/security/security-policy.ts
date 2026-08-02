/**
 * سياسة الأمان المشتركة (آمنة للمتصفح): تصنيف العمليات الحساسة لأغراض
 * التسجيل والتدقيق فقط. التحقق بخطوتين اختياري تماماً ولا يُفرض على أي عملية —
 * الفرض الحقيقي يعتمد على دور المستخدم وصلاحياته على الخادم.
 */

/** العمليات الحساسة داخل مكتب المحاماة (تُسجَّل في سجل التدقيق). */
export type SensitiveOperation =
  | "pii.reveal"
  | "documents.download"
  | "documents.print"
  | "documents.export"
  | "documents.share"
  | "security.settings"
  | "team.manage";

export const SENSITIVE_OPERATION_LABELS: Record<SensitiveOperation, string> = {
  "pii.reveal": "كشف رقم الهوية أو السجل التجاري",
  "documents.download": "تنزيل المستندات",
  "documents.print": "طباعة المستندات",
  "documents.export": "تصدير المستندات",
  "documents.share": "مشاركة المستندات",
  "security.settings": "تعديل إعدادات الأمان ومفاتيح التشفير",
  "team.manage": "إدارة المستخدمين والصلاحيات",
};

/** نصوص التحقق بخطوتين — ميزة اختيارية لتعزيز الحماية عند تسجيل الدخول فقط. */
export const MFA_OPTIONAL_HEADLINE = "التحقق بخطوتين — اختياري";
export const MFA_OPTIONAL_INVITE = "عزز حماية حسابك بتفعيل التحقق بخطوتين";
export const MFA_OPTIONAL_NOTE =
  "التحقق بخطوتين يضيف طبقة حماية إضافية عند تسجيل الدخول، لكنه غير مطلوب لاستخدام المنصة.";

/** حدود الكشف عن البيانات الحساسة لكل مستخدم. */
export const PII_REVEAL_LIMITS = {
  perTenMinutes: 8,
  perHour: 25,
  /** مدة إظهار القيمة في الواجهة قبل إخفائها تلقائياً (ثانية). */
  autoHideSeconds: 45,
  minReasonLength: 8,
} as const;