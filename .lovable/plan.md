# إغلاق مشكلة البريد — Transport + Send-As-Alias (خطة نهائية)

نتائج الفحص الفعلي للمشروع والقاعدة (لا تخمين).

## A. حساب النقل الرئيسي (Primary Transport Mailbox)

- العنوان الحقيقي محفوظ في سرّ الخادم `MAIL_USER` (وكلمة المرور في `MAIL_PASSWORD`) — موجودان فعلاً في أسرار المشروع، فلا حاجة لطلب بيانات جديدة.
- الكود يعرّف الحساب الحقيقي عبر `primaryMailboxAddress()` في `src/lib/email/transport/config.server.ts` (= `MAIL_USER` وإلا `MAIL_FROM`).
- قيمة العنوان لا يمكن قراءتها من الكود أو القاعدة (سرّ بيئة)، لذلك أول خطوة تنفيذية هي إظهار **العنوان فقط** (بدون كلمة المرور) في مركز البريد للتحقق أنه فعلاً حساب «roplay» المقصود.
- ملاحظة مهمة: لا يوجد صف لهذا الحساب في `email_mailboxes`؛ الصف الوحيد من نوع `system` هو `noreply@mehlalex.com`.

## B. الأسماء المستعارة الموجودة فعلاً (من `email_mailboxes`)

| العنوان | النوع | استقبال | مزامنة |
|---|---|---|---|
| support@mehlalex.com | human | مفعّل | معطّلة |
| sales@mehlalex.com | human | مفعّل | معطّلة |
| billing@mehlalex.com | human | مفعّل | معطّلة |
| legal@mehlalex.com | human | مفعّل | معطّلة |
| info@mehlalex.com | human | مفعّل | معطّلة |
| noreply@mehlalex.com | system | معطّل | مفعّلة |

لا توجد أسماء مستعارة أخرى — الاختبار يقتصر على هذه القائمة + الحساب الحقيقي.

## C. كيف يتعامل النظام معها الآن

- `transportConfig(address)` يبحث عن `MAIL_USER_<ALIAS>`/`MAIL_PASSWORD_<ALIAS>` ثم **يعود تلقائياً** إلى `MAIL_USER`/`MAIL_PASSWORD`. أي أن مصادقة SMTP بالحساب الحقيقي مطبّقة أصلاً.
- الاستقبال: `mailboxHasOwnCredentials()` يمنع تسجيل الدخول للأسماء المستعارة، والسحب من الحساب الحقيقي فقط، والتوجيه المنطقي عبر `routing.server.ts` بترتيب `Delivered-To → X-Original-To → To → Cc`. هذا سلوك صحيح ويُعاد استخدامه كما هو.
- الإرسال: `dispatchOne` يستخدم SMTP إذا `transportConfigured(from_address)`، وإلا خدمة البريد المُدارة، مع Fallback عند أعطال إعداد SMTP.
- الفروق القائمة اليوم: Transport Mailbox = `MAIL_USER`؛ Logical Mailbox = صف `email_mailboxes`؛ Sender Alias = `email_messages.from_address`؛ Reply-To غير محسوب لكل قسم؛ Envelope From = عنوان الـAlias (`config.from`) وليس الحساب الحقيقي.

## D. السبب الجذري لفشل الإرسال الحالي

سببان مثبتان بالبيانات، وليس سبباً واحداً:

1. **الرسائل الفاشلة كلها ذهبت عبر خدمة البريد المُدارة لا عبر SMTP**: 11 صفاً في `email_outbox` بحالة `failed` ورمز `recipient_suppressed` (آخرها اليوم 13:43)، و22 عطلاً بنفس الرمز في `system_failures`. هذا الرمز لا يصدر من SMTP إطلاقاً — أي أن مسار Hostinger لم يُسلّم الرسالة، ولا يوجد أي عطل مسجّل باسم `email_smtp_transport_unavailable` لأن ذلك التسجيل يحدث فقط عند نجاح الـFallback.
2. **العنوان `ziad.emb@gmail.com` موقوف (suppressed) لدى الخدمة المُدارة**، لذلك كل اختبار عليه يفشل نهائياً بغضّ النظر عن الـAlias. جميع الرسائل التي «نجحت» كانت إلى `ziad.emd@gmail.com` (حرف مختلف).

النتيجة: المشكلة ليست في الأسماء المستعارة نفسها، بل في أن مسار SMTP للحساب الحقيقي غير مُثبت التشغيل، وأن الفشل يظهر تحت رمز الخدمة المُدارة فيُخفي حقيقة النقل.

## E. هل يستخدم النظام Credentials مستقلة للأسماء المستعارة؟

لا — الرجوع إلى الحساب الحقيقي مبني أصلاً. لن تُنشأ كلمة مرور لأي Alias. الخطر الحقيقي المتبقي هو **Envelope From = Alias** الذي قد يرفضه المزوّد أو يعيد كتابته.

## F. ما يُعاد استخدامه بالكامل

`smtp.server.ts` و`imap.server.ts` و`mime.server.ts` و`socket.server.ts` و`routing.server.ts` و`hostinger.server.ts` و`workspace.server.ts` وقائمة الإرسال والتذاكر والتدقيق و15 دالة البريد الخادمية. لا نظام بريد موازٍ ولا إعادة بناء لمركز البريد.

## G. أقل تعديل مطلوب

