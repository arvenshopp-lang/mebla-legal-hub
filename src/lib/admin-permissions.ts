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
  /** @deprecated صلاحية موروثة واسعة — تُترجم تلقائياً إلى الصلاحيات الدقيقة. لا تُستخدم في صفحات جديدة. */
  | "settings.manage"
  | "platform_settings.read"
  | "platform_settings.manage"
  | "feature_flags.read"
  | "feature_flags.manage"
  | "notification_rules.read"
  | "notification_rules.manage"
  | "integrations.read"
  | "integrations.manage"
  | "integrations.test"
  | "integrations.activate"
  | "integrations.view_logs"
  | "content.read"
  | "content.manage"
  | "content.publish"
  | "content.rollback"
  | "design.read"
  | "design.manage"
  | "design.draft.write"
  | "design.preview"
  | "design.history.read"
  | "design.publish"
  | "design.rollback"
  | "seo.read"
  | "seo.manage"
  | "sms.read"
  | "sms.manage"
  | "security.read"
  | "security.manage"
  | "security.sessions.manage"
  | "security.events.export"
  | "monitoring.read"
  | "monitoring.export"
  | "operations.read"
  | "operations.manage"
  | "backups.read"
  | "backups.manage"
  | "backups.restore"
  | "crm.read"
  | "crm.create"
  | "crm.update"
  | "crm.delete"
  | "crm.assign"
  | "crm.export"
  | "crm.manage_pipeline"
  | "sales_docs.read"
  | "sales_docs.create"
  | "sales_docs.update"
  | "sales_docs.delete"
  | "sales_docs.send"
  | "sales_docs.approve"
  | "sales_docs.decide"
  | "sales_docs.convert"
  | "sales_docs.manage_templates"
  | "sales_docs.export"
  | "hr.read"
  | "hr.manage"
  | "hr.documents.read"
  | "marketing.read"
  | "marketing.manage"
  | "marketing.export"
  | "audit.read"
  | "audit.export"
  | "support_access.request"
  | "staff.view"
  | "staff.manage"
  | "rbac.read"
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
  {
    id: "users.read",
    label: "مشاهدة المستخدمين",
    group: "المستخدمون",
    description: "عرض قائمة المستخدمين وبياناتهم التشغيلية.",
  },
  {
    id: "users.create",
    label: "إضافة مستخدم",
    group: "المستخدمون",
    description: "إنشاء حساب مستخدم جديد ودعوته.",
  },
  {
    id: "users.update",
    label: "تعديل المستخدمين",
    group: "المستخدمون",
    description: "تفعيل/إيقاف، إعادة تعيين كلمة المرور، والملاحظات الداخلية.",
  },
  {
    id: "users.delete",
    label: "حذف المستخدمين",
    group: "المستخدمون",
    description: "حذف حساب مستخدم نهائياً.",
  },
  {
    id: "organizations.read",
    label: "مشاهدة المكاتب",
    group: "المكاتب",
    description: "عرض المكاتب وإحصاءاتها العدديّة فقط.",
  },
  {
    id: "organizations.update",
    label: "تعديل المكاتب",
    group: "المكاتب",
    description: "تعديل بيانات المكتب وإيقافه وإعادة تفعيله.",
  },
  {
    id: "organizations.delete",
    label: "حذف المكاتب",
    group: "المكاتب",
    description: "حذف مكتب وجميع بياناته نهائياً.",
  },
  {
    id: "subscriptions.manage",
    label: "إدارة الاشتراكات",
    group: "الإيرادات",
    description: "تفعيل وتمديد وتعليق وإلغاء الاشتراكات.",
  },
  {
    id: "plans.manage",
    label: "إدارة الباقات",
    group: "الإيرادات",
    description: "إنشاء وتعديل الباقات وحدودها وأسعارها.",
  },
  {
    id: "revenue.read",
    label: "التقارير المالية",
    group: "الإيرادات",
    description: "الاطلاع على الإيرادات والتقارير.",
  },
  {
    id: "tickets.view",
    label: "مشاهدة التذاكر",
    group: "الدعم الفني",
    description: "الاطلاع على تذاكر الدعم.",
  },
  {
    id: "tickets.reply",
    label: "الرد على التذاكر",
    group: "الدعم الفني",
    description: "الرد وتغيير الحالة والإغلاق.",
  },
  {
    id: "tickets.assign",
    label: "تحويل التذاكر",
    group: "الدعم الفني",
    description: "تحويل التذكرة لموظف آخر.",
  },
  {
    id: "support.read",
    label: "مشاهدة مركز الدعم",
    group: "الدعم الفني",
    description: "الاطلاع على التذاكر وخطها الزمني ومهلها.",
  },
  {
    id: "support.create",
    label: "إنشاء تذكرة",
    group: "الدعم الفني",
    description: "فتح تذكرة داخلية نيابة عن مكتب أو مُقدّم طلب.",
  },
  {
    id: "support.reply",
    label: "الرد على التذاكر",
    group: "الدعم الفني",
    description: "الرد على المكتب وإضافة الملاحظات الداخلية وتغيير الحالة.",
  },
  {
    id: "support.assign",
    label: "إسناد التذاكر",
    group: "الدعم الفني",
    description: "إسناد التذكرة لموظف أو فريق آخر.",
  },
  {
    id: "support.escalate",
    label: "تصعيد التذاكر",
    group: "الدعم الفني",
    description: "رفع مستوى التذكرة إلى فريق أعلى.",
  },
  {
    id: "support.close",
    label: "إغلاق التذاكر",
    group: "الدعم الفني",
    description: "تسجيل الحل والإغلاق وإطلاق طلب التقييم.",
  },
  {
    id: "support.reopen",
    label: "إعادة فتح التذاكر",
    group: "الدعم الفني",
    description: "إعادة فتح تذكرة مغلقة بمهلة حل جديدة.",
  },
  {
    id: "support.merge",
    label: "الدمج والتقسيم",
    group: "الدعم الفني",
    description: "دمج التذاكر المتكررة وتقسيم الطلبات المركّبة.",
  },
  {
    id: "support.manage_sla",
    label: "إدارة المهل والفرق",
    group: "الدعم الفني",
    description: "سياسات المهل وتقويم العمل والعطلات وقواعد التصعيد والفرق.",
  },
  {
    id: "support.manage_categories",
    label: "إدارة التصنيفات والوسوم",
    group: "الدعم الفني",
    description: "تصنيفات التذاكر وأولوياتها الافتراضية والوسوم.",
  },
  {
    id: "support.view_all_offices",
    label: "مشاهدة تذاكر كل المكاتب",
    group: "الدعم الفني",
    description: "بدونها يرى الوكيل تذاكره وتذاكر فرقه فقط.",
  },
  {
    id: "support.export",
    label: "تصدير تقارير الدعم",
    group: "الدعم الفني",
    description: "تصدير التذاكر ومؤشرات المهل والتقييمات بصيغة CSV.",
  },
  {
    id: "email.manage",
    label: "إدارة البريد",
    group: "التشغيل",
    description: "بيانات المُرسل وقوالب الرسائل وإعدادات الصناديق والتسميات.",
  },
  {
    id: "email.view",
    label: "مشاهدة صناديق البريد",
    group: "التشغيل",
    description: "قراءة محادثات مركز البريد وملاحظاته الداخلية.",
  },
  {
    id: "email.send",
    label: "إرسال البريد",
    group: "التشغيل",
    description: "إنشاء المسوّدات والرد والتحويل وإرسال الرسائل.",
  },
  {
    id: "email.assign",
    label: "تحويل محادثات البريد",
    group: "التشغيل",
    description: "إسناد المحادثة إلى موظف آخر.",
  },
  {
    id: "email.audit",
    label: "سجل تدقيق البريد",
    group: "التشغيل",
    description: "الاطلاع على سجل عمليات مركز البريد.",
  },
  {
    id: "email.read",
    label: "قراءة البريد الوارد",
    group: "التشغيل",
    description: "قراءة حالة الصناديق والرسائل المستوردة دون تعديل.",
  },
  {
    id: "email.retry",
    label: "إعادة محاولة البريد",
    group: "التشغيل",
    description: "إعادة محاولة الرسائل والمزامنات الفاشلة.",
  },
  {
    id: "email.view_logs",
    label: "سجلات تشغيل البريد",
    group: "التشغيل",
    description: "الاطلاع على سجل دورات المزامنة وأخطائها المنقّحة.",
  },
  {
    id: "email.manage_providers",
    label: "إدارة مزوّدي البريد",
    group: "التشغيل",
    description: "تفعيل وتعطيل مزوّد البريد واختبار اتصاله وإعادة تعيين مؤشر المزامنة.",
  },
  {
    id: "email.manage_mailboxes",
    label: "إدارة صناديق البريد",
    group: "التشغيل",
    description: "ربط صناديق المزوّد بصناديق مِهلة وفك ارتباطها.",
  },
  {
    id: "notifications.send",
    label: "إرسال الإشعارات",
    group: "التشغيل",
    description: "إشعارات داخلية وبريد للمستخدمين والمكاتب.",
  },
  {
    id: "settings.manage",
    label: "إعدادات المنصة (موروثة)",
    group: "موروث",
    description:
      "صلاحية واسعة سابقة — تُترجم تلقائياً إلى الصلاحيات الدقيقة. لا تُمنح للأدوار الجديدة.",
  },
  {
    id: "platform_settings.read",
    label: "مشاهدة إعدادات المنصة",
    group: "إعدادات المنصة",
    description: "الاطلاع على الهوية والبيانات الرسمية والروابط النظامية.",
  },
  {
    id: "platform_settings.manage",
    label: "تعديل إعدادات المنصة",
    group: "إعدادات المنصة",
    description: "تعديل الهوية والبيانات الرسمية والروابط النظامية.",
  },
  {
    id: "feature_flags.read",
    label: "مشاهدة مفاتيح التشغيل",
    group: "مفاتيح التشغيل والإشعارات",
    description: "الاطلاع على مفاتيح الميزات وحالتها ونطاقها.",
  },
  {
    id: "feature_flags.manage",
    label: "إدارة مفاتيح التشغيل",
    group: "مفاتيح التشغيل والإشعارات",
    description: "إنشاء وتعديل وتفعيل وتعطيل مفاتيح الميزات.",
  },
  {
    id: "notification_rules.read",
    label: "مشاهدة قواعد الإشعارات",
    group: "مفاتيح التشغيل والإشعارات",
    description: "الاطلاع على قواعد الإشعارات وقنواتها.",
  },
  {
    id: "notification_rules.manage",
    label: "إدارة قواعد الإشعارات",
    group: "مفاتيح التشغيل والإشعارات",
    description: "إنشاء وتعديل قواعد الإشعارات وقنواتها.",
  },
  {
    id: "integrations.read",
    label: "مشاهدة التكاملات",
    group: "التكاملات",
    description: "الاطلاع على التكاملات وحالتها دون أي تعديل أو كشف مفاتيح.",
  },
  {
    id: "integrations.manage",
    label: "إدارة التكاملات ومفاتيحها",
    group: "التكاملات",
    description: "تهيئة التكاملات وحفظ أسرارها وحذفها.",
  },
  {
    id: "integrations.test",
    label: "اختبار التكاملات",
    group: "التكاملات",
    description: "تنفيذ اختبار اتصال للتكامل دون تغيير تهيئته.",
  },
  {
    id: "integrations.activate",
    label: "تفعيل وتعطيل التكاملات",
    group: "التكاملات",
    description: "تفعيل التكامل أو تعطيله في بيئة التشغيل.",
  },
  {
    id: "integrations.view_logs",
    label: "سجلات صحة التكاملات",
    group: "التكاملات",
    description: "الاطلاع على سجل فحوص الصحة والأخطاء المنقّحة.",
  },
  {
    id: "content.read",
    label: "مشاهدة المحتوى",
    group: "المحتوى والتصميم",
    description: "الاطلاع على الصفحات النظامية ومسوّداتها.",
  },
  {
    id: "content.manage",
    label: "تحرير المحتوى",
    group: "المحتوى والتصميم",
    description: "إنشاء وتعديل مسوّدات الصفحات النظامية.",
  },
  {
    id: "content.publish",
    label: "نشر المحتوى",
    group: "المحتوى والتصميم",
    description: "نشر مسوّدة الصفحة لتصبح النسخة العامة.",
  },
  {
    id: "content.rollback",
    label: "التراجع عن النشر",
    group: "المحتوى والتصميم",
    description: "استرجاع نسخة منشورة سابقة للصفحة.",
  },
  {
    id: "design.read",
    label: "مشاهدة تصميم المنصة",
    group: "المحتوى والتصميم",
    description: "الاطلاع على سمات التصميم ومسوّداتها ونسخها.",
  },
  {
    id: "design.manage",
    label: "إدارة تصميم المنصة",
    group: "المحتوى والتصميم",
    description: "تعديل السمات والمسوّدات ونشرها والتراجع عنها.",
  },
  {
    id: "design.draft.write",
    label: "تعديل مسودة التصميم",
    group: "المحتوى والتصميم",
    description: "تحرير توكنات التصميم وCSS المخصص وحفظها كمسودة دون نشر.",
  },
  {
    id: "design.preview",
    label: "معاينة مسودة التصميم",
    group: "المحتوى والتصميم",
    description: "بناء حزمة معاينة للمسودة على صفحات المنصة الحقيقية.",
  },
  {
    id: "design.history.read",
    label: "سجل إصدارات التصميم",
    group: "المحتوى والتصميم",
    description: "الاطلاع على الإصدارات المنشورة والفروق وسجل التدقيق.",
  },
  {
    id: "design.publish",
    label: "نشر التصميم",
    group: "المحتوى والتصميم",
    description: "اعتماد المسودة ونشرها كإصدار فعلي لكل مستخدمي المنصة.",
  },
  {
    id: "design.rollback",
    label: "التراجع عن نشر التصميم",
    group: "المحتوى والتصميم",
    description: "الرجوع للإصدار السابق أو استعادة إصدار من السجل.",
  },
  {
    id: "seo.read",
    label: "مشاهدة إعدادات SEO",
    group: "المحتوى والتصميم",
    description: "الاطلاع على الوسوم والفهرسة وملفات robots وsitemap.",
  },
  {
    id: "seo.manage",
    label: "إدارة SEO",
    group: "المحتوى والتصميم",
    description: "الوسوم والفهرسة وملفات robots وsitemap.",
  },
  {
    id: "sms.read",
    label: "مشاهدة إعدادات الرسائل",
    group: "الرسائل النصية",
    description: "الاطلاع على تهيئة الرسائل ومزوّديها وسجل التسليم.",
  },
  {
    id: "sms.manage",
    label: "إدارة الرسائل النصية",
    group: "الرسائل النصية",
    description: "تهيئة مزوّدي الرسائل وقوالبها واختبار الإرسال.",
  },
  {
    id: "security.read",
    label: "مشاهدة مركز الأمان",
    group: "الأمان",
    description: "الاطلاع على مؤشرات الأمان ومفاتيح التشفير وسجلات الكشف والرفض.",
  },
  {
    id: "security.manage",
    label: "إدارة مفاتيح التشفير",
    group: "الأمان",
    description: "تسجيل نسخة مفتاح جديدة وتقاعد نسخة وتشغيل دفعات إعادة التشفير.",
  },
  {
    id: "security.sessions.manage",
    label: "إدارة جلسات الأمان",
    group: "الأمان",
    description: "إبطال جلسات الأجهزة وإدارة قيود الوصول الأمنية.",
  },
  {
    id: "security.events.export",
    label: "تصدير أحداث الأمان",
    group: "الأمان",
    description: "تصدير سجلات الكشف والرفض الأمنية بصيغة CSV.",
  },
  {
    id: "monitoring.read",
    label: "مراقبة النظام",
    group: "التشغيل",
    description: "حالة القاعدة والتخزين والبريد والنطاق.",
  },
  {
    id: "monitoring.export",
    label: "تصدير تقارير المراقبة",
    group: "التشغيل",
    description: "تصدير مؤشرات الخدمات والمهام والأعطال.",
  },
  {
    id: "operations.read",
    label: "مشاهدة الحوادث التشغيلية",
    group: "التشغيل",
    description: "قراءة الحوادث ونبضات المهام الدورية وحالة الطوابير.",
  },
  {
    id: "operations.manage",
    label: "إدارة الحوادث التشغيلية",
    group: "التشغيل",
    description: "إسناد الحوادث وتغيير حالتها وإغلاقها وإضافة ملاحظات تشغيلية.",
  },
  {
    id: "backups.read",
    label: "مشاهدة النسخ الاحتياطية",
    group: "التشغيل",
    description: "الاطلاع على سجل النسخ وطلبات الاستعادة دون تعديل.",
  },
  {
    id: "backups.manage",
    label: "النسخ الاحتياطي",
    group: "التشغيل",
    description: "الاطلاع على حالة النسخ وتصدير البيانات وتسجيل الطلبات.",
  },
  {
    id: "backups.restore",
    label: "اعتماد الاستعادة",
    group: "التشغيل",
    description: "اعتماد أو رفض طلبات استعادة نسخة احتياطية.",
  },
  {
    id: "crm.read",
    label: "مشاهدة CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "عرض العملاء المحتملين والشركات وجهات الاتصال والصفقات.",
  },
  {
    id: "crm.create",
    label: "إضافة سجلات CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "إنشاء عميل محتمل أو شركة أو جهة اتصال أو صفقة أو نشاط.",
  },
  {
    id: "crm.update",
    label: "تعديل سجلات CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "تعديل السجلات وتحويل العميل المحتمل وتحريك مراحل الصفقة.",
  },
  {
    id: "crm.delete",
    label: "حذف سجلات CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "حذف سجلات علاقات العملاء نهائياً.",
  },
  {
    id: "crm.assign",
    label: "إسناد سجلات CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "إسناد العميل المحتمل أو الصفقة لموظف آخر.",
  },
  {
    id: "crm.export",
    label: "تصدير CRM",
    group: "المبيعات وعلاقات العملاء",
    description: "تصدير قوائم CRM بصيغة CSV آمنة.",
  },
  {
    id: "crm.manage_pipeline",
    label: "إدارة خط البيع",
    group: "المبيعات وعلاقات العملاء",
    description: "إنشاء وتعديل مراحل خط البيع واحتمالاتها.",
  },
  {
    id: "sales_docs.read",
    label: "مشاهدة العروض والعقود",
    group: "العروض والعقود",
    description: "عرض عروض الأسعار والمقترحات والعقود وبنودها.",
  },
  {
    id: "sales_docs.create",
    label: "إنشاء عرض أو عقد",
    group: "العروض والعقود",
    description: "إنشاء مسودة عرض سعر أو مقترح أو عقد.",
  },
  {
    id: "sales_docs.update",
    label: "تعديل المسودات",
    group: "العروض والعقود",
    description: "تعديل بيانات وبنود المستند قبل اعتماده.",
  },
  {
    id: "sales_docs.delete",
    label: "حذف المسودات",
    group: "العروض والعقود",
    description: "حذف مسودة لم تُرسل بعد.",
  },
  {
    id: "sales_docs.send",
    label: "إرسال المستندات",
    group: "العروض والعقود",
    description: "إرسال العرض أو العقد للعميل عبر مركز البريد.",
  },
  {
    id: "sales_docs.approve",
    label: "اعتماد المستندات",
    group: "العروض والعقود",
    description: "اعتماد المستند قبل إرساله عند تجاوزه حدود الخصم.",
  },
  {
    id: "sales_docs.decide",
    label: "تسجيل قرار العميل",
    group: "العروض والعقود",
    description: "تسجيل القبول أو الرفض أو الانتهاء والتوقيع الإلكتروني.",
  },
  {
    id: "sales_docs.convert",
    label: "التحويل لفاتورة أو اشتراك",
    group: "العروض والعقود",
    description: "تحويل المستند المقبول إلى فاتورة أو اشتراك.",
  },
  {
    id: "sales_docs.manage_templates",
    label: "إدارة القوالب",
    group: "العروض والعقود",
    description: "إنشاء وتعديل قوالب العروض والعقود وشروطها.",
  },
  {
    id: "sales_docs.export",
    label: "تصدير العروض والعقود",
    group: "العروض والعقود",
    description: "تصدير قائمة المستندات بصيغة CSV آمنة.",
  },
  {
    id: "hr.read",
    label: "مشاهدة الموظفين",
    group: "الموارد البشرية",
    description: "عرض سجل موظفي الشركة وأقسامهم ومدرائهم.",
  },
  {
    id: "hr.manage",
    label: "إدارة الموظفين",
    group: "الموارد البشرية",
    description: "إضافة وتعديل بيانات الموظفين ومستنداتهم الوظيفية.",
  },
  {
    id: "hr.documents.read",
    label: "مستندات الموظفين",
    group: "الموارد البشرية",
    description: "الاطلاع على العقود والمستندات الوظيفية.",
  },
  {
    id: "marketing.read",
    label: "مشاهدة التسويق",
    group: "التسويق",
    description: "عرض الحملات ومصادر العملاء وأحداث التحويل.",
  },
  {
    id: "marketing.manage",
    label: "إدارة التسويق",
    group: "التسويق",
    description: "إنشاء وتعديل الحملات وبرامج الإحالة والكوبونات المرتبطة.",
  },
  {
    id: "marketing.export",
    label: "تصدير تقارير التسويق",
    group: "التسويق",
    description: "تصدير أداء الحملات وأحداث التحويل بصيغة CSV.",
  },
  {
    id: "audit.read",
    label: "سجل التدقيق",
    group: "الأمان",
    description: "الاطلاع على سجل التدقيق الكامل.",
  },
  {
    id: "audit.export",
    label: "تصدير سجل التدقيق",
    group: "الأمان",
    description: "تصدير السجلات بصيغة CSV.",
  },
  {
    id: "support_access.request",
    label: "طلب وصول دعم مؤقت",
    group: "الأمان",
    description: "طلب وصول مؤقت لبيانات مكتب بموافقته وبسبب مُسجّل.",
  },
  {
    id: "staff.view",
    label: "مشاهدة الفريق",
    group: "الفريق",
    description: "عرض فريق إدارة المنصة وصلاحياتهم.",
  },
  {
    id: "staff.manage",
    label: "إدارة الفريق",
    group: "الفريق",
    description: "إضافة موظفين وتعديل صلاحياتهم وإيقافهم.",
  },
  {
    id: "rbac.read",
    label: "مشاهدة الأدوار والصلاحيات",
    group: "الفريق",
    description: "الاطلاع على الأدوار والقوالب والأقسام والمنح دون تعديل.",
  },
  {
    id: "roles.manage",
    label: "إدارة الأدوار",
    group: "الفريق",
    description: "إنشاء أدوار مخصصة وتحديد صلاحياتها.",
  },
  {
    id: "departments.read",
    label: "مشاهدة الأقسام",
    group: "الأقسام",
    description: "عرض أقسام المنصة ومدرائها.",
  },
  {
    id: "departments.manage",
    label: "إدارة الأقسام",
    group: "الأقسام",
    description: "إنشاء وتعديل الأقسام والمدير المباشر.",
  },
  {
    id: "staff.sessions.read",
    label: "مشاهدة الجلسات",
    group: "الأمان",
    description: "عرض جلسات وأجهزة موظفي المنصة.",
  },
  {
    id: "staff.sessions.revoke",
    label: "إبطال الجلسات",
    group: "الأمان",
    description: "إبطال جلسة جهاز لموظف فوراً.",
  },
  {
    id: "staff.restrictions.manage",
    label: "إدارة قيود الوصول",
    group: "الأمان",
    description: "تحديد عناوين IP والأجهزة ونافذة العمل لكل موظف.",
  },
  {
    id: "delegation.grant",
    label: "تفويض الصلاحيات",
    group: "التفويض والاعتماد",
    description: "تفويض صلاحية يملكها الموظف لموظف آخر بمدة محددة.",
  },
  {
    id: "delegation.revoke",
    label: "سحب التفويض",
    group: "التفويض والاعتماد",
    description: "سحب تفويض أو صلاحية مؤقتة قبل انتهائها.",
  },
  {
    id: "approvals.request",
    label: "طلب اعتماد",
    group: "التفويض والاعتماد",
    description: "إنشاء طلب اعتماد لعملية حساسة.",
  },
  {
    id: "approvals.decide",
    label: "اعتماد الطلبات",
    group: "التفويض والاعتماد",
    description: "اعتماد أو رفض طلبات العمليات الحساسة.",
  },
  {
    id: "impersonation.request",
    label: "طلب انتحال",
    group: "الأمان",
    description: "طلب جلسة انتحال قراءة فقط داخل نطاق المنصة.",
  },
  {
    id: "impersonation.approve",
    label: "اعتماد الانتحال",
    group: "الأمان",
    description: "اعتماد طلب جلسة انتحال لموظف آخر.",
  },
  {
    id: "billing.read",
    label: "مشاهدة المركز المالي",
    group: "المركز المالي",
    description: "الاطلاع على الفواتير والمدفوعات والاستردادات.",
  },
  {
    id: "billing.create",
    label: "إنشاء فاتورة",
    group: "المركز المالي",
    description: "إنشاء مسودة فاتورة وبنودها.",
  },
  {
    id: "billing.update",
    label: "تعديل مسودة فاتورة",
    group: "المركز المالي",
    description: "تعديل بيانات وبنود الفاتورة قبل إصدارها.",
  },
  {
    id: "billing.issue",
    label: "إصدار الفواتير",
    group: "المركز المالي",
    description: "اعتماد المسودة وإصدارها برقم نظامي نهائي.",
  },
  {
    id: "billing.cancel",
    label: "إلغاء الفواتير",
    group: "المركز المالي",
    description: "إلغاء فاتورة غير مسددة بسبب مُسجّل.",
  },
  {
    id: "billing.record_payment",
    label: "تسجيل الدفعات",
    group: "المركز المالي",
    description: "تسجيل تحصيل يدوي أو تحويل بنكي بانتظار الاعتماد.",
  },
  {
    id: "billing.approve_payment",
    label: "اعتماد الدفعات",
    group: "المركز المالي",
    description: "اعتماد أو رفض إثبات التحويل والدفعات المسجّلة.",
  },
  {
    id: "billing.refund",
    label: "الاستردادات وإشعارات الخصم",
    group: "المركز المالي",
    description: "طلب واعتماد الاسترداد وإصدار إشعار خصم.",
  },
  {
    id: "billing.export",
    label: "تصدير البيانات المالية",
    group: "المركز المالي",
    description: "تصدير الفواتير والمدفوعات بصيغة CSV.",
  },
  {
    id: "billing.manage_providers",
    label: "إدارة مزودي الدفع",
    group: "المركز المالي",
    description: "تهيئة المزودين ومفاتيحهم واختبار الاتصال.",
  },
  {
    id: "billing.reconcile",
    label: "المطابقة البنكية",
    group: "المركز المالي",
    description: "إدخال حركات الحساب البنكي ومطابقتها بالدفعات.",
  },
  {
    id: "billing.close_period",
    label: "إقفال الفترات المالية",
    group: "المركز المالي",
    description: "إقفال فترة مالية ومنع أي تعديل داخلها.",
  },
  {
    id: "billing.reopen_period",
    label: "إعادة فتح الفترات",
    group: "المركز المالي",
    description: "اعتماد إعادة فتح فترة مقفلة بموافقة موظف آخر.",
  },
  {
    id: "billing.view_reports",
    label: "التقارير المالية التفصيلية",
    group: "المركز المالي",
    description: "تقارير التحصيل وأعمار الدين والضريبة.",
  },
];

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_PERMISSIONS.map((p) => [p.id, p.label]),
);

