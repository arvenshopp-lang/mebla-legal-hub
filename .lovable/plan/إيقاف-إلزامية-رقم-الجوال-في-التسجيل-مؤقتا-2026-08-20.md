# إيقاف إلزامية رقم الجوال في التسجيل مؤقتاً

## المطلوب
إيقاف ربط رقم الجوال الإلزامي بإنشاء الحساب حتى يتم قبول مزوّد الرسائل (مدار). يبقى التوثيق متاحاً لمن يريده، لكنه لا يمنع إتمام التسجيل أو إنشاء المكتب.

## التشخيص الحالي (مؤكد من قاعدة البيانات)
- `public.sms_settings`:
  - `enabled = true`
  - `active_provider = 'mobilenet'`
  - `signup_mode = 'required_verified'`
  - `require_phone = true`
  - `show_phone_field = true`
  - `health_status = 'unavailable'`
- `register.tsx` يقرأ هذه الإعدادات فيزام رقم الجوال ويطلب رمز التحقق.
- `create_organization_with_owner` ترفض إنشاء المكتب إذا لم يكن `phone_verification_status = 'verified'` عند `signup_mode = 'required_verified'`.

## التغييرات المقترحة

### 1. تعديل إعدادات المنصة (migration جديد)
إنشاء migration يُحدِّث `public.sms_settings` إلى:
- `signup_mode = 'optional'`
- `require_phone = false`
- `show_phone_field = true` (يبقى الحقل ظاهراً لكن اختيارياً)
- `health_status = 'disabled'` أو `unavailable` حسب الحالة الفعلية للمزوّد

بهذا:
- `phoneFieldVisible()` تبقى `true`.
- `phoneRequired` تصبح `false`.
- `verificationRequired` تصبح `false` لأن `requiresVerification('optional') = false`.
- `create_organization_with_owner` لن ترفض إنشاء المكتب.

### 2. تحديث واجهة التسجيل (`src/routes/register.tsx`)
- إزالة النجمة الحمراء من تسمية "رقم الجوال" (تصبح `required={phoneRequired}` وهو `false`).
- إزالة نص التوثيق "سنرسل رمز تحقق من 6 أرقام…" لأنه لم يعد مطلوباً.
- إضافة نص اختياري واضح: "(اختياري — يمكن إضافته لاحقاً من الإعدادات)".
- إبقاء صندوق `+966` الثابت والتحقق من صحة الرقم السعودي عند الإدخال، دون منع الإرسال عند تركه فارغاً.
- التأكد من أن `phoneOk` تسمح بترك الحقل فارغاً.

### 3. التأكد من صفحة التهيئة (`src/routes/onboarding.tsx`)
- `verificationRequired` ستصبح `false` تلقائياً، وبالتالي لن يُعرض `PhoneVerificationCard` ولا يُمنع إنشاء المكتب.
- لا حاجة لتعديلات هنا ما لم تظهر حاجة أثناء التنفيذ.\n### 4. التحقق والاختبار
- فحص الأنواع و ESLint.
- اختبار تسجيل حساب جديد بدون إدخال رقم جوال والتأكد من إنشاء المكتب بنجاح.
- اختبار إدخال رقم جوال صحيح والتأكد من عدم طلب رمز التحقق.

## ملاحظات
- لا يتم حذف أي جداول أو تغيير بنية `sms_settings`.
- يمكن العودة إلى الإلزامية لاحقاً بمجرد تغيير `signup_mode` إلى `'required_verified'` و `require_phone` إلى `true`.
- لا يؤثر هذا التغيير على التحقق بخطوتين (MFA) أو توثيق الجوال من الإعدادات؛ كلاهما يبقى اختيارياً.
