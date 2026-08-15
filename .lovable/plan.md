# MEHLA OPERATIONAL SCORE — FINAL MIGRATION APPLY REVIEW (READ-ONLY)

نطاق المراجعة: ملفا الهجرة فقط + الاعتماديات المباشرة. لا تطبيق، لا نشر.

## 1. ORDER / DEPENDENCIES

- الحالة الفعلية في الإنتاج: الجدولان `organization_ranking_settings` و`operational_score_snapshots` **غير موجودين**، ودالة `private.ranking_settings_guard` **غير موجودة** — أي أن الهجرتين لم تُطبَّقا بعد.
- الاعتماديات المطلوبة موجودة مسبقاً في الإنتاج: `private.is_platform_staff`، `private.has_platform_permission`، `public.set_updated_at`، `public.deny_update`، وجداول `organizations` و`profiles` و`organization_members` (بأعمدة `status` و`role`).
- الهجرة 2 تعتمد على `public.organization_ranking_settings` (تنشئها الهجرة 1) وعلى `CREATE OR REPLACE` لدالة الحارس نفسها. لا Object في الهجرة 2 غير موجود بعد الهجرة 1.
- الترتيب الصحيح والملزم: `20260815014500_operational_score_ranking.sql` ثم `20260815131500_operational_score_optin_metadata.sql` (مطابق للترتيب الزمني للأسماء).

## 2. SQL SAFETY

- `CREATE TABLE` لجدولين جديدين فقط — لا تعارض في الأسماء مع Production schema.
- GRANTS صريحة موجودة: `authenticated` (قراءة/إدراج/تحديث للإعدادات، قراءة فقط للقطات) و`service_role` كامل. لا منح لـ `anon` على أي من الجدولين → لا وصول عام مباشر.
- RLS مفعّلة على الجدولين مع سياسات: قراءة الإعدادات لأعضاء المكتب النشطين أو موظفي المنصة، والإنشاء/التحديث لأدوار owner/admin أو صلاحية `organizations.update`؛ اللقطات قراءتها لموظفي المنصة فقط.
- Triggers: حارس الحقول المنصية + `set_updated_at` على الإعدادات، و`deny_update` على اللقطات (سجل غير قابل للتعديل).
- Indexes على `(organization_id, computed_at DESC)` و`(window_kind, computed_at DESC)` — تدعم اختيار أحدث لقطة لكل مكتب.
- FKs إلى `organizations(id)` بـ `ON DELETE CASCADE` وإلى `profiles(id)` بـ `ON DELETE SET NULL`. CHECKs ثابتة (لا `now()`) فلا مخاطر استعادة.
- الهجرة 2 تستخدم `ADD COLUMN IF NOT EXISTS` لعمودين nullable بلا DEFAULT — عملية Metadata-only.

## 3. EXISTING DATA SAFETY

- لا يوجد أي `UPDATE` أو `DELETE` أو `INSERT` في الهجرتين على أي جدول قائم. لا مساس بـ tasks / deadlines / hearings / cases / clients / documents / billing / subscriptions.
- لا تغيير على جداول قائمة إطلاقاً باستثناء `ALTER TABLE ... ADD COLUMN` على الجدول الجديد نفسه الذي أنشأته الهجرة 1.
- `public_opt_in boolean NOT NULL DEFAULT false` → أي صف يُنشأ لاحقاً يبدأ بلا ظهور عام.

## 4. EXISTING ORGANIZATIONS

- لا Backfill ولا إنشاء صفوف تلقائي: المكاتب القائمة لا يُنشأ لها صف في `organization_ranking_settings` عند التطبيق. الصف يُنشأ عند أول استخدام (موافقة/تأجيل/عرض دعوة) عبر كود الخادم، وهو النمط الذي يدعمه `ranking.server.ts`.
- النتيجة: غياب الصف = لا ظهور عام، ووجود الصف الجديد = `false` افتراضاً. لا مكتب يظهر عاماً تلقائياً في الحالتين.

## 5. OPT-IN GUARD (بعد الهجرة 2)