export const PERMISSION_GROUPS = Array.from(new Set(ADMIN_PERMISSIONS.map((p) => p.group)));

/**
 * الصلاحية الموروثة `settings.manage` كانت تغطي وحدات غير مترابطة. هذه هي
 * الترجمة الرسمية إلى الصلاحيات الدقيقة، ويُعتمد عليها في:
 *   1) طبقة التشغيل (`expandPermissions`) — حتى لا يفقد أي موظف وصوله لحظة النشر.
 *   2) Migration توافقية تكتب الصلاحيات الدقيقة في `platform_roles.permissions`
 *      و`platform_staff.permissions`.
 * خطة الإلغاء موثّقة في `docs/admin-permissions-catalog.md`.
 */
export const SETTINGS_MANAGE_REPLACEMENTS: AdminPermission[] = [
  "platform_settings.read",
  "platform_settings.manage",
  "feature_flags.read",
  "feature_flags.manage",
  "notification_rules.read",
  "notification_rules.manage",
  "integrations.read",
  "integrations.manage",
  "integrations.test",
  "integrations.activate",
  "integrations.view_logs",
  "content.read",
  "content.manage",
  "content.publish",
  "content.rollback",
  "design.read",
  "design.manage",
  "sms.read",
  "sms.manage",
  "security.read",
  "security.manage",
];

