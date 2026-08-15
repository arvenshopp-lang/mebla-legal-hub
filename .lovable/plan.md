# مراجعة تطبيق هجرة الأساس — قناة بريد التنبيهات (المرحلة 1)

مراجعة قراءة فقط. لم يُطبَّق أي Migration، ولم تُنشأ مهمة دورية، ولم يُرسل بريد.

## نتيجة المراجعة

```text
FOUNDATION_MIGRATION:                     FIX_REQUIRED (بند واحد فقط: الاحتفاظ بسجل التسليم)
DIRECT_DEPENDENCIES:                      PASS
EXISTING_DATA_SAFETY:                     PASS
QUEUE_STARTS_EMPTY:                       YES
FOREIGN_KEY_RETENTION_MODEL:              FIX_REQUIRED
RLS:                                      PASS
DIRECT_BROWSER_ACCESS:                    NO
SECURITY_DEFINER_HARDENING:               PASS
CLAIM_RPC:                                PASS
STALE_RECOVERY:                           PASS
DB_IDEMPOTENCY:                           PASS
FOUNDATION_CONTAINS_CRON_SCHEDULE:        NO
PRODUCTION_NOTIFICATION_EMAIL_CRON_COUNT: 0
CRON_ACTIVATION_MIGRATION:                NOT_APPLIED
CONTROLLED_SINGLE_TEST_READY:             YES
ROLLBACK:                                 READY
BLAST_RADIUS:                             LOW
FINAL_APPLY_VERDICT:                      FIX_REQUIRED
```

## ما تم التحقق منه فعلياً على الإنتاج (قراءة فقط)

- `public.notifications` و`public.organizations` و`public.set_updated_at()` (trigger, non-SECDEF) و`gen_random_uuid()` ودور `service_role`: موجودة كلها.
- `public.notification_email_queue` و`claim_notification_email_batch`: غير موجودَين بعد ⇒ الطابور سيبدأ فارغاً والهجرة إنشائية بحتة.
- مهام `cron.job` الحالية خمس: `mehla-email-dispatch`, `mehla-notifications-dispatch`, `mehla-mail-sync`, `mehla-cleanup-secure-artifacts`, `mehla-operational-score`. عدد مهام بريد التنبيهات = 0.
- هجرة الأساس لا تحتوي `cron.schedule` ولا `net.http_post` ولا أي `UPDATE/DELETE/INSERT` على أي جدول قائم: لا Backfill ولا لمس للتذاكر أو العضويات أو التفضيلات أو `email_outbox` أو طوابير واتساب.
- الصلاحيات: `REVOKE ALL` من PUBLIC/anon/authenticated على الجدول والدالة، `GRANT` لـ `service_role` فقط، RLS مفعّل بسياسة واحدة لدور الخدمة ⇒ لا وصول من المتصفح.
- الدالة `SECURITY DEFINER` مع `SET search_path = public` وكل الكائنات مؤهَّلة بالمخطط؛ المالك المتوقع `postgres` كما في نظائرها (`claim_notification_batch`).
- منطق السحب: `FOR UPDATE SKIP LOCKED`، حد الدفعة مقيّد 1..100، زيادة محاولة واحدة فقط، إنهاء العالق المستنفد إلى `failed` برمز `STALE_MAX_ATTEMPTS` قبل السحب.

## البند الواجب حسمه قبل التطبيق: CASCADE وسجل التسليم

الوضع المثبت:

- سياسة `notif_delete_self` على `public.notifications` تسمح للمستخدم بحذف إشعاراته (DELETE لدور `authenticated` بشرط `user_id = auth.uid()`).
- `notification_email_queue.notification_id` مرجع بـ `ON DELETE CASCADE`.
- `sendAppEmail` لا يكتب أي سجل دائم عند النجاح؛ الفشل فقط يُسجَّل في سجل الأعطال. أي أن صف الطابور هو السجل الوحيد لإثبات "أُرسل بريد التنبيه هذا".

النتيجة: حذف المستخدم لإشعار داخل التطبيق يمحو سجل تسليم البريد المقابل نهائياً — وهذا يتعارض مع توقعات الاحتفاظ بسجل التسليم في مِهلة، ولا يجوز قبوله بصمت.

الخيار الموصى به (الأقل مخاطرة وبلا تغيير في نموذج التفرّد):

- الإبقاء على `ON DELETE CASCADE` لصف الطابور التشغيلي (صحيح وظيفياً: لا معنى لإرسال بريد لإشعار محذوف، ويحفظ `UNIQUE(notification_id)`).
- إضافة جدول سجل تسليم غير قابل للتعديل داخل هجرة الأساس نفسها: `notification_email_deliveries` بلا مفتاح أجنبي متسلسل على `notifications`، يُكتب صف واحد فيه عند الحالة النهائية (`sent` أو `failed`) بحقول: معرّف الإشعار كنص/UUID بلا FK، المكتب، المستخدم، نوع الحدث، القالب، البريد مُقنّعاً، الحالة، عدد المحاولات، رمز الخطأ، وقت الحدث. صلاحيات `service_role` فقط، RLS مفعّل، ومنع `UPDATE/DELETE` عبر Trigger كما في `print_audit_logs`.
- تعديل عامل المعالجة ليكتب سجل التسليم عند `markSent` و`markFailure` بشكل معزول (فشل السجل لا يُبطل الإرسال المُنجز).

بديل مرفوض: `ON DELETE RESTRICT` أو `SET NULL` — الأول يكسر حذف الإشعار على المستخدم، والثاني يخالف `NOT NULL` و`UNIQUE(notification_id)` ونموذج التفرّد المعتمد.

## خطة التنفيذ عند الموافقة

1. تعديل مصدر هجرة الأساس `20260815150000_notification_email_queue.sql` بإضافة `notification_email_deliveries` (جدول + REVOKE/GRANT + RLS + Trigger منع التعديل والحذف + فهرس على `notification_id` و`created_at`). لا تغيير في `notification_email_queue` ولا في دالة السحب ولا في الصلاحيات القائمة.
2. تعديل `src/lib/notifications/email-worker.server.ts` لكتابة سجل التسليم عند الحالة النهائية فقط، بمعالجة أخطاء معزولة.
3. تحديث `scripts/notification-emails.test.ts` باختبارات: وجود جدول السجل بلا FK متسلسل، منع UPDATE/DELETE، غياب أي صلاحية لـ anon/authenticated، وأن حذف الإشعار لا يمحو سجل التسليم.
4. التحقق: تشغيل الاختبارات المستهدفة + TypeCheck + ESLint. بلا تطبيق هجرة، بلا Cron، بلا إرسال بريد.

بعد ذلك يعاد إصدار قرار التطبيق، ثم يبقى الترتيب كما هو: تطبيق الأساس ← تحقق الأمان والطابور ← تأكيد Cron = 0 ← اختبار إرسال مفرد مضبوط ← تحقق التفرّد والتفضيلات ← تطبيق هجرة تنشيط Cron.

## الرجوع (Rollback)

- قبل الاختبار المضبوط والطابور فارغ: الرجوع الهيكلي بسيط (إسقاط الدالة ثم الجدولين). بلا أي أثر على بيانات قائمة.
- بعد إنشاء أي سجل تسليم فعلي: لا يُوصى بالرجوع الهدّام. الاستجابة الأولى لأي مشكلة هي إيقاف/عدم تنشيط العامل والمهمة الدورية، والتشخيص مع الحفاظ على سجل التسليم.
