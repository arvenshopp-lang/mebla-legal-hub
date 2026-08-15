# MEHLA — HOSTINGER CANONICAL EMAIL TRANSPORT
## تدقيق معماري نهائي (قراءة فقط) + خطة البناء

لم يُعدَّل أي كود، ولم تُطبَّق أي هجرة، ولم يُرسل أي بريد.

---

## 1. النقل الحالي عبر Hostinger (مُثبت من المصدر)

المسار الفعلي: `email_outbox` → `dispatchDue`/`dispatchOne` (`src/lib/email/workspace.server.ts`) → `sendViaHostinger` (`transport/hostinger.server.ts`) → `smtpSend` (`transport/smtp.server.ts`) → `connectMailSocket` (`transport/socket.server.ts`).

- مكتبة SMTP: لا توجد مكتبة خارجية — عميل SMTP بروتوكولي مكتوب داخلياً (`EHLO` → `AUTH LOGIN` → `MAIL FROM` → `RCPT TO` → `DATA`)، وبناء MIME داخلي في `mime.server.ts` (نص + HTML + مرفقات فعلية).
- بيئة التشغيل: عامل حوسبة طرفية عبر `cloudflare:sockets`، وفي التطوير `node:tls`. التحقق من الشهادة إلزامي بلا أي خيار لتعطيله.
- الخادم/المنفذ/التشفير: `SMTP_HOST` افتراضياً `smtp.hostinger.com`، `SMTP_PORT` افتراضياً `465`، `SMTP_SECURE` افتراضياً `true` (TLS ضمني). لا يوجد مسار STARTTLS.
- المصادقة: `MAIL_USER` + `MAIL_PASSWORD` (أو مفاتيح لكل صندوق `MAIL_USER_<ALIAS>` إن وُجدت) — تُقرأ داخل الدوال فقط، ولا تُعاد ولا تُسجَّل.
- From: فصل صحيح بين المظروف والترويسة — `MAIL FROM` = الحساب المُصادق عليه (`envelopeFrom`)، وترويسة `From` = عنوان القسم/الاسم المستعار.
- Reply-To: عنوان القسم نفسه، وصندوق النظام (`noreply@`) يُحوّل الرد إلى `MAIL_SYSTEM_REPLY_TO` أو `support@` مع ترويسة `Auto-Submitted`.
- المهلة: 20 ثانية لكل عملية قراءة/اتصال (`mail_socket_timeout`).
- استجابة المزوّد: رمز SMTP الحقيقي (250 للقبول) + `Message-ID` الذي نولّده نحن؛ لا يوجد معرّف مزوّد مستقل.
- تصنيف الأخطاء القائم: `smtp_not_configured`, `smtp_connect_failed`, `smtp_auth_failed`, `smtp_rejected_sender`, `smtp_rejected_recipient`, `smtp_rejected_data`, `smtp_protocol_error`, `smtp_timeout` — وكل نص خطأ يمر عبر `redactTransportError`.

إثبات تشغيلي من الإنتاج: 6 رسائل صادرة بحالة `sent` و`provider = smtp_hostinger`.

## 2. `sendAppEmail` الحالي

`src/lib/email/app-email.server.ts` يستدعي `sendLovableEmail` من `@lovable.dev/email-js` مع `LOVABLE_API_KEY` و`sender_domain: mail.mehlalex.com` و`from: MEHLA <noreply@mehlalex.com>` و`purpose: transactional` و`idempotency_key`. لا أثر لـ SMTP فيه إطلاقاً.

تبعيات Lovable: حزمة `@lovable.dev/email-js` (+ `EmailAPIError`)، السر `LOVABLE_API_KEY`، المتغير `LOVABLE_SEND_URL`، نطاق الإرسال `mail.mehlalex.com` المُدار، وأكواد الرفض `recipient_suppressed`/`invalid_recipient` القادمة من طبقة الإيقاف عند Lovable. إضافةً إلى مسار الرجوع (fallback) في `workspace.server.ts` الذي يعود إلى الخدمة المُدارة عند عطل إعداد SMTP.

## 3. توافق البيئة

