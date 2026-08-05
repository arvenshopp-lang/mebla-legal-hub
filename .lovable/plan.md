# بناء الصفحات الأربع الناقصة في لوحة `/mehla-admin`

## المشكلة المؤكدة
`src/components/admin/shell.tsx` يعرض روابط لأقسام لا توجد لها ملفات مسارات:
`/mehla-admin/crm` و `/mehla-admin/marketing` و `/mehla-admin/hr` و `/mehla-admin/flags`.
(رابط `/mehla-admin/sales` أصبح موجوداً فعلياً، فلا مشكلة فيه.)
طبقات الخادم جاهزة: `src/lib/crm.functions.ts`, `marketing.functions.ts`, `hr.functions.ts`, `flags.functions.ts`.

## الخطة
1. **مفاتيح التشغيل** — `src/routes/mehla-admin/flags.tsx`: تبويبان (مفاتيح الميزات، قواعد الإشعارات) مع جداول `DataTable`، نافذة إنشاء/تعديل، وحذف مؤكد عبر `flags.functions.ts`.
2. **مركز الموظفين** — `src/routes/mehla-admin/hr.tsx`: قائمة الموظفين بالبحث والتصفية بالحالة والقسم، استخدام `employee-form-modal.tsx` الموجود، وقسم مستندات الموظف.
3. **مركز التسويق** — `src/routes/mehla-admin/marketing.tsx`: تبويبات (الحملات، أحداث التحويل، الإحالات) + بطاقات ملخص الأداء من `getMarketingPerformanceSummary` + تصدير CSV.
4. **إدارة العلاقات (CRM)** — إصلاح أخطاء الأنواع في `crm.functions.ts` (حقول JSON/UTM غير قابلة للتسلسل) ثم:
   - `src/routes/mehla-admin/crm.tsx` بتبويبات (العملاء المحتملون، الشركات، جهات الاتصال، الفرص، الأنشطة) ولوحة خط الأنابيب.
   - مكونات مشتركة في `src/components/admin/crm/`.
5. **التحقق**: `tsgo` + `eslint`، وفتح كل رابط من القائمة الجانبية للتأكد من عدم وجود 404، مع مراعاة حالات التحميل/الخطأ/الفراغ وRTL والتجاوب من 320px.

## ملاحظات
- لا تغييرات في قاعدة البيانات — الجداول والصلاحيات جاهزة.
- كل استدعاء يمر عبر دوال الخادم المؤمّنة بصلاحيات `crm.read`, `hr.read`, `marketing.read`, `settings.manage` مع سجل تدقيق.
