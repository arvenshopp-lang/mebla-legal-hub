# استبدال طبقة النقل الفاشلة بنقل HTTP — خطة قرار قصيرة

## HTTP_TRANSPORT_PLAN

الهدف الوحيد: استبدال `smtpSend` (مقبس SMTP 465) بنقل HTTP واحد داخل نفس الحدود، مع بقاء الطابور والعامل والقوالب والهويات والتفرّد والحجب والسجل دون تغيير.

## HOSTINGER_HTTP_SEND_AVAILABLE

NOT_PROVABLE — الحالة المخزّنة للتكامل (`email_agentic_mail`) تُظهر: `enabled=false`، `tools` المكتشفة 6 أدوات عامة فقط (`email_list_operations`, `email_describe_operation`, `email_api_docs`, `email_call_api_read/write/delete`)، و`operations.sendMessage` مربوطة عبر وكيل REST عام لا عبر أداة إرسال معلنة، و`checks.test_send.ok=false`، و`counters.sent=0`. أي إرسال HTTP فعلي عبر Hostinger لم يُنفَّذ ولا مرة واحدة.

## HOSTINGER_HTTP_SEND_SUITABLE

NO لنقل الإنتاج الآن — لأن دلالات الإرسال الصادرة من الأسماء المستعارة غير مُثبتة، والمسار يعتمد على وكيل REST عام + تفعيل تكامل + قاطع دائرة، وهذا احتمال فشل أعلى من مزوّد بريد معاملات مخصّص. (يبقى قناة إضافية كما هو مصمم.)

## CANDIDATES

**1) Hostinger Agentic Mail HTTP (قائم)**
- EDGE_HTTP_COMPATIBLE: YES (fetch فقط)
- CUSTOM_DOMAIN: YES (نفس الصناديق الحالية)
- MULTIPLE_FROM_IDENTITIES: NOT_PROVEN (الأسماء المستعارة بلا بيانات دخول)
- REPLY_TO: NOT_PROVEN
- DELIVERY_WEBHOOKS: NO
- EXPECTED_CODE_CHANGE: صغير
- NEW_SECRET_REQUIRED: NO
- DNS_CHANGE_REQUIRED: NO
- COST_LEVEL: صفر إضافي
- LOCK_IN_LEVEL: منخفض
- PROS: لا مزوّد جديد، لا DNS، السر موجود.
- CONS: قدرة الإرسال غير مثبتة، لا Webhooks، تصنيف أخطاء غير مستقر.

**2) Resend HTTP API**
- EDGE_HTTP_COMPATIBLE: YES
- CUSTOM_DOMAIN: YES (نطاق فرعي مُتحقَّق)
- MULTIPLE_FROM_IDENTITIES: YES (أي عنوان على النطاق المتحقَّق)
- REPLY_TO: YES
- DELIVERY_WEBHOOKS: YES
- EXPECTED_CODE_CHANGE: ملف نقل واحد + تصنيف أخطاء
- NEW_SECRET_REQUIRED: YES
- DNS_CHANGE_REQUIRED: YES (SPF/DKIM على نطاق فرعي مستقل)
- COST_LEVEL: منخفض
- LOCK_IN_LEVEL: منخفض
- PROS: أبسط عقد إرسال، أخطاء مصنَّفة بوضوح، Idempotency-Key مدعوم.
- CONS: مزوّد جديد + سجلات DNS.

**3) Brevo (Sendinblue) Transactional HTTP API**
- EDGE_HTTP_COMPATIBLE: YES
- CUSTOM_DOMAIN: YES
- MULTIPLE_FROM_IDENTITIES: YES
- REPLY_TO: YES
- DELIVERY_WEBHOOKS: YES
- EXPECTED_CODE_CHANGE: مماثل
- NEW_SECRET_REQUIRED: YES
- DNS_CHANGE_REQUIRED: YES
- COST_LEVEL: منخفض
- LOCK_IN_LEVEL: منخفض
- PROS: طبقة مجانية أوسع.
- CONS: واجهة أثقل وميول تسويقية، تصنيف أخطاء أقل نقاءً.

## RECOMMENDED_PROVIDER

Resend

## RECOMMENDED_TRANSPORT

`sendMehlaEmail` يستدعي طبقة نقل HTTP جديدة `http-mail.server.ts` بدل `smtpSend`، بنفس الدخل والخرج.