1. **Sender Identity Layer صريح** في `config.server.ts`: `authUser` = الحساب الحقيقي دائماً، `envelopeFrom` = الحساب الحقيقي (قابل للتراجع إلى الـAlias عند إثبات قبول المزوّد)، `headerFrom` = الـAlias، `replyTo` = الـAlias (وللنظام: `noreply` مع Reply-To مناسب).
2. **`smtp.server.ts`**: فصل `MAIL FROM` (مظروف) عن ترويسة `From`، وإرجاع رمز استجابة SMTP والنص المنقّح ومعرّف الرسالة في نتيجة النجاح لأجل الإثبات.
3. **تشخيص نقل ظاهر** في `getMailIntegrationStatus`: العنوان الحقيقي (بدون سرّ)، حالة الأسرار، وأي الأسماء المستعارة يُرسل بها عبر الحساب الحقيقي، والمسار المستخدم فعلاً لآخر إرسال.
4. **تسجيل المسار على كل رسالة**: حفظ `transport = smtp | managed` وسبب الـFallback في `email_messages`/`email_outbox` (بدون أعمدة جديدة إن أمكن عبر ميتاداتا قائمة) حتى لا يعود الفشل مجهول المصدر.
5. **تفعيل المزامنة للحساب الحقيقي** بدل الاعتماد على `sync_enabled` المعطّل على الأسماء المستعارة.
6. **رفع الحجب** عن `ziad.emb@gmail.com` عبر الدالة القائمة `liftMailRecipientBlock` قبل أي اختبار.

## H. الملفات والخدمات والجداول المتأثرة

- ملفات: `transport/config.server.ts`، `transport/smtp.server.ts`، `transport/hostinger.server.ts`، `email/workspace.server.ts`، `email/email.functions.ts`، `components/admin/mail/integration-panel.tsx`.
- جداول: `email_mailboxes`، `email_messages`، `email_outbox`، `email_sync_state`، `email_sync_runs`، `email_audit_logs`، `system_failures`. لا جداول جديدة، ولا تغيير في الأسرار.

## I. خطة SMTP/IMAP الصحيحة

- SMTP: اتصال واحد ومصادقة واحدة بالحساب الحقيقي، ثم `MAIL FROM` بالحساب الحقيقي و`From` بالـAlias. لا اتصال منفصل لكل Alias.
- IMAP: تسجيل دخول واحد للحساب الحقيقي فقط، ثم توزيع منطقي بالترويسات القائمة. تبقى الأسماء المستعارة بحالة `alias` وليست خللاً.

## J. خطة Send-As-Alias

لكل Alias: نفس المصادقة، تغيير الهوية فقط، ثم قياس ما فعله المزوّد فعلاً (حفظ الـAlias / إعادة كتابته / رفضه / تغيير المظروف). النتيجة تُسجَّل كحقيقة مثبتة، وإن رفض المزوّد `From` بالـAlias نعتمد `From` بالحساب الحقيقي مع `Reply-To` للقسم ونصرّح بذلك بدل ادعاء نجاح.

## K. اختبار الإرسال الحقيقي إلى ziad.emb@gmail.com

بعد رفع الحجب، رسالة حقيقية منفصلة لكل هوية: PRIMARY، SUPPORT، INFO، SALES، BILLING، LEGAL، NOREPLY بعناوين `MEHLA EMAIL E2E — …`.
يُسجَّل لكل رسالة: نجاح/فشل المصادقة، رمز استجابة SMTP، معرّف المزوّد إن توفر، Envelope From، ترويسة From الفعلية، Reply-To، Message-ID، حالة القائمة، الوصول الفعلي إلى صندوق Gmail، شكل المرسل في Gmail، وجود أي إعادة كتابة، وسجل التدقيق. بلا طباعة أي سرّ.

## L. Send → Reply → Receive → Thread E2E

إرسال من support@ → وصول → رد من Gmail → استقبال على الحساب الحقيقي → التقاط IMAP → توجيه منطقي إلى support@ → ربط بنفس الـThread وظهوره في مركز البريد وربطه بالتذكرة. تُعاد الرحلة لصندوق منطقي ثانٍ (billing@) للتأكد من التوجيه.

## M. Regression المطلوب

- مركز الدعم: الرد يُحفظ في مِهلة أولاً ثم القائمة ثم الإرسال؛ فشل SMTP لا يفقد الرد؛ الملاحظات الداخلية لا تُرسل بريداً إطلاقاً.
- بريد المصادقة (تسجيل/تحقق/استعادة) ورسائل المنصة (الدعوات والإشعارات) تبقى تعمل دون تغيير.
- الأمان: الأسرار خادمية فقط، لا تسريب في الواجهة أو السجلات، RBAC على الإرسال، عزل الصناديق، مرفقات في تخزين خاص بروابط موقّعة، Idempotency وإعادة المحاولة والحجب وحدود الإرسال والتدقيق كما هي.

## N. شرط الإعلان النهائي

- `MEHLA EMAIL TRANSPORT = PASS`: مصادقة الحساب الحقيقي ناجحة، وإرسال حقيقي وصل، وIMAP يسحب من الحساب الحقيقي.
- `MEHLA SEND-AS-ALIAS = PASS`: كل Alias موجود فعلاً أُرسل به بنفس المصادقة، وصل، وظهر المرسل الصحيح بلا إعادة كتابة غير مقصودة (أو تم اعتماد سلوك المزوّد الموثّق صراحة).
- `MEHLA EMAIL E2E = PASS`: رحلة Send → Reply → Receive → Thread مكتملة، والتذكرة والتدقيق مسجّلان بصورة صحيحة.

نجاح `send()` وحده لا يُعتبر PASS في أي بند.
