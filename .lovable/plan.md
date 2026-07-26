# مِهلة | MEHLA — المرحلة الثانية

## نطاق المرحلة
بناء الطبقة الخلفية الكاملة (Lovable Cloud / Supabase) + نظام المصادقة + لوحة التحكم الداخلية بجميع صفحاتها مربوطة فعلياً بقاعدة البيانات مع RLS وعزل المكاتب. الصفحة الرئيسية الحالية تبقى كما هي مع حذف أيقونة الساعة فقط.

## 1. تنظيف الصفحة الرئيسية (تعديل بسيط فقط)
- إزالة أيقونة الساعة/المؤقت من شعار "مِهلة MEHLA" في الهيدر والفوتر وأي مكان آخر.
- ربط أزرار "تسجيل الدخول" بـ `/login`، "ابدأ الآن" وأزرار الباقات بـ `/register`.
- عدم تعديل الألوان أو الخطوط أو الأقسام.

## 2. تفعيل Lovable Cloud
- تفعيل Cloud (Supabase) قبل أي شيء آخر.
- إنشاء المخطط عبر migrations، والبيانات (RLS/دوال/تريجرات) وفق قواعد Lovable.

## 3. قاعدة البيانات (Migrations)

### Enums
- `app_role`: owner, admin, lawyer, legal_assistant, viewer
- `case_status`, `case_priority`, `client_role`, `client_type`, `hearing_status`, `deadline_status`, `deadline_type`, `task_status`, `update_type`, `invitation_status`, `member_status`

### الجداول
1. `profiles` (مربوط بـ auth.users) + trigger `handle_new_user`
2. `organizations`
3. `organization_members` (unique organization_id + user_id) — يحمل الدور
4. `organization_invitations`
5. `clients`
6. `cases`
7. `case_parties`
8. `hearings`
9. `deadlines`
10. `tasks`
11. `case_updates`
12. `documents`
13. `notifications`
14. `activity_logs`
15. `user_notification_preferences`

- كل جدول (عدا profiles) يحمل `organization_id` مع فهرس.
- فهارس على: case_id, client_id, assigned_lawyer_id, assigned_to, hearing_date, due_date, status, created_at.
- GRANTs للـ authenticated و service_role (لا anon).

### الدوال الأمنية (SECURITY DEFINER, search_path=public)
- `is_organization_member(_org uuid, _user uuid)`
- `has_organization_role(_org uuid, _user uuid, _roles app_role[])`
- `get_user_organizations(_user uuid)` — قائمة org_ids للمستخدم
- `can_access_case(_case uuid, _user uuid)`
- `current_user_orgs()` helper

### RLS
- تفعيل RLS على كل الجداول.
- سياسات: SELECT/INSERT/UPDATE/DELETE مقيدة بعضوية المكتب.
- owner/admin: كل شيء داخل المكتب.
- lawyer: يرى القضايا المسندة إليه + ما ينشئه.
- legal_assistant: مهام/مستندات/تحديثات ضمن قضايا المكتب.
- viewer: SELECT فقط.
- documents/notifications/tasks: قيود إضافية على المستخدم.

### Triggers
- `handle_new_user` → إنشاء profile.
- `updated_at` trigger عام.
- عند إنشاء case/hearing/deadline/document/status change → إدراج في `case_updates` و`activity_logs`.

### Storage
- Bucket `case-documents` (Private) عبر أداة Cloud.
- سياسات storage.objects: قراءة/كتابة/حذف مقيدة بعضوية المكتب (المسار يبدأ بـ organization_id).

## 4. نظام المصادقة
- `src/routes/auth/login.tsx` → `/login`
- `src/routes/auth/register.tsx` → `/register`
- `/forgot-password`, `/reset-password`
- `/onboarding` — إنشاء المكتب (owner)
- استخدام Supabase Auth + email/password (بدون Google في هذه المرحلة لعدم طلبها).
- Zod + React Hook Form.
- Route guard: layout `_authenticated` مُدار من التكامل. إعادة توجيه من `/onboarding` تلقائياً إذا لم يكن للمستخدم مكتب.
- Bearer middleware في `src/start.ts` (attach).

## 5. لوحة التحكم (تحت `_authenticated`)
Layout مستقل:
- Sidebar يميناً (RTL) قابل للطي، Drawer على الجوال.
- روابط: الرئيسية، القضايا، العملاء، التقويم، المهام، المهل، المستندات، الفريق، التنبيهات، الإعدادات.
- Footer: اسم المستخدم + المكتب + تسجيل خروج.

### المسارات
- `/dashboard` — بطاقات + عاجل اليوم + خلال أسبوع + آخر تحديثات
- `/cases`, `/cases/new`, `/cases/$id` (Tabs: نظرة عامة/الخط الزمني/الجلسات/المهل/المهام/المستندات/الأطراف/الملاحظات)
- `/clients`, `/clients/new`, `/clients/$id`
- `/calendar` (شهري + أسبوعي)
- `/tasks`
- `/deadlines`
- `/documents`
- `/team` (owner/admin فقط) — دعوات
- `/notifications`
- `/settings` (حساب/مكتب/تنبيهات/أدوار/سجل نشاط)

كل الصفحات: Loading/Empty/Error states + Skeleton + Toasts عربية + Pagination (20) + بحث Debounced.

## 6. الخدمات والـ Hooks
- `services/*.service.ts` لكل كيان.
- `hooks/useAuth`, `useOrganization`, `usePermissions`, `useCases`, `useClients`, …
- `lib/supabase.ts`, `permissions.ts`, `date-utils.ts`, `constants.ts`.
- `schemas/*.schema.ts` (Zod).
- `types/*.ts`.

## 7. التنبيهات التلقائية
- Server route (بديل Edge Function): `src/routes/api/public/cron/generate-reminders.ts`
- يُشغَّل يومياً عبر pg_cron لاحقاً (توثيق فقط).
- يبحث ويُنشئ notifications دون تكرار (unique metadata key).

## 8. سجل النشاط
- خدمة `activity.service.ts` تُضاف عند كل عملية مؤثرة.
- عرض للـ owner/admin فقط.

## 9. الأمان
- كل الاستعلامات عبر RLS باستخدام client المُصادق.
- بدون service role في المتصفح.
- Signed URLs للمستندات.
- تحقق نوع/حجم الملف (≤20MB, PDF/DOC/DOCX/XLS/XLSX/JPG/PNG).
- تنقية النصوص، لا `dangerouslySetInnerHTML`.
- soft-archive بدلاً من الحذف للقضايا والعملاء.

## 10. مؤجل للمرحلة الثالثة
- المدفوعات/الاشتراكات، ناجز، WhatsApp/SMS، AI، تقارير مالية، مذكرات قانونية، البريد الفعلي.

## ملاحظات تقنية
- المشروع TanStack Start v1، routes ملفية تحت `src/routes/`. سنستخدم:
  - Public: `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`
  - Protected: `_authenticated/onboarding.tsx`, `_authenticated/dashboard.tsx`, `_authenticated/cases.*`, إلخ. (route.tsx مُدار من التكامل)
- استخدام TanStack Query + Suspense pattern.
- كل ذلك RTL مع الخط الحالي `IBM Plex Sans Arabic`.

## المخرجات
تقرير نهائي في المحادثة يغطي: الجداول، العلاقات، RLS، المسارات، الملفات، الوظائف العاملة، المؤجل، النقاط التي تحتاج إعداداً يدوياً (تفعيل تأكيد البريد، جدولة cron)، خطوات الاختبار، تأكيد إزالة أيقونة الساعة.

هل أبدأ التنفيذ؟
