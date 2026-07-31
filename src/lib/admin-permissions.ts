/**
 * صلاحيات لوحة إدارة منصة مِهلة (Platform Control).
 *
 * ملاحظة خصوصية جوهرية: لا توجد — ولن توجد — صلاحية تمنح موظف المنصة الاطلاع على
 * بيانات المكاتب القانونية (القضايا، المستندات، ملفات العملاء، الملاحظات، المرفقات).
 * الوصول الاستثنائي يتم فقط عبر منحة «وصول دعم مؤقت» يوافق عليها المكتب نفسه
 * بمدة محددة وسبب مُسجّل في سجل التدقيق (support_access_grants).
 */

export type AdminPermission =
  | "users.read"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "organizations.read"
  | "organizations.update"
  | "organizations.delete"
  | "subscriptions.manage"
  | "plans.manage"
  | "revenue.read"
  | "tickets.view"
  | "tickets.reply"
  | "tickets.assign"
  | "email.manage"
  | "notifications.send"
  | "settings.manage"
  | "seo.manage"
  | "monitoring.read"
  | "backups.manage"
  | "audit.read"
  | "audit.export"
  | "support_access.request"
  | "staff.view"
  | "staff.manage"
  | "roles.manage";

export interface PermissionDef {
  id: AdminPermission;
  label: string;
  group: string;
  description: string;
}

export const ADMIN_PERMISSIONS: PermissionDef[] = [
  { id: "users.read", label: "مشاهدة المستخدمين", group: "المستخدمون", description: "عرض قائمة المستخدمين وبياناتهم التشغيلية." },
  { id: "users.create", label: "إضافة مستخدم", group: "المستخدمون", description: "إنشاء حساب مستخدم جديد ودعوته." },
  { id: "users.update", label: "تعديل المستخدمين", group: "المستخدمون", description: "تفعيل/إيقاف، إعادة تعيين كلمة المرور، والملاحظات الداخلية." },
  { id: "users.delete", label: "حذف المستخدمين", group: "المستخدمون", description: "حذف حساب مستخدم نهائياً." },
  { id: "organizations.read", label: "مشاهدة المكاتب", group: "المكاتب", description: "عرض المكاتب وإحصاءاتها العدديّة فقط." },
  { id: "organizations.update", label: "تعديل المكاتب", group: "المكاتب", description: "تعديل بيانات المكتب وإيقافه وإعادة تفعيله." },
  { id: "organizations.delete", label: "حذف المكاتب", group: "المكاتب", description: "حذف مكتب وجميع بياناته نهائياً." },
  { id: "subscriptions.manage", label: "إدارة الاشتراكات", group: "الإيرادات", description: "تفعيل وتمديد وتعليق وإلغاء الاشتراكات." },
  { id: "plans.manage", label: "إدارة الباقات", group: "الإيرادات", description: "إنشاء وتعديل الباقات وحدودها وأسعارها." },
  { id: "revenue.read", label: "التقارير المالية", group: "الإيرادات", description: "الاطلاع على الإيرادات والتقارير." },
  { id: "tickets.view", label: "مشاهدة التذاكر", group: "الدعم الفني", description: "الاطلاع على تذاكر الدعم." },
  { id: "tickets.reply", label: "الرد على التذاكر", group: "الدعم الفني", description: "الرد وتغيير الحالة والإغلاق." },
  { id: "tickets.assign", label: "تحويل التذاكر", group: "الدعم الفني", description: "تحويل التذكرة لموظف آخر." },
  { id: "email.manage", label: "إدارة البريد", group: "التشغيل", description: "بيانات المُرسل وقوالب الرسائل واختبار الإرسال." },
  { id: "notifications.send", label: "إرسال الإشعارات", group: "التشغيل", description: "إشعارات داخلية وبريد للمستخدمين والمكاتب." },
  { id: "settings.manage", label: "إعدادات المنصة", group: "التشغيل", description: "الهوية والبيانات الرسمية والروابط النظامية." },
  { id: "seo.manage", label: "إدارة SEO", group: "التشغيل", description: "الوسوم والفهرسة وملفات robots وsitemap." },
  { id: "monitoring.read", label: "مراقبة النظام", group: "التشغيل", description: "حالة القاعدة والتخزين والبريد والنطاق." },
  { id: "backups.manage", label: "النسخ الاحتياطي", group: "التشغيل", description: "الاطلاع على حالة النسخ وتصدير البيانات." },
  { id: "audit.read", label: "سجل التدقيق", group: "الأمان", description: "الاطلاع على سجل التدقيق الكامل." },
  { id: "audit.export", label: "تصدير سجل التدقيق", group: "الأمان", description: "تصدير السجلات بصيغة CSV." },
  { id: "support_access.request", label: "طلب وصول دعم مؤقت", group: "الأمان", description: "طلب وصول مؤقت لبيانات مكتب بموافقته وبسبب مُسجّل." },
  { id: "staff.view", label: "مشاهدة الفريق", group: "الفريق", description: "عرض فريق إدارة المنصة وصلاحياتهم." },
  { id: "staff.manage", label: "إدارة الفريق", group: "الفريق", description: "إضافة موظفين وتعديل صلاحياتهم وإيقافهم." },
  { id: "roles.manage", label: "إدارة الأدوار", group: "الفريق", description: "إنشاء أدوار مخصصة وتحديد صلاحياتها." },
];

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_PERMISSIONS.map((p) => [p.id, p.label]),
);