## WHY_THIS_ONE

الأقرب لعقد `smtpSend` الحالي (رسالة واحدة → مستلم واحد → نتيجة مصنّفة)، يدعم From لأي هوية على النطاق المتحقَّق مع Reply-To، متوافق مع بيئة الحافة بـ fetch وحده، وقابليته للاستبدال لاحقاً منخفضة الكلفة. Hostinger كان الأولوية الأولى لكن قدرة الإرسال لديه غير مُثبتة، والدليل المخزّن يقول صفر إرسال.

## القرارات الثابتة

- SEND_MEHLA_EMAIL_INTERFACE_CAN_REMAIN: YES (نفس `MehlaSendInput`/`MehlaSendResult`؛ يبقى `smtpCode` كحقل رمز مزوّد رقمي = HTTP status)
- QUEUE_CHANGED: NO
- WORKER_ORCHESTRATION_CHANGED: NO
- TEMPLATES_CHANGED: NO
- IDENTITIES_CHANGED: NO
- SUPPRESSION_CHANGED: NO
- RETRY_MODEL_COMPATIBLE: YES — 401/403 و422 → `SYSTEM_CONFIGURATION_FAILURE`، مستلم غير صالح/مرفوض → PERMANENT، 429 و5xx وانقطاع الشبكة → RETRYABLE؛ نفس `classifyTransportFailure` بمدخلات HTTP
- NEW_SECRET_REQUIRED: YES (مفتاح مزوّد واحد)
- DNS_CHANGE_REQUIRED: YES (نطاق فرعي للإرسال، بلا مساس بسجلات صناديق Hostinger الحالية)
- FAILED_13_RECOVERABLE: YES
- ESTIMATED_IMPLEMENTATION_RISK: LOW
- ESTIMATED_CHANGE_SIZE: SMALL
- RECOMMENDED_NEXT_STEP: ONE_BUILD_TRANSPORT_SWAP
- FILES_CHANGED: NONE
- DB_WRITES: NO
- REAL_EMAIL_SENT: NO
- FINAL_STATUS: PLAN_READY

## CODE_CHANGE_SCOPE (عند التفويض لاحقاً)

1. جديد: `src/lib/email/transport/http-mail.server.ts` — بناء الحمولة من `OutgoingMessage` القائم، طلب واحد بلا Retry داخلي، مهلة، تعقيم الأخطاء، تحويل الاستجابة إلى نفس شكل نتيجة النقل.
2. تعديل محصور: `src/lib/email/transport/mehla-mailer.server.ts` — سطر النداء `smtpSend(...)` → النقل الجديد، وتوسيع اتحاد `MehlaErrorCode` بأصناف HTTP، وتحديث وسم `provider`.
3. `smtp.server.ts` و`socket.server.ts` و`imap.server.ts`: تبقى كما هي بلا حذف — SMTP يظل مستخدماً لمركز البريد البشري/IMAP، وليس كوداً ميتاً.
4. سرّ واحد جديد + سجلات DNS للنطاق الفرعي.
5. حارس: فحص ثابت يمنع رجوع مسار المقبس داخل مسار التنبيهات.

## FAILED_13_RECOVERY_PLAN (بعد إصلاح النقل فقط)

- يمكن إعادتها للطابور بأمان: كل صف يحمل `notification_id` ومعرّف رسالة حتمياً (`<notif-…@mehlalex.com>`)، فلا تتغير هوية الرسالة عند إعادة الإرسال.
- إعادة الطابور تكون بتحديث الحالة إلى `queued` مع `scheduled_at` فوري، دون إنشاء صفوف جديدة (لا صفوف مكرّرة، ولا مساس بمفتاح التفرّد).
- تصفير المحاولات: نعم، لأن الفشل كان عطل بيئة نقل لا رفض مستلم — يُصفَّر `attempts` مع تسجيل سبب التصحيح في سجل التدقيق.
- منع التكرار: المعرّف الحتمي يبقى كما هو، و`finalize_notification_email_delivery` تظل البوابة الذرّية الوحيدة؛ لا إرسال إلا لصف حالته `queued` تم التقاطه مرة واحدة.
- التنفيذ على دفعة تحقق واحدة أولاً (صف واحد) ثم البقية بعد إثبات وصول فعلي.
