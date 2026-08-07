# حرّاس الأمان الآليون — منصة مِهلة

الوحدات المجمّدة (لا تُعدّل إلا بسبب مؤكد وموثّق): **المركز المالي**، **RBAC**،
**سياسات الأمان الحالية (RLS / GRANT / SECURITY DEFINER)**.

## 1. الفحص الآلي

| الطبقة         | الملف                             | التشغيل                                |
| -------------- | --------------------------------- | -------------------------------------- |
| الكود          | `scripts/security-guardrails.ts`  | `bun run security:check`               |
| قاعدة البيانات | `scripts/security-guardrails.sql` | استعلام قراءة فقط؛ أي صف يرجع = مخالفة |

### ما يُفشل الفحص

| المعرّف                                             | الطبقة | الشرط                                                                                                     |
| --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `secdef_executable_by_anon`                         | DB     | دالة `SECURITY DEFINER` في `public` أو `private` قابلة للتنفيذ من `anon` أو `PUBLIC`.                     |
| `undocumented_authenticated_rpc`                    | DB     | دالة `SECURITY DEFINER` جديدة قابلة للاستدعاء من `authenticated` وغير مُدرجة في القائمة الموثّقة أدناه.   |
| `authenticated_rpc_without_uid_check`               | DB     | دالة مسموح استدعاؤها من `authenticated` بلا فحص `auth.uid()` في جسمها.                                    |
| `table_without_rls`                                 | DB     | جدول جديد في `public` بدون تفعيل RLS.                                                                     |
| `anon_exposed_table`                                | DB     | جدول يمنح صلاحيات للزوّار وليس ضمن جداول القراءة العامة (`platform_plans` فقط).                           |
| `granted_without_policy`                            | DB     | جدول يمنح `authenticated` قراءةً بلا أي سياسة RLS (منح صامت).                                             |
| `hardcoded_secret:*`                                | Code   | مفتاح حقيقي مكتوب في الكود (Supabase secret، JWT دور الخدمة، PEM، OpenAI، AWS، SendGrid، Resend، Twilio). |
| `secret_in_logs`                                    | Code   | `console.*` يسجّل متغيّر بيئة يحوي `SECRET/PASSWORD/SERVICE_ROLE/API_KEY/TOKEN`.                          |
| `secret_exposed_to_browser`                         | Code   | متغيّر `VITE_*` يحمل سرّاً فيُحزَم في المتصفح.                                                            |
| `rpc_undocumented` / `rpc_documentation_incomplete` | Code   | نقص توثيق أي دالة من دوال `authenticated`.                                                                |

قاعدة العمل: أي دالة جديدة قابلة للاستدعاء من `authenticated` تتطلّب صفّاً كاملاً في
الجدول التالي، وإلّا يفشل الفحص. لا يُوسَّع الجدول إلا بمراجعة أمنية.

## 2. الدوال الست عشرة المسموح استدعاؤها من `authenticated`