export const PERMISSION_GROUPS = Array.from(new Set(ADMIN_PERMISSIONS.map((p) => p.group)));

/** الصلاحيات القديمة التي كانت مستخدمة قبل نظام الأدوار — تُترجم للمفاتيح الحديثة. */
const LEGACY_ALIASES: Record<string, AdminPermission[]> = {
  "logs.view": ["audit.read"],
  "analytics.view": ["revenue.read"],
  "content.manage": ["settings.manage"],
};

export function expandPermissions(permissions: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const p of permissions ?? []) {
    out.add(p);
    for (const alias of LEGACY_ALIASES[p] ?? []) out.add(alias);
  }
  return Array.from(out);
}

export function hasPermission(
  staff: { role: string; permissions: string[] | null; rolePermissions?: string[] | null } | null,
  permission: AdminPermission,
): boolean {
  if (!staff) return false;
  if (staff.role === "super_admin") return true;
  const all = expandPermissions([...(staff.permissions ?? []), ...(staff.rolePermissions ?? [])]);
  return all.includes(permission);
}

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  expired: "منتهٍ",
  cancelled: "ملغى",
  trial: "تجريبي",
  suspended: "معلّق",
};

export const ACTIVATION_METHOD_LABELS: Record<string, string> = {
  manual: "تفعيل يدوي",
  trial: "تجربة مجانية",
  complimentary: "اشتراك مجاني",
  migration: "ترحيل بيانات",
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

export const PLAN_FEATURE_FLAGS = [
  { key: "ocr", label: "قراءة المستندات ضوئياً (OCR)" },
  { key: "ai", label: "المساعد الذكي (AI)" },
  { key: "pdf_search", label: "البحث داخل ملفات PDF" },
  { key: "e_sign", label: "التوقيع الإلكتروني" },
  { key: "api", label: "الوصول عبر API" },
] as const;

export const SUPPORT_ACCESS_SCOPES = [
  { key: "cases", label: "القضايا" },
  { key: "documents", label: "المستندات" },
  { key: "clients", label: "ملفات العملاء" },
] as const;

export const SUPPORT_ACCESS_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار موافقة المكتب",
  approved: "سارٍ",
  denied: "مرفوض",
  revoked: "مسحوب",
  expired: "منتهٍ",
};