/** الصلاحيات القديمة التي كانت مستخدمة قبل نظام الأدوار — تُترجم للمفاتيح الحديثة. */
const LEGACY_ALIASES: Record<string, AdminPermission[]> = {
  "logs.view": ["audit.read"],
  "analytics.view": ["revenue.read"],
  // الصلاحية الواسعة الموروثة → الصلاحيات الدقيقة (توافق خلفي بلا فقدان وصول).
  "settings.manage": SETTINGS_MANAGE_REPLACEMENTS,
  "seo.manage": ["seo.read"],
  "content.manage": ["content.read"],
  "content.publish": ["content.read"],
  // الصلاحية الواسعة تبقى مقبولة وتُترجم إلى الصلاحيات الدقيقة الحديثة،
  // بلا نشر ولا تراجع: هاتان تُمنحان صراحة فقط.
  "design.manage": ["design.read", "design.draft.write", "design.preview", "design.history.read"],
  "sms.manage": ["sms.read"],
  "security.manage": ["security.read"],
  "feature_flags.manage": ["feature_flags.read"],
  "notification_rules.manage": ["notification_rules.read"],
  "integrations.manage": ["integrations.read", "integrations.test", "integrations.view_logs"],
  "integrations.activate": ["integrations.read"],
  "platform_settings.manage": ["platform_settings.read"],
  "backups.manage": ["backups.read"],
  // مراقبة النظام الموروثة تمنح قراءة الحوادث فقط؛ الإدارة تُمنح صراحة.
  "monitoring.read": ["operations.read"],
  "operations.manage": ["operations.read"],
  "backups.restore": ["backups.read"],
  "staff.view": ["rbac.read"],
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
  const queue = [...(permissions ?? [])];
  while (queue.length > 0) {
    const p = queue.pop()!;
    if (out.has(p)) continue;
    out.add(p);
    for (const alias of LEGACY_ALIASES[p] ?? []) if (!out.has(alias)) queue.push(alias);
  }
  return Array.from(out);
}

/** الصلاحيات الحساسة التي لا يمنحها أي قالب افتراضياً إلا للقوالب المختصة. */
export const HIGH_RISK_PERMISSIONS: AdminPermission[] = [
  "users.delete",
  "organizations.delete",
  "crm.delete",
  "sales_docs.delete",
  "billing.refund",
  "billing.reopen_period",
  "billing.manage_providers",
  "backups.restore",
  "integrations.manage",
  "design.publish",
  "design.rollback",
  "security.manage",
  "security.sessions.manage",
  "security.events.export",
  "audit.export",
  "staff.manage",
  "roles.manage",
  "delegation.grant",
  "approvals.decide",
  "impersonation.approve",
  "staff.restrictions.manage",
  "staff.sessions.revoke",
];

export function isHighRiskPermission(permission: string): boolean {
  return (HIGH_RISK_PERMISSIONS as string[]).includes(permission);
}

/** الصلاحية الموروثة الوحيدة الباقية — ممنوع استخدامها في صفحات أو دوال جديدة. */
export const LEGACY_PERMISSIONS: string[] = [
  "settings.manage",
  "tickets.view",
  "tickets.reply",
  "tickets.assign",
  "email.manage",
  "email.view",
  "email.audit",
];

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
