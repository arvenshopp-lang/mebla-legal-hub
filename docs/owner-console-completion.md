# جرد إغلاق Owner Console — لوحة `/mehla-admin`

آخر تحديث: 2026-08-05 · نطاق المستند: حالة كل وحدة في لوحة مالك المنصة، وما تبقى حتى الإغلاق المعماري.

المرجعية: `src/components/admin/shell.tsx` (القائمة الجانبية والصلاحيات)،
`src/lib/admin-permissions.ts` (سجل الصلاحيات)، `src/lib/admin-guard.server.ts`
(`requireStaff` + `writeAudit`)، وملفات `src/lib/*.functions.ts` لكل وحدة.

## 1) حالة الوحدات

| # | الوحدة | المسار | الحالة | الصلاحية | التحقق |
|---|--------|--------|--------|----------|--------|
| 1 | Platform Overview | `/mehla-admin` | Complete | staff | فحص كود + بناء |
| 2 | CRM | `/mehla-admin/crm` | Complete (بانتظار اختبار وظيفي) | `crm.*` | فحص كود + Type + Build |
| 3 | العروض/المقترحات/العقود | `/mehla-admin/sales`, `/sales/$id` | Complete | `sales_docs.*` | فحص كود + Build |
| 4 | HR Center | `/mehla-admin/hr` | Complete (بانتظار اختبار وظيفي) | `hr.*` | فحص كود |
| 5 | Marketing Center | `/mehla-admin/marketing` | Complete (بانتظار اختبار وظيفي) | `marketing.*` | فحص كود |
| 6 | Integrations Center | `/mehla-admin/integrations`, `/sms` | External Dependency | `settings.manage` | فحص كود |
| 7 | Monitoring Center | `/monitoring`, `/services`, `/jobs`, `/analytics`, `/failures` | Complete | `monitoring.read` | فحص كود |
| 8 | Backup Center | `/mehla-admin/backups` | Partial (سجل + طلبات فقط) | `backups.manage/restore` | فحص كود |
| 9 | Content Management | `/mehla-admin/content`, `/seo`, `/design` | Complete | `settings.manage`, `seo.manage` | فحص كود |
| 10 | Audit & Activity | `/logs`, `/activity` | Complete | `audit.read` | فحص كود |
| 11 | Feature Flags | `/mehla-admin/flags` | Complete | `settings.manage` | فحص كود |
| 12 | Notification Rules | `/mehla-admin/flags` (تبويب) | Complete | `settings.manage` | فحص كود |
| 13 | Responsive & Mobile | كل المسارات | Partial | — | يحتاج تدقيقاً بصرياً بجلسة دخول |
| 14 | Global Search & Breadcrumbs | `shell.tsx` + `command-palette.tsx` | Complete | حسب الصلاحية | فحص كود |
| 15 | RBAC Templates & Permissions | `/mehla-admin/rbac`, `/staff` | Partial (لا قوالب أدوار جاهزة) | `staff.view` | فحص كود |
| 16 | Sidebar & Routes | `shell.tsx` | Complete (لا روابط 404) | حسب الصلاحية | تحقق آلي |
| 17 | Documentation | `docs/*` | Partial | — | مراجعة ملفات |
| 18 | Production Build | — | Complete (ESLint formatting فقط) | — | Type ✔ / Build ✔ / Lint ✖ |

## 2) الحوكمة الأمنية للوحدات الجديدة

| الوحدة | requireStaff | writeAudit | RLS |
|--------|--------------|-----------|-----|
| CRM | 38 موضعاً | 25 | 4 سياسات لكل جدول `crm_*` |
| HR | 11 | 5 | `hr_employees`, `hr_documents` |
| Marketing | 13 | 6 | `marketing_*` |
| Flags/Rules | 4 | 4 | `platform_feature_flags`, `platform_notification_rules` |
| Backups | 7 | 5 | `platform_backup_*` |
| Sales Docs | 19 | 15+ (`sales_document_events` غير قابل للتعديل) | 4 سياسات |

كل الكتابة تمر بـ `requireStaff` على الخادم؛ لا اعتماد على إخفاء الواجهة، ولا حسابات
مالية داخل العميل (المجاميع تُحسب عبر `computeSalesDocTotals` وتُعاد التحقق خادمياً +
`recalc_invoice`).

## 3) ما تبقى فعلياً

1. قوالب أدوار جاهزة (Role Templates) في `/mehla-admin/rbac` — الصلاحيات موجودة والأدوار
   تُبنى يدوياً، لكن لا توجد قوالب مُعرّفة مسبقاً.
2. Backup Center: تنفيذ الاستعادة الفعلي يعتمد على تنفيذ خارجي؛ اللوحة تسجّل وتوافق فقط.
3. تشغيل التكاملات (Integrations/SMS/Payments) يحتاج مفاتيح ومزوّدين خارجيين.
4. تدقيق Responsive فعلي عند 390/440/768/1024/1440 بجلسة دخول.
5. تنظيف ESLint (Prettier formatting بشكل رئيسي + `no-explicit-any` في طبقات الخادم).
6. توثيق مستقل لوحدات CRM / HR / Marketing / Backups (حالياً موثقة ضمن هذا الملف فقط).
