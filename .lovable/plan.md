# تنبيهات البريد — معمارية المرحلة 1 (أحداث الإشعارات القائمة → بريد)

## 1) القرار المعماري
**الموصى به: الخيار (B)** — جدول طابور مخصص `notification_email_queue` + عامل دوري يستدعي `sendAppEmail`.

- (A) الإرسال المباشر داخل مسار الحدث يربط نجاح العملية التجارية بزمن استجابة مزوّد البريد، ولا يوفّر إعادة محاولة ولا سجل تسليم ولا تفرّد على مستوى القاعدة.
- (C) إعادة استخدام `email_outbox` مرفوضة: دلالتها مراسلات بشرية من صندوق المكتب عبر SMTP وبها مرفقات وخيوط محادثة و`email-dispatch` كل دقيقة؛ خلط تنبيهات النظام بها يفسد التقارير ويعرّض التنبيهات لمسار نقل مختلف ولمشكلات الحجب البشري.
- محرك واتساب (`notification_events` → `notification_queue`) يبقى كما هو دون لمس؛ لا تجريد قناة مشترك في المرحلة 1.

## 2) مصدر الحقيقة
`public.notifications` يبقى سجل الإشعار داخل التطبيق فقط (بلا أي حقول مزوّد). حالة تسليم البريد تعيش في الجدول الجديد وحده.

## 3) الجدول المقترح (تصميم فقط — بلا Migration الآن)
`public.notification_email_queue`
- `id uuid pk`
- `notification_id uuid not null references public.notifications(id) on delete cascade`
- `organization_id uuid not null references public.organizations(id)`
- `user_id uuid not null` (نفس مستهدف الإشعار)
- `event_type text not null`
- `template_key text not null`
- `recipient_email text not null` (لقطة وقت الإدراج)
- `status text not null default 'queued'` ∈ (`queued`,`processing`,`sent`,`failed`,`cancelled`)
- `attempts int not null default 0`، `max_attempts int not null default 4`
- `scheduled_at timestamptz not null default now()`
- `provider_reference text`، `last_error_code text`، `last_error_message text` (مقتطع 400 حرف، رمز آمن فقط)
- `created_at`, `updated_at`, `processing_started_at`, `sent_at`, `failed_at`
- **قيد التفرّد:** `unique (notification_id)` — قناة البريد واحدة لكل إشعار.
- فهارس: `(status, scheduled_at)`، `(organization_id, created_at desc)`، `(event_type, status)`.
- الأمان: `ENABLE ROW LEVEL SECURITY`؛ `GRANT ALL ... TO service_role` فقط (بلا `anon` وبلا `authenticated`) — الجدول تشغيلي خادمي، ولا يُقرأ من المتصفح. القراءة الإدارية تمر عبر دالة خادمية بصلاحية موظف.
- لا يُخزَّن نص قانوني: العنوان والملخص يُبنى وقت الإرسال من `notifications` + القالب.

## 4) نموذج التفرّد
مفتاح حتمي على مستويين:
1. قيد `unique(notification_id)` يمنع أكثر من صف بريد لأي إشعار.
2. `idempotencyKey = notif-email:{notification_id}` يُمرَّر إلى `sendAppEmail`، فتمنع خدمة البريد التكرار حتى لو أُعيد سحب الصف بعد انقطاع الشبكة أو إعادة تشغيل الخادم.
سحب الدفعة يتم بـ RPC على نمط `claim_notification_batch` القائم (`FOR UPDATE SKIP LOCKED` + نقل إلى `processing`) فلا يعالج عاملان الصف نفسه.