عامل الإشعارات يعمل داخل نفس مسار الخادم (`src/routes/api/public/hooks/notification-emails.ts`) وبنفس بيئة `email-dispatch` تماماً، وطبقة المقبس نفسها مثبتة عملياً في الإنتاج. النقل قابل لإعادة الاستخدام كما هو، مع تحفظ واحد: `sendViaHostinger` مرتبط بجداول المرفقات ويطلب `db`، لذا الإشعارات ستستخدم `smtpSend` مباشرة عبر مُحوِّل موحّد بلا مرفقات.

## 4. طبقة النقل الموحّدة المقترحة

ملف جديد `src/lib/email/transport/mehla-mailer.server.ts`:

```text
sendMehlaEmail({ to, fromIdentity, replyTo, subject, html, text, messageId, metadata })
  → senderIdentity(fromIdentity)   // مظروف مُصادق + ترويسة القسم
  → buildMimeMessage               // نص + HTML
  → smtpSend                       // Hostinger فقط
  → { ok, smtpCode, messageId } | { ok:false, code, class }
```

- مزوّد واحد: Hostinger SMTP. لا استيراد لـ `@lovable.dev/email-js` في هذا المسار.
- `app-email.server.ts` يبقى بنفس التوقيع الخارجي (`sendAppEmail`) لكنه يرندر React Email ثم يفوّض إلى `sendMehlaEmail`، فلا يتغير أي نداء أعلى.

## 5. الطوابير تبقى منفصلة

`email_outbox` (مراسلات بشرية) و`notification_email_queue` (إشعارات نظام) يبقيان طابورين مستقلين بأعمال مختلفة، ويتشاركان مُحوِّل النقل فقط. لا دمج، ولا تعديل على نموذج إعادة المحاولة أو الإنهاء الذري أو القوالب أو التفضيلات أو عزل المكاتب.

## 6. جرد نداءات بريد التطبيق الفعلية

| FLOW | الملف | CURRENT_PROVIDER | TARGET | FROM | REPLY-TO | التعقيد |
|---|---|---|---|---|---|---|
| دعوات الفريق | `src/lib/invitations.server.ts` | Lovable Managed | Hostinger | `noreply@` | `support@` | منخفض |
| الفوترة | `src/lib/billing/billing.server.ts:1542` | Lovable Managed | Hostinger | `billing@` | `billing@` | منخفض |
| العروض/العقود | `src/lib/sales-docs.server.ts:496` | Lovable Managed | Hostinger | `sales@` | `sales@` | منخفض |
| عملاء المكاتب | `src/lib/office-lead-email.server.ts` | Lovable Managed | Hostinger | `info@` | `info@` | منخفض |
| إشعارات النظام (المرحلة 1) | `src/lib/notifications/email-worker.server.ts:268` | Lovable Managed | Hostinger | `noreply@` | `support@` | منخفض |
| المراسلات البشرية | `workspace.server.ts` | Hostinger + رجوع مُدار | Hostinger فقط | صندوق القسم | نفس القسم | متوسط (إزالة الرجوع) |
| رسائل المصادقة | Supabase Auth | خارج نطاق هذه الجولة | — | — | — | — |

الهدف: `LOVABLE_MANAGED_EMAIL_CALLS = 0` بعد الدفعة C.

## 7. هويات المُرسل عبر Hostinger

الأسرار الموجودة فعلاً: `MAIL_USER` و`MAIL_PASSWORD` فقط — أي حساب حقيقي واحد بلا بيانات دخول لأي اسم مستعار (لا `MAIL_USER_SUPPORT` ولا غيره). الصناديق المسجلة: `info@`, `support@`, `legal@`, `sales@`, `billing@` (نوع human) و`noreply@` (نوع system).

- كلها قابلة للإرسال كترويسة `From` لأن المظروف يبقى الحساب المُصادق عليه، وهذا ما يحفظ SPF.
- `noreply@mehlalex.com` مسجّل في المنصة كصندوق نظام ومدعوم في طبقة الهوية، لكن كونه مُنشأً فعلاً كصندوق/اسم مستعار في لوحة Hostinger لم يُتحقق منه من داخل الكود، ولا يوجد سجل إرسال حقيقي منه عبر SMTP.

