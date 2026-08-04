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
  | "support.read"
  | "support.create"
  | "support.reply"
  | "support.assign"
  | "support.escalate"
  | "support.close"
  | "support.reopen"
  | "support.merge"
  | "support.manage_sla"
  | "support.manage_categories"
  | "support.view_all_offices"
  | "support.export"
  | "email.manage"
  | "email.view"
  | "email.send"
  | "email.assign"
  | "email.audit"
  | "email.read"
  | "email.retry"
  | "email.view_logs"
  | "email.manage_providers"
  | "email.manage_mailboxes"
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
  | "roles.manage"
  | "departments.read"
  | "departments.manage"
  | "staff.sessions.read"
  | "staff.sessions.revoke"
  | "staff.restrictions.manage"
  | "delegation.grant"
  | "delegation.revoke"
  | "approvals.request"
  | "approvals.decide"
  | "impersonation.request"
  | "impersonation.approve"
  | "billing.read"
  | "billing.create"
  | "billing.update"
  | "billing.issue"
  | "billing.cancel"
  | "billing.record_payment"
  | "billing.approve_payment"
  | "billing.refund"
  | "billing.export"
  | "billing.manage_providers"
  | "billing.reconcile"
  | "billing.close_period"
  | "billing.reopen_period"
  | "billing.view_reports";

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
  { id: "support.read", label: "مشاهدة مركز الدعم", group: "الدعم الفني", description: "الاطلاع على التذاكر وخطها الزمني ومهلها." },
  { id: "support.create", label: "إنشاء تذكرة", group: "الدعم الفني", description: "فتح تذكرة داخلية نيابة عن مكتب أو مُقدّم طلب." },
  { id: "support.reply", label: "الرد على التذاكر", group: "الدعم الفني", description: "الرد على المكتب وإضافة الملاحظات الداخلية وتغيير الحالة." },
  { id: "support.assign", label: "إسناد التذاكر", group: "الدعم الفني", description: "إسناد التذكرة لموظف أو فريق آخر." },
  { id: "support.escalate", label: "تصعيد التذاكر", group: "الدعم الفني", description: "رفع مستوى التذكرة إلى فريق أعلى." },
  { id: "support.close", label: "إغلاق التذاكر", group: "الدعم الفني", description: "تسجيل الحل والإغلاق وإطلاق طلب التقييم." },
  { id: "support.reopen", label: "إعادة فتح التذاكر", group: "الدعم الفني", description: "إعادة فتح تذكرة مغلقة بمهلة حل جديدة." },
  { id: "support.merge", label: "الدمج والتقسيم", group: "الدعم الفني", description: "دمج التذاكر المتكررة وتقسيم الطلبات المركّبة." },
  { id: "support.manage_sla", label: "إدارة المهل والفرق", group: "الدعم الفني", description: "سياسات المهل وتقويم العمل والعطلات وقواعد التصعيد والفرق." },
  { id: "support.manage_categories", label: "إدارة التصنيفات والوسوم", group: "الدعم الفني", description: "تصنيفات التذاكر وأولوياتها الافتراضية والوسوم." },
  { id: "support.view_all_offices", label: "مشاهدة تذاكر كل المكاتب", group: "الدعم الفني", description: "بدونها يرى الوكيل تذاكره وتذاكر فرقه فقط." },
  { id: "support.export", label: "تصدير تقارير الدعم", group: "الدعم الفني", description: "تصدير التذاكر ومؤشرات المهل والتقييمات بصيغة CSV." },
  { id: "email.manage", label: "إدارة البريد", group: "التشغيل", description: "بيانات المُرسل وقوالب الرسائل وإعدادات الصناديق والتسميات." },
  { id: "email.view", label: "مشاهدة صناديق البريد", group: "التشغيل", description: "قراءة محادثات مركز البريد وملاحظاته الداخلية." },
  { id: "email.send", label: "إرسال البريد", group: "التشغيل", description: "إنشاء المسوّدات والرد والتحويل وإرسال الرسائل." },
  { id: "email.assign", label: "تحويل محادثات البريد", group: "التشغيل", description: "إسناد المحادثة إلى موظف آخر." },
  { id: "email.audit", label: "سجل تدقيق البريد", group: "التشغيل", description: "الاطلاع على سجل عمليات مركز البريد." },
  { id: "email.read", label: "قراءة البريد الوارد", group: "التشغيل", description: "قراءة حالة الصناديق والرسائل المستوردة دون تعديل." },
  { id: "email.retry", label: "إعادة محاولة البريد", group: "التشغيل", description: "إعادة محاولة الرسائل والمزامنات الفاشلة." },
  { id: "email.view_logs", label: "سجلات تشغيل البريد", group: "التشغيل", description: "الاطلاع على سجل دورات المزامنة وأخطائها المنقّحة." },
  { id: "email.manage_providers", label: "إدارة مزوّدي البريد", group: "التشغيل", description: "تفعيل وتعطيل مزوّد البريد واختبار اتصاله وإعادة تعيين مؤشر المزامنة." },
  { id: "email.manage_mailboxes", label: "إدارة صناديق البريد", group: "التشغيل", description: "ربط صناديق المزوّد بصناديق مِهلة وفك ارتباطها." },
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
  { id: "departments.read", label: "مشاهدة الأقسام", group: "الأقسام", description: "عرض أقسام المنصة ومدرائها." },
  { id: "departments.manage", label: "إدارة الأقسام", group: "الأقسام", description: "إنشاء وتعديل الأقسام والمدير المباشر." },
  { id: "staff.sessions.read", label: "مشاهدة الجلسات", group: "الأمان", description: "عرض جلسات وأجهزة موظفي المنصة." },
  { id: "staff.sessions.revoke", label: "إبطال الجلسات", group: "الأمان", description: "إبطال جلسة جهاز لموظف فوراً." },
  { id: "staff.restrictions.manage", label: "إدارة قيود الوصول", group: "الأمان", description: "تحديد عناوين IP والأجهزة ونافذة العمل لكل موظف." },
  { id: "delegation.grant", label: "تفويض الصلاحيات", group: "التفويض والاعتماد", description: "تفويض صلاحية يملكها الموظف لموظف آخر بمدة محددة." },
  { id: "delegation.revoke", label: "سحب التفويض", group: "التفويض والاعتماد", description: "سحب تفويض أو صلاحية مؤقتة قبل انتهائها." },
  { id: "approvals.request", label: "طلب اعتماد", group: "التفويض والاعتماد", description: "إنشاء طلب اعتماد لعملية حساسة." },
  { id: "approvals.decide", label: "اعتماد الطلبات", group: "التفويض والاعتماد", description: "اعتماد أو رفض طلبات العمليات الحساسة." },
  { id: "impersonation.request", label: "طلب انتحال", group: "الأمان", description: "طلب جلسة انتحال قراءة فقط داخل نطاق المنصة." },
  { id: "impersonation.approve", label: "اعتماد الانتحال", group: "الأمان", description: "اعتماد طلب جلسة انتحال لموظف آخر." },
  { id: "billing.read", label: "مشاهدة المركز المالي", group: "المركز المالي", description: "الاطلاع على الفواتير والمدفوعات والاستردادات." },
  { id: "billing.create", label: "إنشاء فاتورة", group: "المركز المالي", description: "إنشاء مسودة فاتورة وبنودها." },
  { id: "billing.update", label: "تعديل مسودة فاتورة", group: "المركز المالي", description: "تعديل بيانات وبنود الفاتورة قبل إصدارها." },
  { id: "billing.issue", label: "إصدار الفواتير", group: "المركز المالي", description: "اعتماد المسودة وإصدارها برقم نظامي نهائي." },
  { id: "billing.cancel", label: "إلغاء الفواتير", group: "المركز المالي", description: "إلغاء فاتورة غير مسددة بسبب مُسجّل." },
  { id: "billing.record_payment", label: "تسجيل الدفعات", group: "المركز المالي", description: "تسجيل تحصيل يدوي أو تحويل بنكي بانتظار الاعتماد." },
  { id: "billing.approve_payment", label: "اعتماد الدفعات", group: "المركز المالي", description: "اعتماد أو رفض إثبات التحويل والدفعات المسجّلة." },
  { id: "billing.refund", label: "الاستردادات وإشعارات الخصم", group: "المركز المالي", description: "طلب واعتماد الاسترداد وإصدار إشعار خصم." },
  { id: "billing.export", label: "تصدير البيانات المالية", group: "المركز المالي", description: "تصدير الفواتير والمدفوعات بصيغة CSV." },
  { id: "billing.manage_providers", label: "إدارة مزودي الدفع", group: "المركز المالي", description: "تهيئة المزودين ومفاتيحهم واختبار الاتصال." },
  { id: "billing.reconcile", label: "المطابقة البنكية", group: "المركز المالي", description: "إدخال حركات الحساب البنكي ومطابقتها بالدفعات." },
  { id: "billing.close_period", label: "إقفال الفترات المالية", group: "المركز المالي", description: "إقفال فترة مالية ومنع أي تعديل داخلها." },
  { id: "billing.reopen_period", label: "إعادة فتح الفترات", group: "المركز المالي", description: "اعتماد إعادة فتح فترة مقفلة بموافقة موظف آخر." },
  { id: "billing.view_reports", label: "التقارير المالية التفصيلية", group: "المركز المالي", description: "تقارير التحصيل وأعمار الدين والضريبة." },
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
  // مركز الدعم: الصلاحيات القديمة تبقى مقبولة وتُخطَّط إلى الصلاحيات الحديثة.
  "tickets.view": ["support.read"],
  "tickets.reply": ["support.reply", "support.close", "support.reopen"],
  "tickets.assign": ["support.assign", "support.escalate"],
  // مركز البريد: صلاحية الإدارة الشاملة السابقة تغطي الصلاحيات الدقيقة الحديثة.
  "email.manage": [
    "email.manage_providers",
    "email.manage_mailboxes",
    "email.retry",
    "email.view_logs",
    "email.read",
  ],
  "email.view": ["email.read", "email.view_logs"],
  "email.audit": ["email.view_logs"],
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
  pending_internal: "بانتظار جهة داخلية",
  escalated: "مُصعَّدة",
  resolved: "تم الحل",
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
