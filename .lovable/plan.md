# تكامل WhatsApp الرسمي (Official Meta WABA) عبر Whats Line — تقرير وخطة

## 1) الوضع الحالي (مفحوص فعلياً، لا تخمين)

**موجود ويعمل:**
- بوابة ويب هوك عامة كاملة: `api/public/wh/$slug` و`api/public/webhooks/$slug` فوق محرك واحد `src/lib/webhooks/gateway.server.ts` (حد معدّل + تحقق إلزامي + حماية إعادة إرسال + Idempotency + تسجيل منقّح).
- مُحوِّل `whatsline` في `src/lib/webhooks/adapters/whatsline.server.ts` يترجم `message.received` و`message.status`.
- صف المزوّد في `webhook_endpoints`: `whatsline` **مفعّل**، وضع التحقق الحالي `shared_secret`، السرّ مهيأ، آخر حدث 2026-08-07، بلا خطأ.
- **جداول محرك الإشعارات منشأة بالكامل** في ترحيل `20260807085320`: `notification_events`، `notification_rules`، `notification_template_mappings`، `notification_queue`، `notification_attempts`، `notification_client_preferences`، `notification_link_tokens`، `whatsapp_devices`، `whatsapp_templates`، `whatsapp_provider_state`.
- **Triggers فعالة على `cases`** (`cases_notification_event_insert` / `_update` عبر `notify_case_event`) وقد أنتجت **8 أحداث في `notification_events`**.
- الأسرار مخزّنة: `WHATSLINE_APP_ID`، `WHATSLINE_HEADER_TOKEN`، `WHATSLINE_BASE_URL`، `WHATSLINE_TEST_PHONE`.
- نمط مشغّل دوري مثبت وناجح للبريد: `api/public/hooks/email-dispatch` + `dispatchDue()`.
- صلاحيات جاهزة في `src/lib/admin-permissions.ts`: `integrations.read/manage/test/activate/view_logs` و`notifications.send`، وسجل `admin_audit_logs`.

**غائب تماماً:**
- لا كود مزوّد واتساب: لا `src/lib/notifications/*`، ولا `whatsline` في `src/lib/integrations/connectors/registry.server.ts` (السجل OTP فقط: infobip/twilio/unifonic/custom_rest، و`AdapterType` لا يعرف واتساب).
- `dispatch.server.ts` سجل معالجاته **فارغ** (`HANDLERS = {}`) — كل حدث وارد يُسجَّل «بلا معالج».
- لا مشغّل طابور للإشعارات: الأحداث الثمانية **بلا معالجة** و`notification_queue` = 0.
- `whatsapp_provider_state` = `not_configured` ومعطّل، والأجهزة والقوالب والقواعد والربط كلها 0.
- `/mehla-admin/notifications` حالياً بث داخلي فقط، بلا طابور ولا قوالب ولا أجهزة.

## 2) رسمي أم غير رسمي حالياً؟

**غير محدد بعد — لا إرسال إطلاقاً.** لا يوجد أي استدعاء لمسار إرسال. الموجود اتجاه واحد: استقبال ويب هوك. لذلك لا حاجة لـ«تحويل» من غير رسمي، بل **بناء مسار الإرسال الرسمي مباشرة** على البنية القائمة — أنظف وأقل خطراً.

## 3) وظيفة الويب هوك اليوم

يتحقق من المُستدعي، يمنع التكرار وإعادة الإرسال، يترجم الحدث، يسجّله منقّحاً في `webhook_events`، ثم يحاول التسليم لمعالج داخلي — ولا يوجد معالج، فيرد `ok` بحالة «بلا معالج». أي: قناة استقبال آمنة **غير موصولة** بمنطق الأعمال.

## 4) ما يُعاد استخدامه بلا تعديل

- بوابة الويب هوك ومحرك التحقق والمسار القصير.
- مُحوِّل `whatsline` وسجل المُحوِّلات.
- خزنة الأسرار `vault.server.ts`، طبقة HTTP الآمنة (مهل + حماية SSRF)، سجل `integration_health_logs`.
- كل جداول محرك الإشعارات وTriggers القضايا — **لا ترحيل بنيوي جديد مطلوب**.
- نمط `email-dispatch` للمشغّل الدوري، RBAC وسجل التدقيق، ومسار `/track` للرمز الآمن.

## 5) الفجوات

1. مزوّد Whats Line الرسمي: فحص اتصال، أجهزة رسمية، قوالب رسمية، إرسال قالب.
2. محرك الإشعارات: `notification_events` → قاعدة → مستلم → قالب → طابور.
3. مشغّل الطابور مع إعادة محاولة وتصنيف أخطاء نهائي/قابل للإعادة.
4. ربط `message.status` الوارد بصفوف الطابور (معالج في `dispatch.server.ts`).
5. واجهة إدارة: بطاقة المزوّد + الأجهزة + القوالب + الربط + الطابور + السجلات.
6. تطبيع أرقام E.164 السعودية، وموافقة العميل، وحدود الإرسال.
7. رمز متابعة قصير الصلاحية لزر الرسالة عبر `notification_link_tokens`.

## 6) أقل التعديلات المطلوبة