`NOREPLY_HOSTINGER_READY: NEEDS_CONFIGURATION` — يلزم تأكيد وجود `noreply@mehlalex.com` في حساب Hostinger (صندوق أو Alias مُسلَّم للحساب الرئيسي) قبل الدفعة B، ويلزم ضبط `MAIL_SYSTEM_REPLY_TO` صراحةً.

## 8. سياسة المُرسل المستهدفة

إشعارات آلية → `noreply@` ‏· دعم بشري → `support@` ‏· فوترة → `billing@` ‏· مبيعات/عروض/عقود → `sales@` ‏· قانوني → `legal@` ‏· عام وعملاء المكاتب → `info@`. المصادقة دائماً بالحساب الرئيسي الواحد.

## 9. سياسة Reply-To

- إشعارات آلية من `noreply@`: `Reply-To = support@` + `Auto-Submitted: auto-generated` — فلا يذهب رد المستخدم إلى صندوق غير مُتابع.
- بريد الدعم الآلي: `Reply-To = support@` (مدعوم فعلاً ومُستقبل نشط).
- بقية الأقسام: `Reply-To` = عنوان القسم نفسه.

## 10. تفرّد SMTP

`HOSTINGER_SMTP_NATIVE_IDEMPOTENCY: NO` — SMTP بروتوكول تسليم بلا مفتاح تفرّد؛ إعادة نفس الرسالة تُقبل مرة ثانية.

الضمانات تعتمد كلياً على طبقتنا: `UNIQUE(notification_id)` في الطابور وسجل التسليم، السحب الذرّي (`claim` → `processing`)، الإنهاء الذرّي، و`Message-ID` حتمي.

الخطر المتبقي: لو قَبِل الخادم `DATA` (250) ثم انقطع الاتصال قبل قراءتنا للرد، أو نجح القبول وفشل الإنهاء الذرّي، فقد تُسلَّم الرسالة مرتين عند إعادة المحاولة. `RESIDUAL_DUPLICATE_RISK: LOW` (نسخة مكررة نادرة، بلا حالة تجارية مزدوجة). لا ندّعي exactly-once — الضمان هو at-least-once مع تكرار نادر مُقلَّل.

## 11. Message-ID الحتمي

`DETERMINISTIC_MESSAGE_ID_RECOMMENDED: YES` — `<notif-{notification_id}@mehlalex.com>` لإشعارات النظام: يجعل إعادة المحاولة تحمل نفس المعرّف، ويسهّل التتبع، وقد يجعل بعض الخوادم المستلمة تتجاهل النسخة المكررة — دون أي وعد بإلغاء التكرار.

## 12. تصنيف أخطاء Hostinger

- RETRYABLE: `smtp_timeout`, `smtp_connect_failed`, `smtp_protocol_error`, وأي رمز 4xx (421/450/451/452)، ورفض المحتوى بـ 4xx.
- PERMANENT: 5xx عامة (550/552/554)، `smtp_rejected_recipient` بـ 5xx (مستلم غير صالح)، `smtp_rejected_data` بـ 5xx.
- SYSTEM_CONFIGURATION_FAILURE: `smtp_not_configured`, `smtp_auth_failed`, `smtp_rejected_sender`, فشل TLS/الشهادة. لا تُستهلك محاولات المستخدم عليها، وتُسجَّل كعطل نظام يحتاج تدخلاً إدارياً.

ملاحظة تنفيذية: عميل SMTP الحالي يعيد رمزاً مُصنَّفاً بلا فصل 4xx/5xx في حالتي المستلم والمحتوى، لذا الدفعة A ستُرجِع `smtpCode` في هذين المسارين لتُبنى القرارية عليه.

## 13. الأسرار

`MAIL_USER`, `MAIL_PASSWORD` موجودة، و`SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` لها افتراضيات قابلة للتجاوز — وكلها بأسماء محايدة وقابلة للنقل خارج Lovable. تبقى أسرار خادم فقط: لا في المستودع، ولا الواجهة، ولا جداول القاعدة، ولا السجلات (`redactTransportError`)، ولا القوالب. لن تُطبع أي قيمة.

## 14. أثر هجرة الأساس

`FOUNDATION_MIGRATION_CAN_REMAIN: YES` — مخطط `notification_email_queue` و`notification_email_deliveries` محايد تجاه المزوّد: `provider_reference` نص حر يقبل `Message-ID`، والحالات والمحاولات والإنهاء الذرّي لا تفترض أي مزوّد. `NOTIFICATION_QUEUE_SCHEMA_CHANGE_REQUIRED: NO`.