- `false → true`: الحارس يفرض `opted_in_at := now()` و`opted_in_by := auth.uid()`.
- `true → true`: يُعاد فرض قيم `OLD` — لا يستطيع العميل تعديل التوثيق.
- `true → false` (وأي حالة بلا موافقة): يُفرَّغ الحقلان إلى `NULL`.
- `INSERT` مع `public_opt_in = true` يُوثَّق من القاعدة؛ وإلا `NULL`.
- أي قيمة يرسلها العميل عبر Data API لهذين الحقلين تُستبدل داخل `BEFORE INSERT OR UPDATE` → لا إمكانية لتزوير التوثيق.
- حقول الاستثناء المنصية (`platform_excluded` وما يتبعها) محجوبة عن أي دور مكتب عبر استثناء صريح.

## 6. PROMPT FIELDS

- `opt_in_prompted_at` و`opt_in_snoozed_until` كلاهما `timestamptz` nullable بلا `NOT NULL` وبلا DEFAULT → لا يعطلان صفوفاً قائمة (ولا توجد صفوف أصلاً عند التطبيق) ولا يحتاجان Backfill.

## 7. SNAPSHOT SAFETY

- `operational_score_snapshots` تُنشأ فارغة. لا `INSERT` في الهجرة، ولا Trigger يولّد لقطات.
- التوليد يحصل فقط عبر تشغيل صريح لمسار `/api/public/hooks/operational-score` (محمي بسر التشغيل). فحص `cron.job` الحالي يُظهر 4 مهام فقط (cleanup / email-dispatch / mail-sync / notifications-dispatch) — **لا مهمة دورية لمؤشر الإنجاز**.

## 8. PUBLIC SAFETY AFTER APPLY

- `PUBLIC_FEATURE_AFTER_MIGRATION_ONLY: DISABLED` — بثلاث طبقات مستقلة:
  1. مكوّن `src/components/marketing/top-offices.tsx` غير مستورد في أي صفحة (لا وجود له في الصفحة الرئيسية).
  2. لا لقطات في القاعدة ولا مهمة Cron لتوليدها.
  3. لا `GRANT` لدور `anon` على أي من الجدولين، ولا سياسة قراءة عامة.

## 9. ROLLBACK

- فشل الهجرة 1: لا شيء لاسترجاعه (كل عبارة داخل معاملة الهجرة).
- نجاح 1 وفشل 2: الوضع آمن وقابل للبقاء — الجدولان موجودان، `public_opt_in = false` افتراضاً، بلا صفوف وبلا لقطات وبلا ظهور عام. الخيارات: إصلاح الهجرة 2 وإعادة تطبيقها لاحقاً، أو التراجع بـ
  `DROP TABLE public.operational_score_snapshots; DROP TABLE public.organization_ranking_settings; DROP FUNCTION private.ranking_settings_guard();`
  (آمن لأن الجدولين لا يحتويان بيانات إنتاج).
- نجاح كامل وفشل QA الخادمي: التعطيل بلا حذف بيانات — أولاً عدم إضافة مهمة Cron / إيقافها إن أُضيفت، وعدم ربط مكوّن الترتيب بأي صفحة عامة. ثم عند الحاجة تصفير الظهور عبر أداة الإدارة أو تعيين `platform_excluded = true` للمكاتب المعنية بصلاحية منصة. الحذف الهيكلي آخر خيار.

## 10. APPLY BLAST RADIUS

- **LOW**: إنشاء جدولين جديدين + عمودين جديدين على أحدهما فقط، بلا لمس أي بيانات أو جداول إنتاج، بلا قفل على جداول مزدحمة، بلا Backfill، والميزة العامة معطّلة بعد التطبيق.

## OUTPUT

- MIGRATION_1: PASS
- MIGRATION_2: PASS
- MIGRATION_ORDER: PASS
- DEPENDENCIES: PASS
- EXISTING_DATA_SAFETY: PASS
- PUBLIC_OPT_IN_DEFAULT_FALSE: PASS
- EXISTING_ORGS_SAFE: PASS
- OPT_IN_GUARD_AFTER_APPLY: PASS
- PROMPT_FIELDS_SAFE: PASS
- SNAPSHOT_TABLE_STARTS_EMPTY: YES
- PUBLIC_FEATURE_AFTER_MIGRATION_ONLY: DISABLED
- ROLLBACK: READY
- BLAST_RADIUS: LOW
- FINAL_APPLY_VERDICT: **READY_TO_APPLY**

STOP — لا تطبيق ولا نشر في هذه الجولة.
