# PHASE 2 — إغلاق تنظيم لوحة الإدارة + مركز قيادة المالك

النطاق: بنية التنقل، مركز القيادة `/mehla-admin`، إزالة التكرار، اختبار الصلاحيات والجوال.
لا ميزات جديدة، ولا تغيير في Business Logic، ولا حذف مسارات مستقرة.

## ما تم التحقق منه فعلياً قبل الخطة

- كل ملفات `src/routes/mehla-admin/` (36 ملفاً) لها مدخل في `src/lib/admin-nav.ts` أو هي صفحة
  تفاصيل (`billing/$id`, `sales/$id`, `support/$ticketId`) — الاستثناء الوحيد `roles.tsx` وهو
  تحويل مقصود (`redirect → /mehla-admin/rbac`) للحفاظ على الروابط القديمة.
- لا يوجد مسار في القائمة بلا ملف: كل مسارات `admin-nav.ts` مطابقة لملفات موجودة.
- الصفحة `/mehla-admin` الحالية = 640 سطراً و**66 بطاقة رقم** في 7 أقسام (النشاط، المكاتب،
  المستخدمون والأمان، الاشتراكات، الإيرادات، الاستخدام، آخر التسجيلات + حالة الخدمات).
  لا تحتوي منطقة «تحتاج انتباهك»، ولا Trend Chart، ولا حالات تكامل، ولا CTA للتنقّل.
- الدوال الخادمية اللازمة موجودة كلها ومحمية: `getPlatformMetrics`, `getActivityOverview`,
  `getServiceHealth` و`getJobsOverview` (`monitoring.read`), `getGrowthSeries`,
  `billingOverview`, `getSupportQueueCounts`, `getIntegrationsHub`, `listWebhookEvents`,
  `getSystemHealth`. لا حاجة لأي دالة خادمية جديدة.

## 1) بنية التنقل النهائية — من 7 مجموعات إلى 6

الدمج المقترح الوحيد: مجموعة **الدعم** تحتوي عنصراً واحداً فقط (مركز الدعم)، ومجموعة قابلة
للطيّ بعنصر واحد = ضجيج؛ تُنقل إلى **المراسلات** وتُعاد تسميتها «المراسلات والدعم». الباقي
يبقى كما هو لأن كل مجموعة تجتاز المعيار (٣–٦ عناصر، اسم يعبّر عن محتواها، لا صفحة في مجموعتين).

| المجموعة | العناصر → المسار → الصلاحية |
| --- | --- |
| التشغيل | لوحة القيادة `/mehla-admin` (staff) · المستخدمون `/users` (users.read) · المكاتب `/organizations` (organizations.read) · الاشتراكات `/subscriptions` (subscriptions.manage) · الباقات `/plans` (plans.manage) |
| النمو والإيراد | إدارة العلاقات `/crm` (crm.read) · العروض والعقود `/sales` (sales_docs.read) · المركز المالي `/billing` (billing.read) · الإيرادات والتقارير `/revenue` (revenue.read) · مركز التسويق `/marketing` (marketing.read) |
| المراسلات والدعم | مركز الدعم `/support` (tickets.view) · مركز البريد `/mail` + تبويب `/email` (email.view / email.manage) · الإشعارات `/notifications` (notifications.send) · الرسائل وتوثيق الجوال `/sms` (sms.read) · مركز التكاملات `/integrations` (integrations.read) |
| المنصة | مراقبة النظام `/monitoring` + تبويبات `/analytics`, `/services`, `/jobs`, `/failures` (monitoring.read / audit.read) · النسخ الاحتياطية `/backups` (backups.read) · مفاتيح التشغيل `/flags` (feature_flags.read) · إعدادات المنصة `/settings` (platform_settings.read) |
| الموقع العام | إدارة المحتوى `/content` (content.read) · إدارة SEO `/seo` (seo.read) · تصميم المنصة `/design` (design.read) |
| الأمان والفريق | الموظفون والصلاحيات `/staff` (staff.view) · الأدوار والصلاحيات `/rbac` (staff.view) · مركز الموظفين `/hr` (hr.read) · مركز الأمان `/security` (staff) · سجل التدقيق `/logs` (audit.read) · سجل النشاط الموحّد `/activity` (audit.read) |

لا حذف لأي Route: `/email`, `/analytics`, `/services`, `/jobs`, `/failures` تبقى مسارات مستقلة
يُوصل إليها من التبويبات، مع Active State وBreadcrumb وصلاحية صحيحة.

## 2) إصلاحات التنقل والحالة

- **Active State للمسارات العميقة**: تعميم مطابقة أطول مسار (`resolveNavMatch`) على تمييز عنصر
  القائمة، بحيث `/billing/123`, `/sales/<id>`, `/support/<ticketId>` تُبقي المجموعة مفتوحة
  والعنصر Active — مع اختبار كل حالة في المتصفح.
- **حفظ حالة الطيّ**: يبقى `localStorage` لكن بمفتاح خاص بالمستخدم
  (`mehla-admin-nav-collapsed:<staffId>`) لمنع إعدادات مربكة عند تغيّر المستخدم على الجهاز،
  والقراءة داخل `useEffect` (لا Hydration mismatch، والمسار `ssr:false` أصلاً). الافتراضي: كل
  المجموعات مفتوحة، ولا تُخزَّن أي بيانات حساسة. على الجوال تُفتح دائماً المجموعة الحاوية للمسار.
- **SectionTabs**: التأكد من إخفاء الشريط عند تبويب واحد بعد تصفية الصلاحية، وأن Deep-link
  وRefresh يبقيان على نفس التبويب، وأن التمرير الأفقي داخلي لا يسبب Page Scroll، ومراجعة ARIA
  (روابط حقيقية + `aria-current`) والتنقل بلوحة المفاتيح في RTL.