## 15. الطرح المطلوب

A. بناء `mehla-mailer.server.ts` + إرجاع `smtpCode` من مسارَي المستلم/المحتوى.
B. تحويل `sendAppEmail` إلى Hostinger، فيتحول عامل الإشعارات تلقائياً، مع خريطة أخطاء SMTP في `email-channel.shared.ts`، وتأكيد `noreply@` و`MAIL_SYSTEM_REPLY_TO` قبلها.
C. ترحيل نداءات الأقسام (دعوات، فوترة، عروض، عملاء) إلى هويات القسم، ثم إزالة مسار الرجوع المُدار في `workspace.server.ts` والتحقق من صفر تبعية Lovable.
D. اختبارات مستهدفة موسّعة في `scripts/notification-emails.test.ts`.
E. مراجعة تطبيق نهائية للأساس.
F. تطبيق الأساس.
G. الكرون يبقى مُعطلاً.
H. إشعار واحد مُتحكَّم عبر Hostinger.
I. التحقق: استلام + صف الطابور + سجل التسليم + لا تكرار.
J. تنشيط الكرون.
K. إغلاق المرحلة 1. L. المرحلة 2 (التذكيرات).

---

## الخلاصة النهائية

- CURRENT_HUMAN_MAIL_PROVIDER: Hostinger SMTP (مع رجوع مُدار قائم يجب إزالته)
- CURRENT_APP_EMAIL_PROVIDER / SEND_APP_EMAIL_PROVIDER: LOVABLE_MANAGED
- HOSTINGER_SMTP_IMPLEMENTATION: عميل SMTP داخلي + MIME داخلي فوق `cloudflare:sockets` / `node:tls`، منفذ 465 TLS ضمني
- HOSTINGER_TRANSPORT_REUSABLE: YES
- NOTIFICATION_WORKER_CAN_USE_HOSTINGER_SMTP: YES · RUNTIME_COMPATIBILITY: PASS
- RECOMMENDED_TRANSPORT_ABSTRACTION: `sendMehlaEmail` في `mehla-mailer.server.ts`
- CURRENT_SEND_APP_EMAIL_CALL_SITES: 5 (دعوات، فوترة، عروض/عقود، عملاء المكاتب، عامل الإشعارات)
- HOSTINGER_VALID_SENDERS: info, support, legal, sales, billing (+ noreply بانتظار التأكيد)
- NOREPLY_HOSTINGER_READY: NEEDS_CONFIGURATION
- HOSTINGER_SMTP_NATIVE_IDEMPOTENCY: NO · DETERMINISTIC_MESSAGE_ID_RECOMMENDED: YES · RESIDUAL_DUPLICATE_RISK: LOW
- FOUNDATION_MIGRATION_CAN_REMAIN: YES · NOTIFICATION_QUEUE_SCHEMA_CHANGE_REQUIRED: NO
- LOVABLE_MANAGED_EMAIL_DEPENDENCIES: `@lovable.dev/email-js`، `LOVABLE_API_KEY`، `LOVABLE_SEND_URL`، نطاق `mail.mehlalex.com`، مسار الرجوع في `workspace.server.ts`
- LOVABLE_EXIT_EMAIL_READINESS: NEEDS_CHANGES (تنفيذ الدفعات A–C + تأكيد `noreply@`)
- EXACT_FILES_TO_CHANGE: `src/lib/email/transport/mehla-mailer.server.ts` (جديد)، `src/lib/email/transport/smtp.server.ts`، `src/lib/email/app-email.server.ts`، `src/lib/notifications/email-channel.shared.ts`، `src/lib/notifications/email-worker.server.ts`، `src/lib/email/workspace.server.ts`، `src/lib/invitations.server.ts`، `src/lib/billing/billing.server.ts`، `src/lib/sales-docs.server.ts`، `src/lib/office-lead-email.server.ts`، `scripts/notification-emails.test.ts`
- FINAL_VERDICT: READY_FOR_HOSTINGER_TRANSPORT_BUILD (بشرط تأكيد هوية `noreply@` في Hostinger قبل الدفعة B)
