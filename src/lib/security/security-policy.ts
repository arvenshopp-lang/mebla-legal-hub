/**
 * سياسة الأمان المشتركة (آمنة للمتصفح): أي دور يلزمه تحقق بخطوتين (AAL2)،
 * وأي عملية تُعدّ حساسة. الواجهة تستخدمها للإرشاد فقط — الفرض الحقيقي على الخادم.
 */
import type { AppRole } from "@/hooks/use-auth";

/** الأدوار التي يجب أن تكون جلستها AAL2 لتنفيذ العمليات الحساسة. */
export const MFA_REQUIRED_ROLES: AppRole[] = ["owner", "admin", "lawyer", "legal_assistant"];

export function roleRequiresMfa(role: AppRole | null | undefined): boolean {
  return Boolean(role && MFA_REQUIRED_ROLES.includes(role));
}

/** العمليات الحساسة داخل مكتب المحاماة. */
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

export const MFA_REQUIRED_CODE = "MEHLA_MFA_REQUIRED";

/** رسالة موحّدة تُعرض للمستخدم عند غياب التحقق بخطوتين. */
export function mfaRequiredMessage(operation: SensitiveOperation): string {
  return `${MFA_REQUIRED_CODE}: يتطلب «${SENSITIVE_OPERATION_LABELS[operation]}» تفعيل التحقق بخطوتين وتأكيده في هذه الجلسة. فعّله من الإعدادات ← الأمان.`;
}

export function isMfaRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(MFA_REQUIRED_CODE);
}

/** حدود الكشف عن البيانات الحساسة لكل مستخدم. */
export const PII_REVEAL_LIMITS = {
  perTenMinutes: 8,
  perHour: 25,
  /** مدة إظهار القيمة في الواجهة قبل إخفائها تلقائياً (ثانية). */
  autoHideSeconds: 45,
  minReasonLength: 8,
} as const;