# مراجعة تطبيق هجرة قناة بريد التنبيهات — المرحلة 1 (قراءة فقط)

لم يُطبَّق أي شيء: لا هجرة، لا Cron، لا بريد.

## 1. جرد محتوى الهجرة

الملف: `supabase/migrations/20260815150000_notification_email_queue.sql`

- TABLE: `public.notification_email_queue` (جديد، لا يمس أي جدول قائم)
- CONSTRAINTS: `status CHECK` بخمس حالات، `attempts >= 0 AND max_attempts > 0`، `UNIQUE(notification_id)`، مفتاحان أجنبيان: `notifications(id) ON DELETE CASCADE` و`organizations(id) ON DELETE CASCADE`
- INDEXES: `(status, scheduled_at)`، `(organization_id, created_at DESC)`، `(event_type, status)`
- TRIGGER: `trg_notification_email_queue_updated` على `set_updated_at()` (دالة قائمة)
- RLS: مُفعّل، وسياسة واحدة لدور الخدمة فقط
- GRANTS/REVOKES: سحب كل الصلاحيات من PUBLIC/anon/authenticated ومنح دور الخدمة فقط (جدولاً ودالة)
- FUNCTION: `claim_notification_email_batch(integer)` — SECURITY DEFINER، تنفيذ لدور الخدمة فقط
- CRON JOB: نعم — `cron.schedule('mehla-notification-emails', '* * * * *', ...)` مشروطة بعدم وجود المهمة

**CRON_WOULD_ACTIVATE_ON_APPLY: YES** — لذلك الهجرة بشكلها الحالي غير جاهزة للتطبيق.

## 2. الإصلاحات المطلوبة قبل التطبيق

1. **فصل الـ Cron:** إزالة بلوك `cron.schedule` من هجرة الأساس ونقله إلى هجرة تنشيط منفصلة تُطبَّق فقط بعد نجاح الاختبار المفرد المضبوط. الأساس يُطبَّق و`PRODUCTION_CRON_COUNT = 0`.
2. **تصحيح اسم حدث الرد (عطل وظيفي مثبت):** منتج ردود الدعم يكتب `notifications.type = 'support_new_reply'` (من `support_${event}` مع `event = "new_reply"`)، بينما قائمة السماح في `email-channel.shared.ts` تحتوي `support_reply` فقط. النتيجة الحالية: ردود الدعم لا تُدرج في الطابور إطلاقاً. الإصلاح: إضافة `support_new_reply` بالقالب نفسه، والإبقاء على `support_reply` لتغطية الصفوف القديمة (8 صفوف موجودة بهذا النوع).
3. **منع تعليق صف عند آخر محاولة:** استرجاع الصفوف العالقة في `processing` مشروط بـ `attempts < max_attempts`، فلو تعطل العامل أثناء المحاولة الأخيرة يبقى الصف في `processing` أبداً. الإصلاح داخل الدالة نفسها: تحويل صفوف `processing` الأقدم من 15 دقيقة التي استنفدت محاولاتها إلى `failed` بسبب `STALE_MAX_ATTEMPTS` قبل السحب.

## 3. نتيجة المراجعة التفصيلية

- **الجدول:** جديد بالكامل، لا تحديث ولا حذف لأي بيانات إنتاج. لا يحتوي أي نص رسالة أو محتوى تذكرة؛ فقط مفاتيح وحالة وبريد المستلم كلقطة تدقيق. `max_attempts = 4` معقول مع تراجع 2د/10د/60د.
- **الأمان:** الصلاحيات الافتراضية للمشروع تمنح `anon`/`authenticated` صلاحيات كاملة على أي جدول جديد في `public`، والهجرة تسحبها صراحةً في نفس الملف، مع RLS مفعّل وبلا أي سياسة لدور مستخدم ⇒ لا وصول من المتصفح.
- **السحب والتزامن:** `FOR UPDATE SKIP LOCKED` مع تحديث ذرّي إلى `processing` وزيادة `attempts` — لا يمكن لعاملين امتلاك نفس الصف. مهلة العلوق: **15 دقيقة**، والعامل يعمل بدفعات 25 صفاً، فاحتمال تجاوز إرسال واحد لـ15 دقيقة نظري فقط، ومفتاح التفرّد لدى المزوّد يمنع التكرار لو حدث.
- **نموذج الحالات:** queued → processing → sent / failed / cancelled، أو رجوع إلى queued بجدولة تراجع. الأسباب النهائية (عنوان موقوف، غير صالح، بريد غير مُهيّأ، قالب مفقود) لا تُعاد أبداً، والباقي محدود بـ`max_attempts` ⇒ لا حلقة لا نهائية.
- **التفرّد:** `UNIQUE(notification_id)` على مستوى القاعدة + `idempotency_key` حتمي (`notif-email:<notification_id>`) يُرسل فعلاً إلى خدمة البريد.
- **إعادة التحقق قبل الإرسال:** العامل يعيد قراءة الإشعار، ويتحقق من النوع في قائمة السماح، والعضوية النشطة في نفس المكتب، والبريد الحالي من `profiles`، و`email_enabled` لحظة الإرسال؛ أي تغيّر ⇒ `cancelled` بلا إرسال. البريد المخزَّن في الطابور لا يُستخدم للإرسال.
- **قائمة السماح:** ثلاثة أنواع فقط ولا سلوك "بريد لكل إشعار". `platform_broadcast` وبريد عملاء المكتب والجلسات والمهل والمهام غير مشمولة.
- **تغطية المنتجين:** `team_member_joined` (قبول الدعوة) و`support_ticket_created` مربوطان فعلاً عبر `createUserNotification`، وكلاهما داخل `try/catch` فلا تعتمد العملية التجارية على البريد. الردود غير مغطاة فعلياً بسبب فرق الاسم (البند 2).
- **القوالب:** الثلاثة عربية RTL، زر واحد إلى داخل المنصة، بلا نص الرد وبلا أي بيانات قضية أو عميل أو مستند، وبلا رقم تذكرة.
- **الأنظمة القائمة:** لا تعديل على `email_outbox`، ولا محرك البريد البشري، ولا طابور واتساب، ولا `notifications-dispatch`، ولا فواتير/عروض/عملاء المكتب، ولا نظام النتيجة التشغيلية.

