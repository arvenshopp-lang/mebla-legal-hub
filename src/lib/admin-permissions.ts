/**
 * صلاحيات لوحة إدارة المنصة (Super Admin Portal).
 * ملاحظة أمنية: لا توجد — ولن توجد — أي صلاحية تمنح الوصول إلى بيانات العملاء
 * القانونية (القضايا، الجلسات، المستندات، العملاء). إدارة المنصة تشغيلية فقط.
 */

export type AdminPermission =
  | "tickets.view"
  | "tickets.reply"
  | "subscriptions.manage"
  | "plans.manage"
  | "staff.view"
  | "staff.manage"
  | "settings.manage"
  | "email.manage"
  | "seo.manage"
  | "content.manage"
  | "notifications.send"
  | "analytics.view"
  | "logs.view";

export interface PermissionDef {
  id: AdminPermission;
  label: string;
  group: string;
  description: string;
}

export const ADMIN_PERMISSIONS: PermissionDef[] = [
  { id: "tickets.view", label: "مشاهدة التذاكر", group: "الدعم الفني", description: "الاطلاع على تذاكر الدعم دون الرد عليها." },
  { id: "tickets.reply", label: "الرد على التذاكر", group: "الدعم الفني", description: "الرد على التذاكر وتغيير حالتها." },
  { id: "subscriptions.manage", label: "إدارة الاشتراكات", group: "الإيرادات", description: "تفعيل وتمديد وإلغاء اشتراكات المشتركين." },
  { id: "plans.manage", label: "إدارة الباقات", group: "الإيرادات", description: "إنشاء وتعديل الباقات وحدودها وأسعارها." },
  { id: "analytics.view", label: "التحليلات والتقارير", group: "الإيرادات", description: "الاطلاع على المؤشرات المالية والتشغيلية." },
  { id: "staff.view", label: "مشاهدة الموظفين", group: "الفريق", description: "عرض فريق إدارة المنصة وصلاحياتهم." },
  { id: "staff.manage", label: "إدارة الموظفين", group: "الفريق", description: "إضافة موظفين وتعديل صلاحياتهم وإيقافهم." },
  { id: "settings.manage", label: "الإعدادات العامة", group: "التشغيل", description: "إعدادات المنصة والهوية والروابط الرسمية." },
  { id: "email.manage", label: "إدارة البريد", group: "التشغيل", description: "البريد الرسمي وقوالب الرسائل." },
  { id: "seo.manage", label: "إدارة SEO", group: "التشغيل", description: "الوسوم والفهرسة وأكواد التحقق." },
  { id: "content.manage", label: "إدارة المحتوى", group: "التشغيل", description: "محتوى الموقع التسويقي والصفحات النظامية." },
  { id: "notifications.send", label: "إرسال الإشعارات", group: "التشغيل", description: "إرسال إشعارات وبريد جماعي للمشتركين." },
  { id: "logs.view", label: "السجلات والتدقيق", group: "الأمان", description: "الاطلاع على سجل التدقيق وسجلات النظام." },
];

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_PERMISSIONS.map((p) => [p.id, p.label]),
);

export const PERMISSION_GROUPS = Array.from(new Set(ADMIN_PERMISSIONS.map((p) => p.group)));

export function hasPermission(
  staff: { role: string; permissions: string[] | null } | null,
  permission: AdminPermission,
): boolean {
  if (!staff) return false;
  if (staff.role === "super_admin") return true;
  return (staff.permissions ?? []).includes(permission);
}

export const PLAN_PRESETS = [
  { code: "basic", label: "الباقة الأساسية" },
  { code: "professional", label: "الباقة الاحترافية" },
  { code: "enterprise", label: "باقة المؤسسات" },
  { code: "custom", label: "باقة مخصصة" },
] as const;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  expired: "منتهٍ",
  cancelled: "ملغى",
  trial: "تجريبي",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  new: "جديدة",
  awaiting_reply: "بانتظار الرد",
  in_progress: "قيد المعالجة",
  closed: "مغلقة",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  general: "استفسار عام",
  technical: "مشكلة تقنية",
  billing: "الاشتراك والفواتير",
  feature: "اقتراح تطوير",
  account: "الحساب والصلاحيات",
};