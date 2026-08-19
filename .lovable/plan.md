# تفعيل الربط الحي مع مزوّد الرسائل «مدار التقنية» (Mobile.net.sa) وتوثيق الجوال

## ملاحظة أمنية قبل البدء
مفتاح الـ API وصل داخل المحادثة كنص صريح. لن يُكتب في الكود ولا في أي Migration.
سيُخزَّن في خزانة أسرار المنصة باسم `SMS_API_KEY` ويُقرأ داخل معالج الخادم فقط.
يُنصح بعد التفعيل بتدوير المفتاح من لوحة `mobile.net.sa` لأنه ظهر في نص المحادثة.

## الوضع الحالي (تم التحقق منه)
- جدول `sms_settings`: `enabled = false`، `active_provider = 'custom'`، `test_mode = true`،
  `sender_name` فارغ، و`sender_id` يحمل قيمة قديمة غير مفهومة (بصمة hex) — أي أن الخدمة مطفأة فعلياً.
- لا يوجد أي صف في `platform_integrations`، لذا مسار الإرسال الفعلي حالياً هو المسار القديم
  (`sms_settings` + دالة `sendMobileNet` في `src/lib/sms/providers.server.ts`).
- `sendMobileNet` الحالية تستهدف `https://api.mobile.net.sa/sms/send` بحمولة قديمة
  (`numbers`, `sender`, `msg`) وتحتوي **مفتاحاً مضمّناً في الكود** ومحاولة بديلة عبر رابط GET —
  كل ذلك يُحذف ويُستبدل بواجهة Madar v1 الرسمية.
- موصل مركز التكاملات `mobilenet.server.ts` يستخدم نفس المسارات القديمة و`GET /sms/balance`.

## خطة التنفيذ

### 1) الأسرار
- تخزين `SMS_API_KEY` (مفتاح مدار) في أسرار المنصة عبر أداة الأسرار.
- لا مفاتيح في الكود إطلاقاً؛ حذف القيمة المضمّنة الحالية من `providers.server.ts`.

### 2) موصل الإرسال — Madar SMS API v1
تعديل `sendMobileNet` في `src/lib/sms/providers.server.ts`:
- الرابط: `POST {base}/api/v1/send` مع `base` افتراضي `https://app.mobile.net.sa`.
- الهيدرز: `Authorization: Bearer <SMS_API_KEY>`، `Content-Type` و`Accept` بصيغة JSON.
- الحمولة: `{ number, senderName, sendAtOption: "NOW", messageBody, allow_duplicate: true }`.
- تطبيع الرقم إلى `9665XXXXXXXX` (يُستخدم المطبّع القائم في `sms.shared.ts`).
- استخراج معرّف الرسالة من الرد للاعتماد عليه في السجل، وإسقاط «معرّف زمني وهمي» الحالي.
- عند الفشل: خطأ عربي واضح + رمز `PROVIDER_REJECTED` ورقم الحالة، بلا كشف المفتاح.

تحديث موصل مركز التكاملات `src/lib/integrations/connectors/mobilenet.server.ts` بنفس التعاقد:
- الإرسال: `POST /api/v1/send`، فحص الاتصال: `POST /api/v1/get-balance`.
- إضافة `app.mobile.net.sa` إلى المضيفين المسموح بهم في سياسة SSRF عند تهيئة التكامل.

### 3) إعدادات المزوّد في قاعدة البيانات (Migration تحديث بيانات فقط)
تحديث الصف الوحيد في `sms_settings` إلى:
`enabled = true`, `active_provider = 'mobilenet'`, `base_url = 'https://app.mobile.net.sa'`,
`sender_name = 'Mehlalex'`, `sender_id = 'Mehlalex'`, `signup_mode = 'required_verified'`,
`default_country = 'SA'`, `default_dial_code = '+966'`, `test_mode = false`,
`code_ttl_minutes = 5`, وقالب الرسالة:
«رمز التحقق لمنصة مِهلة هو: {{code}} (صالح لمدة {{minutes}} دقائق)».
- `health_status` لن يُكتب `healthy` يدوياً: القيم المسموحة في المنصة هي
  `operational/degraded/unavailable/disabled`، وستُضبط إلى `operational` **فقط** بعد نجاح
  أول إرسال حقيقي (المحرك يحدّثها تلقائياً). قبل ذلك تبقى `disabled` حتى لا نعرض حالة غير حقيقية.
- إزالة قيمة `sender_id` القديمة المشوّهة.

### 4) اعتماد الرحلة الفعلية (بدون إعلان نجاح مسبق)
- فحص الرصيد عبر `get-balance` من صفحة إعدادات الرسائل في لوحة الإدارة.
- إرسال رسالة اختبار حقيقية لرقم جوال سعودي تحدده أنت، والتحقق من:
  السجل في `sms_delivery_logs`، ورقم مرجع المزوّد، وزمن الاستجابة.
- رحلة تسجيل كاملة: إدخال الرقم ← استلام الرمز ← إدخاله ← `phone_verification_status = verified`.
- اختبار الفشل: رمز خاطئ، رمز منتهي، تجاوز حد المحاولات، ورقم غير صحيح.

## تفاصيل تقنية
- الملفات: `src/lib/sms/providers.server.ts`، `src/lib/integrations/connectors/mobilenet.server.ts`،
  ومسار الأسرار؛ لا تغيير في محرك OTP (`otp.server.ts`) لأن التعاقد ثابت.
- المفتاح يُقرأ داخل المعالج عبر `process.env['SMS_API_KEY']` فقط.
- لا يُسجَّل الرمز ولا المفتاح في أي سجل؛ الأرقام تُقنَّع بـ `maskPhone`.

## ما أحتاجه منك
رقم جوال سعودي واحد للاختبار الحقيقي (يفضّل رقمك) لإتمام إثبات الإرسال والتوثيق.