- **لا ترحيل بنيوي جديد** (الجداول موجودة). ترحيل صغير واحد فقط إن ظهر فهرس أو صف تشغيل أولي ناقص.
- ملفات جديدة معزولة: `src/lib/notifications/*` و`src/lib/integrations/connectors/whatsline-official.server.ts`.
- تعديلان صغيران في ملفات قائمة: سطر معالج في `dispatch.server.ts`، وقسم جديد في صفحة الإدارة.
- **لا مساس** بالمركز المالي ولا RBAC ولا محرك البريد ولا العلامة المائية.

## 7) خطة التنفيذ (بالرحلة الرسمية المطلوبة)

**المرحلة 1 — طبقة المزوّد الرسمية**
`WhatsLineOfficialProvider` بدوال `testConnection`، `getOfficialDevices`، `getOfficialTemplates`، `sendTemplateMessage` عبر `official/v1/send-message`، فوق طبقة HTTP الآمنة القائمة، مع تطبيع أخطاء (`AUTH_FAILED`, `INVALID_PHONE`, `TEMPLATE_NOT_FOUND`, `DEVICE_OFFLINE`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_5XX`) وتصنيف قابل للإعادة/نهائي. الأسرار تُقرأ داخل الـ handler فقط ولا تُسجَّل.

**المرحلة 2 — اكتشاف الرقم واختيار المُرسِل الرسمي**
مزامنة `whatsapp_devices` من الأجهزة الرسمية، ثم اختيار جهاز افتراضي **صريح** في `whatsapp_provider_state.default_device_id`، ثم مزامنة `whatsapp_templates` مع عدد متغيرات الجسم والزر. لا إدخال يدوي لمعرّف قالب ولا استخدام قالب غير معتمد.

**المرحلة 3 — الربط والمحرك**
`notification_template_mappings` لكل حدث (بدءاً بـ `case.created`, `case.status_changed`, `case.closed`) بترتيب متغيرات صريح؛ عدم تطابق العدد = **لا إرسال** + خطأ تهيئة مسجّل. المحرك يحوّل الأحداث القائمة إلى صفوف طابور بمفتاح تفرّد `org:event:recipient:channel`.

**المرحلة 4 — المشغّل الدوري**
`api/public/hooks/notifications-dispatch` بنفس نمط البريد، بمطالبة ذرية `queued → processing`، وإعادة محاولة 1د/5د/15د، وتسجيل كل محاولة في `notification_attempts`. النجاح = `provider_accepted` فقط (لا «تم التسليم» بلا تأكيد ويب هوك).

**المرحلة 5 — ربط حالات التسليم**
معالج `*:message.status` في `dispatch.server.ts` يحدّث صف الطابور المطابق بمعرّف رسالة المزوّد فقط، بلا إنشاء صفوف جديدة وبلا تسجيل أرقام صريحة.

**المرحلة 6 — واجهة الإدارة (عربية RTL)**
بطاقة «WhatsApp — Official WABA (Whats Line)» في `/mehla-admin/integrations`: الحالة، آخر فحص، آخر مزامنة، عدد الأجهزة والقوالب، الجهاز الافتراضي، آخر خطأ، وأزرار فحص/مزامنة أجهزة/مزامنة قوالب/رسالة اختبار/تعطيل. وقسم «مركز الإشعارات» للقواعد والربط والطابور والسجلات بفلاتر ومؤشرات حقيقية. كل إجراء يتحقق خادمياً من `integrations.*` / `notifications.*` ويُسجَّل في `admin_audit_logs`.

**المرحلة 7 — Test Mode والحدود والخصوصية**
`test_mode = true` إلزامياً حتى موافقتك: لا إرسال إلا إلى `WHATSLINE_TEST_PHONE`، وكل رسالة موسومة اختباراً. تطبيع E.164 للأرقام السعودية، احترام `notification_client_preferences`، حدود لكل مكتب/مستلم/مزوّد من `whatsapp_provider_state`، ومحتوى عام فقط مع رمز متابعة قصير الصلاحية بدل أي معرّف.

**المرحلة 8 — اختبار فعلي**
فحص اتصال حقيقي، مزامنة أجهزة وقوالب حقيقية، رسالة اختبار للرقم المصرّح، صيغ أرقام صحيحة وخاطئة، قالب/جهاز خاطئ، توكن غير مصرّح، محاكاة 429/500/مهلة، تفرّد الطابور (لا رسالة مرتين)، معالجة الأحداث الثمانية القائمة، RLS بين مكتبين، RBAC، وسجل التدقيق. سأفصل في التقرير بين ما اختُبر فعلاً وما تعذّر ولماذا.

## تفاصيل تقنية
- كل ملف يعرّف `createServerFn` يبقى Wrapper نظيفاً والمنطق في `.server.ts` (قيد بناء TanStack).
- تشغيل المشغّل عبر pg_cron بنفس نمط `email-dispatch` وبنفس تحقق المفتاح.
- لا `any`، ولا Mock Data، ولا عرض نجاح غير مستمد من نتيجة حقيقية.
- رحلة رفع المستند في `scripts/e2e/org_journeys_e2e.py` تبقى موقوفة مؤقتاً حتى انتهاء هذه الخطة ثم تُغلق كما هي مخططة.