| الدالة                           | الغرض                                                     | فحص الهوية الداخلي                 | فحص صلاحية المكتب/المنصة                                                     | الجداول التي تصل إليها                                                                       | سبب السماح                                                                               |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `admin_platform_metrics`         | مؤشّرات لوحة إدارة المنصة (اشتراكات، MRR، تحويل التجارب). | `auth.uid() IS NULL` ⇒ `FORBIDDEN` | `private.is_platform_staff` ثم `revenue.read` لكشف الأرقام المالية           | `subscriptions`, `organizations`, `platform_staff`                                           | تجميع عبر مكاتب متعددة لا يمكن تعبيره في RLS لصف واحد؛ يُنفّذ داخل الدالة بعد فحص الدور. |
| `billing_reports`                | تقارير الفوترة للمنصة خلال مدة.                           | `auth.uid()` إلزامي                | `billing.view_reports` أو `billing.read`                                     | `platform_invoices`, `platform_payments`                                                     | تجميع مالي عبر كل المكاتب؛ بديله كشف جداول الفوترة للقراءة المباشرة.                     |
| `billing_save_draft`             | إنشاء/تعديل مسوّدة فاتورة منصة وبنودها ذرّياً.            | `auth.uid()` إلزامي                | `billing.create` للإنشاء و`billing.update` للتعديل، ومنع تعديل غير المسوّدات | `platform_invoices`, `platform_invoice_items`, `platform_staff`, `platform_number_sequences` | عملية متعدّدة الجداول تحتاج ذرّية وترقيماً متسلسلاً؛ الكتابة المباشرة تكسر التسلسل.      |
| `billing_match_reconciliation`   | مطابقة حركة بنكية بدفعة.                                  | `auth.uid()` إلزامي                | `billing.reconcile`                                                          | `platform_bank_reconciliations`, `platform_payments`, `platform_staff`                       | تحتاج `FOR UPDATE` على صفّين وتحقّق عملة/مبلغ في معاملة واحدة.                           |
| `billing_reopen_period`          | اعتماد إعادة فتح فترة مالية مقفلة.                        | `auth.uid()` إلزامي                | `billing.reopen_period` + منع الاعتماد الذاتي (Four-Eyes)                    | `platform_period_reopen_approvals`, `platform_financial_periods`, `platform_staff`           | مبدأ الأربع أعين مفروض في القاعدة لا في الواجهة.                                         |
| `create_organization_with_owner` | إنشاء مكتب وربط المالك أول مرة.                           | `auth.uid()` إلزامي ويُستخدم كمالك | لا صلاحية سابقة (حالة تأسيس)، ويمنع إنشاء مكتب ثانٍ لنفس المالك              | `organizations`, `organization_members`, `profiles`                                          | مشكلة «الدجاجة والبيضة»: لا عضوية بعد، فسياسات RLS الاعتيادية تمنع الإدراج.              |
| `my_subscription_overview`       | ملخّص اشتراك المكتب وحدوده للمستخدم.                      | `auth.uid()` إلزامي                | `private.is_organization_member(_organization_id, auth.uid())`               | `subscriptions`, `platform_plans`, `usage_counters`                                          | يقرأ باقات المنصة مع عدّادات المكتب دون كشف جداول الباقات والاستخدام.                    |
| `my_case_party_permissions`      | الصلاحيات الفعّالة للمستخدم على بيانات أطراف القضية.      | `auth.uid()` إلزامي                | عضوية المكتب + دمج الدور والمنح الصريحة غير المنتهية                         | `case_party_permissions`, `organization_members`                                             | تحتاج قراءة منح مستخدمين آخرين للحساب، ولا يجوز كشف الجدول للقراءة.                      |
| `consume_ocr_pages`              | خصم رصيد صفحات OCR شهرياً.                                | `auth.uid()` داخل فحص العضوية      | `private.is_organization_member` + حدّ الباقة                                | `usage_counters`, `subscriptions`, `platform_plans`                                          | حدّ استهلاك يجب أن يكون ذرّياً وغير قابل للتلاعب من العميل.                              |
| `record_metered_usage`           | تسجيل استخدام مُقاس (تخزين، رسائل، صفحات).                | `auth.uid()` داخل فحص العضوية      | `private.is_organization_member`                                             | `usage_counters`                                                                             | العدّاد يجب أن يزيد فقط عبر منطق موثوق، لا بكتابة مباشرة من العميل.                      |
| `print_copy_number`              | توليد رقم نسخة الطباعة المتسلسل للمستند.                  | `auth.uid()` داخل فحص العضوية      | `private.is_organization_member`                                             | `print_audit_logs`                                                                           | تسلسل غير قابل للتزوير يخدم العلامة المائية وسجل الطباعة غير القابل للتعديل.             |
| `admin_activity_overview`        | ملخّص نشاط المنصة للوحة الإدارة.                          | `auth.uid() IS NULL` ⇒ `FORBIDDEN` | `private.is_platform_staff`                                                  | `activity_logs`, `admin_audit_logs`, `platform_staff`                                         | تجميع نشاط عبر كل المكاتب لا يمكن تعبيره في RLS لصف واحد.                                |
| `admin_growth_series`            | سلسلة نمو المكاتب والمستخدمين والإيراد.                    | `auth.uid() IS NULL` ⇒ `FORBIDDEN` | `private.is_platform_staff` ثم `revenue.read` لكشف الأرقام المالية           | `organizations`, `profiles`, `subscriptions`                                                  | تجميع زمني عبر المنصة، والإيراد محجوب عن الموظف بلا صلاحية مالية.                        |
| `admin_jobs_overview`            | حالة طوابير التشغيل (بريد، إشعارات، معالجة مستندات).      | `auth.uid() IS NULL` ⇒ `FORBIDDEN` | `private.is_platform_staff`                                                  | `email_outbox`, `notification_queue`, `document_processing_jobs`                              | جداول التشغيل خادمية بالكامل؛ العدّادات فقط تُكشف بدل كشف الجداول.                        |
| `admin_service_health`           | صحة التكاملات وزمن استجابتها.                             | `auth.uid() IS NULL` ⇒ `FORBIDDEN` | `private.is_platform_staff`                                                  | `integration_definitions`, `platform_integrations`, `integration_health_logs`                 | تمنع كشف جداول التكاملات وأسرارها مع إظهار الحالة فقط.                                   |
| `recalc_invoice`                 | إعادة حساب مجاميع فاتورة منصة.                            | `service_role` أو `auth.uid()`     | `private.is_platform_staff` عند الاستدعاء البشري                             | `platform_invoices`, `platform_invoice_items`                                                 | حساب مالي يجب أن يبقى في القاعدة ذرّياً، ولا يُحسب في الواجهة.                            |

