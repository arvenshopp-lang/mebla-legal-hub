# توحيد رمز الريال السعودي في كل المنصة

## الهدف
استبدال كل صيغ العملة الحالية ("ر.س" و"ريال" و"SAR") برمز الريال السعودي الرسمي الجديد، بحجم يتناسب تلقائياً مع حجم الرقم المجاور، في الواجهة وملفات PDF والتصدير.

## ما سيحدث للمستخدم
- كل مبلغ في المنصة (لوحة التحكم، الفواتير، الأسعار، الاشتراكات، لوحة مالك المنصة) يظهر بالرمز الرسمي بدل النص.
- حجم الرمز يتبع حجم النص المجاور (نحو 0.82 من حجم الخط) ويتمركز رأسياً مع الأرقام، ولا ينفصل عن المبلغ في نهاية السطر.
- فواتير وكشوف الحسابات PDF تعرض الرمز مرسوماً كشكل متجهي نظيف (لا مربعات فارغة ولا حروف مقلوبة).
- ملفات CSV/Excel تبقى بنص "SAR" لأن الرمز غير مقروء في الجداول الحسابية، مع صف عملة واضح.

## التنفيذ التقني

### 1. مكوّن الرمز (واجهة)
- `src/components/ui/riyal.tsx`: مكوّن `<Riyal />` بـ inline SVG (المسار من الرمز المرفوع) مع `width/height = 0.82em`، `fill="currentColor"`، `aria-hidden`، ومحاذاة `align-[-0.08em]`.
- `src/components/ui/money.tsx`: `<Money value={n} />` يعرض `fmtDecimal(value)` + `<Riyal />` داخل `inline-flex items-center gap-1 tabular-nums whitespace-nowrap`، مع `sr-only` بنص «ريال سعودي» لقارئ الشاشة.

### 2. طبقة التنسيق المشتركة
- في `src/lib/format.ts`: إضافة `fmtAmount(n)` (رقم فقط) لاستخدامه مع `<Money />`، وإبقاء `fmtMoney` للنصوص البحتة (Toasts، عناوين، بريد) مع "SAR" لضمان التوافق.
- استبدال صيغ العملة النصية المجاورة للأرقام في: `src/routes/index.tsx`، `src/routes/pricing.tsx`، `src/components/marketing/pricing/plan-card.tsx` و`compare-table.tsx`، `src/routes/mehla-admin/{plans,subscriptions,revenue,analytics,index}.tsx`، `src/routes/mehla-admin/billing/$id.tsx`، `src/routes/_authenticated/{invoices,subscription}.tsx`، `src/components/office-billing/*`، `src/components/admin/billing/*`، `src/components/admin/sales/*`، `src/components/admin/crm/*`.

### 3. محرّكات PDF
- ملف جديد `src/lib/billing/pdf/riyal-glyph.ts`: مسار SVG للرمز + `drawRiyal(page, { x, y, size, color })` عبر `pdf-lib` `drawSvgPath`، بمقياس مشتق من حجم الخط (نفس نسبة 0.82) وضبط الموضع على خط الأساس.
- ربطها في `src/lib/office-billing/pdf.server.ts` و`src/lib/billing/pdf/engine.server.ts`: استبدال نص `"SAR"` برسم الرمز بعد المبلغ، مع إدخال عرض الرمز في حساب عرض السطر/الخلية حتى لا تختل المحاذاة في جداول RTL، والحفاظ على منطق «الوحدة غير القابلة للكسر».
- تبقى العبارات النصية مثل «جميع المبالغ بالريال السعودي» كما هي.

### 4. التصدير والبريد
- `src/lib/office-billing/export.ts`: يبقى "ريال سعودي (SAR)" في صف العملة وأعمدة المبالغ أرقاماً صافية.
- قوالب البريد (`src/lib/email-templates/billing-event.tsx`): تبقى "SAR" النصية لأن SVG المضمّن غير مدعوم في كثير من عملاء البريد.

### 5. التحقق
- مراجعة بصرية: الرئيسية، `/pricing`، الفواتير، كشف الحساب، لوحة مالك المنصة — جوال وكمبيوتر.
- توليد فاتورة وكشف حساب PDF وفحصهما صورةً للتأكد من موضع الرمز وحجمه.
- بقاء Type Check والبناء ناجحين، دون تغيير أي منطق مالي أو أرقام.

## قيود
- لا تعديل على قاعدة البيانات ولا على الحسابات المالية — تغيير عرض فقط.