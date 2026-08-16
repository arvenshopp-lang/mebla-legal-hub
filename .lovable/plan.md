# BATCH A — أساس نقل البريد الكنسي عبر Hostinger

هدف الدفعة: بناء طبقة إرسال واحدة مملوكة لمِهلة تعتمد Hostinger SMTP فقط، دون تحويل `sendAppEmail` ودون ترحيل أي مسار عمل ودون أي هجرة أو بريد إنتاجي.

## نموذج الحساب المعتمد

- الصندوق الأساسي المُصادق عليه: `noreply@mehlalex.com`.
- أسماء مستعارة بلا بيانات دخول: `info@`, `support@`, `legal@`, `sales@`, `billing@`.
- المصادقة دائماً بالحساب الأساسي، وترويسة `From` تحمل هوية القسم — وهذا هو الفصل القائم فعلاً في `senderIdentity` (المظروف = الحساب المُصادق، الترويسة = العنوان الظاهر).

ملاحظة تحقّق: قيم الأسرار غير مقروءة من الأدوات (مشفّرة)، فحالة المطابقة تُحسم برمجياً في وقت التشغيل عبر دالة حالة تُعيد `match / mismatch / unverified` دون طبع أي قيمة، ولا يُطبع اسم مستخدم ولا كلمة مرور.

## 1) ملف جديد: `src/lib/email/transport/mehla-mailer.server.ts`

عقد مُنمّط واحد:

```text
sendMehlaEmail({
  to, identity, replyTo?, subject, html, text, messageId?, fromName?, metadata?
}) → MehlaSendResult
```

- المزوّد: Hostinger SMTP فقط. لا استيراد لـ `@lovable.dev/email-js`، ولا استخدام لـ `LOVABLE_API_KEY` أو `LOVABLE_SEND_URL`.
- إعادة استخدام المكدّس القائم كما هو: `smtpSend` + `buildMimeMessage` + `senderIdentity` + طبقة المقبس/TLS. لا عميل SMTP ثانٍ، ولا باني MIME ثانٍ، ولا طبقة Hostinger موازية.
- بلا مرفقات في هذه النسخة (HTML + نص فقط)؛ مرفقات البريد البشري في `email_outbox` تبقى كما هي بلا لمس.

تُصدَّر أيضاً (نقية وقابلة للاختبار):

- `MEHLA_IDENTITIES`: `system → noreply@`, `info → info@`, `support → support@`, `legal → legal@`, `sales → sales@`, `billing → billing@`.
- `identityAddress(identity)` و`identityReplyTo(identity)`.
- `canonicalAccountStatus()`: يقارن الحساب المُصادق عليه بالصندوق الكنسي `noreply@mehlalex.com` ويعيد الحالة فقط.
- `classifyTransportFailure(code, smtpCode, message)`.
- `notificationMessageId(notificationId)` → `<notif-{notification_id}@mehlalex.com>`.

النتيجة المُطبَّعة (محايدة تجاه المزوّد): `ok`, `smtpCode`, `messageId`, `errorCode`, `errorClass`, `latencyMs`, `headerFrom`, `envelopeFrom`, `replyTo`. لا رد مصادقة خام، ولا ترويسات أسرار، وكل نص خطأ يمر عبر `redactTransportError` القائم.

## 2) سياسة Reply-To و`MAIL_SYSTEM_REPLY_TO`

- `system` → `Reply-To = MAIL_SYSTEM_REPLY_TO`. إن لم يكن مُهيّأً، لا يُختلق صندوق: يُعاد `errorCode = mail_system_reply_to_not_configured` بصنف `SYSTEM_CONFIGURATION_FAILURE` مع تسجيل عطل نظام، ولا تُستهلك محاولة إرسال.
- الأقسام: `Reply-To` = العنوان نفسه (`support@`, `billing@`, `sales@`, `legal@`, `info@`).
- `Auto-Submitted: auto-generated` لهوية `system` فقط (السلوك القائم في باني MIME)، ولا يُطبَّق على المراسلات البشرية.
- سيُضبط `MAIL_SYSTEM_REPLY_TO = support@mehlalex.com` كإعداد خادمي صريح (ليس رجوعاً خفياً في الكود).