## 5) فرض التفضيلات (المفتاح الرئيسي حقيقي)
عند إدراج أي إشعار مؤهّل للبريد يقرأ الخادم `user_notification_preferences` للمستخدم + المكتب:
- لا يوجد صف تفضيلات → الافتراضي `email_enabled = true` (كما DEFAULT في القاعدة).
- `email_enabled = false` → **لا إدراج إطلاقاً** (لا صف مُلغى ولا ضجيج).
- `email_enabled = true` + نوع الحدث داخل قائمة السماح → إدراج.
- مفاتيح الأحداث التفصيلية (الجلسات/المهل/المهام) لا تُقرأ في المرحلة 1 لعدم وجود أحداثها.

## 6) مصفوفة أحداث المرحلة 1
| EVENT_TYPE | IN_APP | EMAIL_V1 | PREFERENCE_KEY | TEMPLATE | السبب |
|---|---|---|---|---|---|
| `team_member_joined` | نعم | **نعم** | `email_enabled` | `notif-team-member-joined` | حدث إداري يهم المدير ولا يحمل بيانات قضايا |
| `support_reply` | نعم | **نعم** | `email_enabled` | `notif-support-reply` | المكتب ينتظر رداً؛ بريد بلا نص الرد + رابط التذكرة |
| `support_ticket_created` | نعم | **نعم** | `email_enabled` | `notif-support-ticket-created` | تأكيد استلام لطلب أنشأه المستخدم نفسه |
| `platform_broadcast` | نعم | **لا** | — | — | إعلان جماعي = تسويق/بث؛ خارج نطاق بريد المعاملات |
| إشعار طلب استشارة (office lead) | نعم | **لا** في هذه الطبقة | — | — | له بريد مباشر عامل بالفعل (`sendOfficeLeadEmail`)؛ إضافته هنا تعني بريدين |
| تذكيرات الجلسات/المهل/المهام | لا يوجد حدث اليوم | لا | مؤجّل | — | المرحلة 2 |