### مبادئ ثابتة

1. كل دالة أعلاه تبدأ بفحص هوية ثم فحص صلاحية، وترمي `FORBIDDEN` قبل أي وصول للبيانات.
2. مساعدات `private.*` محصورة بـ `authenticated` (مساعدات RLS) و`service_role` (الخلفية) فقط.
3. الجداول الخادمية البحتة (`case_code_registry`, `case_lookup_attempts`, `otp_verifications`,
   `integration_secrets`, `design_*`) مغلقة بلا سياسات ومحصورة بـ `service_role` — «مغلق افتراضاً».
4. لا صلاحية لموظف المنصة على بيانات المكاتب؛ الاستثناء الوحيد `support_access_grants` بموافقة المكتب ومدة محددة.

## تشغيل الحرّاس في CI

يعمل سير العمل `.github/workflows/security.yml` على كل Pull Request وعلى الدفع إلى `main`،
ويمنع الدمج عند ظهور أي مخالفة، بثلاث وظائف:

| الوظيفة            | الأمر                    | ما يفشل عليه                                                    |
| ------------------ | ------------------------ | --------------------------------------------------------------- |
| `code-guardrails`  | `bun run security:check` | سرّ في الكود، تسجيل سرّ، تعريض سرّ للمتصفح، نقص توثيق دالة RPC. |
| `dependency-audit` | `bun audit`              | ثغرة عالية أو حرجة في الحزم.                                    |
| `db-guardrails`    | `bun run security:db`    | أي صف يرجع من `scripts/security-guardrails.sql`.                |

`security:db` ينفّذ ملف SQL نفسه عبر `psql` كقراءة فقط، ويحتاج سرّ المستودع
`SECURITY_CHECK_DATABASE_URL` (اتصال قراءة فقط بقاعدة البيانات). محلياً يكفي
`DATABASE_URL` أو متغيّرات `PG*` القياسية، ثم `bun run security:all` لتشغيل الطبقتين معاً.

لجعل المنع فعّالاً على الدمج: Settings ← Branches ← قاعدة حماية `main` ←
اجعل الفحوص `code-guardrails` و`dependency-audit` و`db-guardrails` مطلوبة.
