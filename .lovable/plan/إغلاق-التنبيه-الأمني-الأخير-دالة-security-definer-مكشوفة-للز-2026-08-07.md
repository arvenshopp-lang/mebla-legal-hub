# إغلاق التنبيه الأمني الأخير: دالة SECURITY DEFINER مكشوفة للزوّار

## التشخيص المؤكد
استعلمت قاعدة البيانات مباشرة عن كل دوال `SECURITY DEFINER` في `public` و`private` القابلة للتنفيذ من دور `anon`. النتيجة **دالة واحدة فقط**:

- `public.notify_case_event()` — دالة **Trigger** (بدون معاملات، ترجع `trigger`).
- صلاحياتها الحالية: `EXECUTE` ممنوحة لـ `PUBLIC` و`anon` و`authenticated` و`service_role`.
- استخدامها في الكود: مربوطة كـ Trigger على جدولين فقط (`FOR EACH ROW EXECUTE FUNCTION`)، ولا يوجد أي استدعاء `rpc()` لها من الواجهة أو الخادم.

## سبب أن هذا آمن الإصلاح
دوال الـ Trigger تُنفَّذ عبر محرّك الـ Trigger بصلاحية مالك الجدول، ولا تعتمد إطلاقاً على منحة `EXECUTE` للأدوار. لذلك سحب `EXECUTE` من `PUBLIC` و`anon` و`authenticated` **لا يعطّل الـ Trigger**، ويغلق مسار الاستدعاء المباشر عبر Data API.

## التنفيذ
Migration واحدة صغيرة:

1. `REVOKE EXECUTE ON FUNCTION public.notify_case_event() FROM PUBLIC, anon, authenticated;`
2. الإبقاء على `service_role` كما هو (لا يستدعيها، لكن سحبها لا يفيد ويزيد خطر الارتداد).
3. لا تغيير على جسم الدالة، ولا على الـ Triggers، ولا على أي جدول أو سياسة RLS.

## التحقق بعد التنفيذ
1. إعادة الاستعلام نفسه للتأكد أن الناتج **صفر صفوف** (لا دالة `SECURITY DEFINER` قابلة للتنفيذ من `anon`).
2. إعادة تشغيل الفاحص الأمني (`security scan`) للتأكد من اختفاء التنبيه `SUPA_anon_security_definer_function_executable`.
3. اختبار حي: إنشاء/تحديث صف على أحد الجدولين المرتبطين بالـ Trigger والتأكد أن الإشعار ما زال يُنشأ في `notification_queue` — أي أن الـ Trigger يعمل بعد سحب المنحة.
4. تشغيل `bun run security:check` للتأكد من عدم ظهور مخالفة جديدة.

## ما لن يُلمس
- المركز المالي وRBAC والسياسات الحالية (الوحدات المجمّدة).
- قائمة الدوال الإحدى عشرة المسموح استدعاؤها من `authenticated`.
- أي كود واجهة أو خادم — التغيير في القاعدة فقط.