## 7) القوالب المطلوبة
ثلاثة قوالب React Email عربية RTL بهوية مِهلة (أخضر #123C32، خلفية الجسم #ffffff، خط النظام):
`notif-team-member-joined` · `notif-support-reply` · `notif-support-ticket-created`
كل قالب: عنوان واضح + سطر ملخص آمن + زر «فتح في مِهلة» يشير إلى المسار الداخلي. **بلا** أسماء عملاء أو أرقام قضايا أو نص رسائل أو مرفقات. القالب المفقود لنوع مسموح = عدم إدراج (وليس فشل إرسال).

## 8) استنتاج المستلم وعزل المكاتب
المستلم يُستنتج خادمياً من `notification.user_id` + `notification.organization_id` حصراً:
1. عضوية نشطة في نفس المكتب (`organization_members.status = 'active'`) — أو موظف منصة للتذاكر الداخلية.
2. `profiles.email` موجود وغير فارغ.
3. التفضيل مفعّل.
أي فحص فاشل = عدم إدراج. لا يُقبل بريد أو معرّف مستلم من المتصفح إطلاقاً، فيستحيل أن يخرج إشعار مكتب A إلى عضو مكتب B.

## 9) العامل الدوري
- مسار جديد `POST /api/public/hooks/notification-emails` محمي بـ `guardCronRequest` (نفس نمط المهام القائمة)، ومهمة `pg_cron` واحدة كل 5 دقائق.
- دفعة 25 صفاً، سحب بقفل `SKIP LOCKED`، إعادة محاولة تراجعية 2د/10د/60د، `max_attempts = 4`، ثم `failed` نهائي (Dead-letter منطقي عبر الحالة + رمز الخطأ).
- الأخطاء على مستوى المستلم (`recipient_suppressed`, `invalid_recipient`) نهائية بلا إعادة محاولة. `429` يؤجّل الصف دون استهلاك محاولة.
- لا خلط مع عامل واتساب ولا مع `email-dispatch`.

## 10) المزوّد والمرسل
`sendAppEmail` كما هو (الخدمة المُدارة، `mail.mehlalex.com`، المرسل `MEHLA <noreply@mehlalex.com>`). لا علاقة لصندوق Hostinger البشري.

## 11) عزل الفشل
الحدث التجاري ثم الإشعار داخل التطبيق ينجحان أولاً؛ الإدراج في طابور البريد يجري بعدهما ولا يرمي أبداً (فشله يُسجَّل في سجل الأعطال القائم). فشل الإرسال لا يلمس `notifications` ولا يعيد أي عملية.

## 12) الرصد
عدّادات فقط: `queued/processing/sent/failed` لكل `event_type` و`template_key`، متوسط زمن التسليم، أقدم صف معلّق، ورموز الأخطاء. تُعرض في لوحة الإدارة كأرقام مجمّعة. لا تسجيل لنص الرسالة ولا لأسماء العملاء ولا لعناوين كاملة (تقنيع `z***@domain.com`).

## 13) سلوك الواجهة
مفتاح «عبر البريد الإلكتروني» يصبح فعّالاً وتُضاف تحته ملاحظة صريحة بأنواع الأحداث المشمولة حالياً. مفاتيح تذكيرات الجلسات/المهل تبقى موجودة مع وسم «قيد التفعيل — المرحلة 2» دون حذفها.

## 14) نقطة اندماج المرحلة 2
دالة واحدة `createUserNotification()` تكتب في `notifications` ثم تستدعي `enqueueNotificationEmail()`. محرك التذكيرات في المرحلة 2 يستدعي نفس الدالة فيحصل على البريد تلقائياً بمجرد إضافة النوع لقائمة السماح وقالبه ومفتاح تفضيله.

## 15) ملفات متوقعة (بعد الاعتماد)
`src/lib/notifications/email-channel.shared.ts` (قائمة السماح + خريطة القوالب) · `email-channel.server.ts` (الإدراج) · `email-worker.server.ts` (السحب والإرسال) · 3 قوالب في `src/lib/email-templates/` · `src/routes/api/public/hooks/notification-emails.ts` · تعديل مواضع إنشاء الإشعارات (`invitations.server.ts`, `support/notify.server.ts`) لتمر بالدالة الموحّدة · ملاحظة الواجهة في `settings.tsx` · `scripts/notification-email.test.ts` · هجرة واحدة (جدول + RPC السحب).

## 16) خطة اختبار مستهدفة
التفضيل مغلق = صفر إدراج · إدراج مزدوج لنفس الإشعار = صف واحد (23505) · نوع غير مسموح = لا إدراج · مستخدم بلا بريد = لا إدراج · عضو مكتب آخر = مرفوض · إعادة سحب بعد `processing` = لا بريد ثانٍ · تراجع المحاولات ثم `failed` عند استنفادها · `recipient_suppressed` = فشل نهائي فوري · تحقق أن القوالب لا تحتوي بيانات قضايا/عملاء.

---
### الخلاصة
RECOMMENDED_ARCHITECTURE: **B — طابور بريد تنبيهات مخصص + عامل دوري + `sendAppEmail`**
QUEUE_REQUIRED: **YES** · REUSE_EMAIL_OUTBOX: **NO** · NEW_TABLE_REQUIRED: **YES** (`notification_email_queue`)
IDEMPOTENCY_MODEL: `unique(notification_id)` + `idempotencyKey = notif-email:{id}`
PREFERENCE_ENFORCEMENT: `email_enabled` مفتاح رئيسي خادمي (الافتراضي مفعّل عند غياب الصف)
RECIPIENT_RESOLUTION: `notification.user_id` + عضوية نشطة + `profiles.email` — خادمي بالكامل
TENANT_ISOLATION: **PASS** · SEND_APP_EMAIL_REUSED: **YES** · MIGRATION_REQUIRED: **YES** (لم تُنشأ)
EVENT_EMAIL_V1: 3 أنواع (انضمام عضو، رد دعم، إنشاء تذكرة) — البث والطلبات مستثناة
FINAL_VERDICT: **READY_FOR_BUILD**