- **Breadcrumb**: مستوى التفاصيل من بيانات حقيقية (رقم الفاتورة/التذكرة/المستند)، وأثناء
  التحميل لا يُمرَّر Breadcrumb (لا `undefined`)، وعند فشل الجلب نص بديل مفهوم بدل معرّف UUID.

## 3) إعادة بناء `/mehla-admin` كمركز قيادة

تُقسَّم الصفحة إلى مكوّنات في `src/components/admin/command-center/`، وكل Widget معزول
(Loading / Empty / Error + إعادة محاولة موضعية) فلا يُسقط Widget واحد الصفحة، ولا Toast عند
التحميل. الترتيب النهائي:

```text
Header + نطاق زمني
→ 8 مؤشرات رئيسية
→ تحتاج انتباهك (Alerts)
→ الاتجاهات (3 رسوم)
→ الصحة التشغيلية + جاهزية التكاملات
→ ملخص المالية · الدعم · البريد
```

**المؤشرات الثمانية ومصادرها (بلا أي رقم Placeholder):**

| المؤشر | المصدر |
| --- | --- |
| المكاتب النشطة | `getPlatformMetrics.organizations.active` |
| الاشتراكات النشطة | `getPlatformMetrics.subscriptions.active` |
| MRR | `getPlatformMetrics.revenue.mrr` |
| ARR | `getPlatformMetrics.revenue.arr` |
| مدفوعات فاشلة/متعثرة | `billingOverview` (محاولات فاشلة + فواتير متأخرة) |
| تذاكر خارج SLA | `getActivityOverview.tickets.breached` / `getSupportQueueCounts` |
| رسائل بريد فاشلة | `getJobsOverview` (outbox failed / dead-letter) |
| أعطال خدمات مفتوحة | `getServiceHealth` + `getPlatformMetrics.reliability` |

المؤشرات المالية تظهر فقط لمن يملك صلاحيتها؛ عند غيابها تُخفى البطاقة بدل عرض صفر مضلّل.
كل القيم من دوال خادمية قائمة — لا حساب مالي في React.

**تحتاج انتباهك**: منطق اشتقاق صافٍ في `src/lib/admin-command-center.shared.ts` يحوّل حِمول
الدوال القائمة إلى تنبيهات، ولا يُعرض تنبيه بلا إجراء. كل تنبيه = سبب + خطورة (حرِج/تحذير/
معلومة) + وقت + CTA. الحالات: تذاكر تجاوزت SLA → `/support`، مدفوعات متعثّرة → `/billing`،
بريد فاشل أو Dead Letter → `/mail`، Jobs فاشلة → `/jobs`، Webhook failures وتكامل متدهور →
`/integrations`، اشتراكات تنتهي خلال ١٤ يوماً أو مكاتب بلا اشتراك → `/subscriptions`، أعطال
أمنية → `/failures`، نسخ احتياطية تحتاج تدخّلاً → `/backups`.

**الاتجاهات**: ثلاثة رسوم فقط من `getGrowthSeries` والمؤشرات — نمو المكاتب/الاشتراكات،
الإيراد، حجم تذاكر الدعم — بمدى ٧ و٣٠ يوماً (المدعوم فعلياً 7–180)، ويُعرض فقط ما تدعمه البيانات.

**الصحة التشغيلية**: ملخص مصغّر (قاعدة البيانات، البريد، المهام، Webhooks، التكاملات) بحالات
Healthy / Degraded / Down / **غير مهيأ**، مع «عرض مركز المراقبة». التكاملات غير المهيأة (الدفع،
WhatsApp، OTP) تُعرض «غير مهيأ» أو «جاهز للربط» ولا تُحسب أعطالاً ولا تُنتج تنبيهاً، وتُترك في
بطاقتها مساحة أيقونة (slot) لشعار المزوّد مستقبلاً دون إعادة تصميم.

**الملخصات**: مالية (MRR / ARR / إيراد الفترة / Outstanding / Failed) → `/billing`؛ دعم (مفتوحة /
بلا مسؤول / خارج SLA / متوسط أول رد) → `/support`؛ بريد (Queue / Failed / Dead Letter / حالة
المزوّد) → `/mail`. الأرقام التفصيلية الحالية (الاستخدام، التخزين، قاعدة البيانات، آخر
التسجيلات) لا تُفقد: مكانها الطبيعي `/analytics` و`/monitoring` و`/users`.

## 4) الاختبار قبل الإغلاق

- **الصلاحيات**: محاكاة 8 أدوار (super_admin, Support Agent, Finance Manager, Sales Rep,
  HR Manager, Security Admin, Auditor, Read Only) عبر `platform_roles` بحساب QA، والتأكد أن
  القائمة والتبويبات وبطاقات المركز تتغيّر فعلياً، وأن `requireStaff` ما زال يرفض الوصول
  المباشر للمسار حتى مع إخفاء العنصر (Navigation permission ≠ Authorization).
- **الجوال**: 320 / 375 / 390 / 430 / 440 / 768 / 1024 / 1440 بلقطات Playwright: لا تمرير أفقي،
  لا قص نص التنبيهات، الأرقام الكبيرة لا تكسر البطاقة، الرسوم داخل حدودها، أهداف لمس ≥44px،
  Safe Area، RTL صحيح.
- **الفحوص**: Type Check = 0، ESLint = 0 أخطاء، Production Build ناجح، ثم Regression في المتصفح
  على كل مجموعة وكل عنصر وكل تبويب وكل CTA في المركز.

ثم يُسلَّم **PHASE 2 CLOSURE REPORT** بالبنود الـ11 المطلوبة، والتوقف قبل Phase 3.