## 3) تفصيل أخطاء SMTP في `smtp.server.ts` (تعديل محدود)

المسارَان الوحيدان المعدَّلان: رفض `RCPT TO` ورفض بدء `DATA` — يُعاد فيهما `smtpCode` الفعلي مع `envelopeFrom`/`headerFrom`، تماماً كما يفعل مسار رفض المُرسل حالياً. لا تغيير في سلوك التعقيم ولا في أي رمز خطأ قائم ولا في مسار النجاح.

## 4) تصنيف الأخطاء المركزي

- RETRYABLE: `smtp_timeout`, `smtp_connect_failed` (شبكي)، أي رمز 4xx، رفض مستلم/محتوى/بروتوكول بـ 4xx أو برمز غير معروف.
- PERMANENT: رفض مستلم أو محتوى برمز 5xx قاطع.
- SYSTEM_CONFIGURATION_FAILURE: `smtp_not_configured`, `smtp_auth_failed`, `smtp_rejected_sender`, فشل TLS/الشهادة، و`mail_system_reply_to_not_configured` — لا تُستهلك محاولات المستلم عليها.

## 5) التفرّد و Message-ID

لا تفرّد أصلي في SMTP ولن يُدَّعى. الضمانات المستقبلية تبقى على طبقتنا: `UNIQUE(notification_id)`، السحب الذرّي، الإنهاء الذرّي، سجل التسليم غير القابل للتعديل، و`Message-ID` حتمي. المعرّف الذي يمرّره المُنادي يُستخدم حرفياً بلا تعديل، للتتبع وثبات إعادة المحاولة فقط — بلا وعد بإلغاء تكرار عند المستلم. لا ادّعاء exactly-once.

## 6) ما لا يتغير في هذه الدفعة

`app-email.server.ts` كما هو (لا تحويل)، ولا ترحيل للدعوات أو الفوترة أو العروض أو عملاء المكاتب أو عامل الإشعارات أو مسار الرجوع في `workspace.server.ts`. مسار البريد البشري (`email_outbox` → Hostinger، الأسماء المستعارة، Reply-To، المرفقات، الـ threading) يبقى بلا أي تغيير سلوكي. الهجرتان المعلّقتان لا تُعدَّلان ولا تُطبَّقان، والكرون يبقى مُعطلاً، ولا يُرسل أي بريد إنتاجي.

## 7) اختبارات مستهدفة (بلا شبكة)

ملف جديد `scripts/mehla-mailer.test.ts` + سكربت `mail:transport:test`، يغطي المحاور الـ23 المطلوبة: خلو المُرسل الكنسي من مكتبة Lovable، اختيار مسار Hostinger، تحقق الهويات الستّ، المظروف بالحساب الكنسي، الأسماء المستعارة بلا بيانات دخول، Reply-To لكل هوية، `MAIL_SYSTEM_REPLY_TO`، `Auto-Submitted`، تصنيف 4xx/5xx للمستلم والمحتوى، أخطاء المصادقة/المُرسل/TLS كعطل إعداد، حفظ `smtpCode`، حفظ `Message-ID` حرفياً، عدم ادّعاء تفرّد المزوّد، خلو النتائج والأخطاء من أي سرّ (بفحص التعقيم)، وانحدار البريد البشري.

## 8) التحقق

`mail:transport:test` + `notif-email:test` + فحص الأنواع + ESLint على الملفات المتأثرة + حرّاس الأمان. بلا Browser E2E، بلا بريد إنتاجي، بلا هجرة، بلا تنشيط كرون، وبلا أي تعديل على قاعدة الإنتاج.

## الملفات

- جديد: `src/lib/email/transport/mehla-mailer.server.ts`
- جديد: `scripts/mehla-mailer.test.ts`
- تعديل محدود: `src/lib/email/transport/smtp.server.ts` (إرجاع `smtpCode` في مسارَي RCPT/DATA)
- تعديل: `package.json` (سكربت الاختبار)
- إعداد خادمي: `MAIL_SYSTEM_REPLY_TO`