## 4. مسار الاختبار المضبوط (للدفعة القادمة — لا يُنفَّذ الآن)

بعد هجرة الأساس والـ Cron مُغلق: إنشاء تذكرة دعم حقيقية بحساب QA (بلا أي بيانات قضايا) ⇒ التحقق من صف واحد `queued` ⇒ استدعاء `/api/public/hooks/notification-emails` مرة واحدة بسر التشغيل ⇒ التحقق من `status = sent` وعدم وجود صف ثانٍ ⇒ إعادة الاستدعاء للتأكد من عدم إرسال مكرر ⇒ اختبار إيقاف التفضيل ينتج `cancelled`.

## 5. التراجع

الاستجابة الأولى دائماً غير هدّامة: إيقاف مهمة الـ Cron (إن كانت مُنشأة) وتحويل الصفوف المعلّقة إلى `cancelled`. الحذف الهيكلي (الجدول + الدالة) مسموح فقط والطابور فارغ؛ إن احتوى سجل تسليم فيُحفظ ولا يُحذف.

## 6. الخلاصة النهائية

```text
MIGRATION_FOUNDATION: FIX_REQUIRED
CRON_WOULD_ACTIVATE_ON_APPLY: YES
CRON_SPLIT_REQUIRED: YES
FOUNDATION_CAN_APPLY_WITH_CRON_OFF: YES (بعد فصل الـ Cron)
QUEUE_TABLE: PASS
RLS: PASS
DIRECT_BROWSER_ACCESS: NO
CLAIM_CONCURRENCY: PASS
STALE_PROCESSING_RECOVERY: FIX_REQUIRED (تعليق عند آخر محاولة)
RETRY_MODEL: PASS
DB_IDEMPOTENCY: PASS
SEND_APP_EMAIL_SUPPORTS_IDEMPOTENCY: YES
PROVIDER_IDEMPOTENCY_IMPLEMENTED: YES
RESIDUAL_DUPLICATE_RISK: LOW (قبول المزوّد ثم انقطاع قبل الإقرار ⇒ إعادة محاولة بنفس المفتاح؛ لا نزعم تسليماً مرة واحدة بالضبط)
SEND_TIME_REVALIDATION: PASS
STALE_EMAIL_PROTECTION: PASS
EVENT_ALLOWLIST: FIX_REQUIRED (support_new_reply غير مدرج)
PRODUCER_COVERAGE: FIX_REQUIRED (الردود غير مغطاة فعلياً)
FAILURE_ISOLATION: PASS
TEMPLATES: PASS
EXISTING_SYSTEMS_UNCHANGED: PASS
CONTROLLED_SINGLE_TEST_READY: YES (بعد الإصلاحات الثلاثة)
ROLLBACK: READY
FOUNDATION_BLAST_RADIUS: LOW
FINAL_APPLY_VERDICT: FIX_REQUIRED
```

## 7. نطاق التنفيذ عند الاعتماد

- تعديل هجرة الأساس: إزالة بلوك الـ Cron، وإضافة خطوة تحويل الصفوف العالقة المستنفدة إلى `failed` داخل `claim_notification_email_batch`.
- إنشاء ملف هجرة تنشيط الـ Cron منفصلاً، لا يُطبَّق في هذه الدفعة.
- إضافة `support_new_reply` إلى قائمة السماح في `src/lib/notifications/email-channel.shared.ts` مع الإبقاء على `support_reply`.
- لا تغيير في القوالب ولا في المنتجين ولا في أي نظام بريد قائم.