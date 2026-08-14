# MEHLA — الخطة المصححة (لا تنفيذ)

قاعدة عامة: لا Migration، لا تغيير على بيانات الإنتاج، لا Deploy. التحقق في المعاينة فقط.
حالة المزوّدين تبقى كما هي: PAYMENT_GATEWAY = DEFERRED_PROVIDER، WHATSLINE = DEFERRED_PROVIDER، SMS_OTP = DEFERRED_PROVIDER — خارج كل الدفعات.
سلطة الإغلاق: LOVABLE FIX → CODEX INDEPENDENT RETEST → PASS → CLOSED. لا Finding يُغلق باختبار Lovable وحده.

---

## BATCH 1 — MEHLA-AUTH-001 (P0): تسريب بيانات الدخول قبل الـHydration

**CONFIRMED_ROOT_CAUSE:** نموذج الدخول قابل للإرسال الأصلي قبل وجود JavaScript. لا يوجد `method`، فالافتراضي GET إلى نفس المسار، والحقول تحمل `name="email"` و`name="password"` فتُسلسل في Query String. الحماية الحالية كلها بعد الـHydration (`onSubmit` + `preventDefault`) أي fail-open.

**EVIDENCE:** `src/routes/login.tsx`: `<form onSubmit={submit} noValidate>` بدون `method`؛ `<input name="email" required>` و`<input name="password" required>`؛ `<button type="submit">` غير مقيّد بحالة hydration. تسجيل الدخول يجري عبر `signIn(cleanEmail, password)` من React state، ولا يقرأ الكود `FormData` في أي مسار.

**EXACT_FILES:** `src/routes/login.tsx` (وفحص مماثل بدون تعديل مسبق الالتزام: `src/routes/register.tsx`, `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`).

**MINIMAL_FIX (fail-closed أولاً):**
1. حالة تعطيل صادرة من SSR نفسه: `const hydrated = useHydrated()` ثم `disabled={!hydrated}` على حقل البريد وحقل كلمة المرور وزر الإرسال وزر Google. HTML الأولي يخرج بالحقول والزر معطّلة قبل أي JS — فلا Enter ولا Click يُنتج إرسالاً، ولا تُسلسل أي قيمة.
2. حاجز ثانٍ داخل `submit`: `if (!hydrated) { e.preventDefault(); return; }`.
3. Defense in depth فقط: `method="post"` على النموذج (لا يُعتبر الحماية الأساسية).
4. `name="email"` و`name="password"` تبقى كما هي: مطلوبة لمديري كلمات المرور والـAutofill، ولا يعتمد عليها المسار البرمجي. لن نحذفها ولن نغيّر `autoComplete`. مع الحقول المعطّلة قبل الـHydration لا تُسلسل القيم أصلاً (المتصفح لا يُسلسل حقلاً معطّلاً، ولا يمكن تعبئته أو إرساله).
5. تنظيف ما قد يكون تسرّب سابقاً: إن وُجد `email`/`password` في `location.search` تُزال بـ`history.replaceState` دون تسجيلها — يُوصف صراحةً كـ POST-EXPOSURE CLEANUP ONLY، وليس منعاً للتسريب لأن الرابط قد يكون وصل مسبقاً إلى سجلات المتصفح أو الشبكة أو التحليلات.
6. نص الزر قبل الـHydration: «جاري التهيئة…» مع `aria-busy` كي لا يبدو الزر معطلاً بلا سبب.

**قيود التنظيف الآمن للرابط:** يعمل في المتصفح بعد الـmount فقط داخل `useEffect`؛ لا قراءة لـ`window`/`location` أثناء SSR؛ لا تسجيل للرابط الأصلي ولا لمعاملات البحث في أي سجل؛ يحذف `email` و`password` فقط ويحفظ بقية المعاملات الشرعية (مثل `redirect`)؛ يستخدم `replaceState` دون إضافة مدخل جديد في سجل التنقل. يبقى تصنيفه POST-EXPOSURE CLEANUP ONLY وليس ضابطاً أمنياً أساسياً.

**WHY_THIS_FIX:** ينقل الحماية من طبقة JS (fail-open) إلى HTML الصادر من الخادم (fail-closed)، ويبقى صحيحاً حتى مع فشل تحميل JS كلياً.

**WHAT_WILL_NOT_CHANGE:** منطق المصادقة، Supabase، الـRouting، رسائل الأخطاء الحالية، Google OAuth، إعادة تعيين كلمة المرور، `autoComplete`، الـLabels وإمكانية الوصول، تصميم الصفحة.

**REGRESSION_RISK:** منخفض–متوسط: لو تعطّل `useHydrated` تبقى الحقول معطّلة (فشل آمن لكنه يمنع الدخول) — لذا الاختبار الأول هو تسجيل دخول ناجح بعد الـHydration.

**TARGETED_TESTS:**
- A. قبل الـHydration (JS معطّل في المتصفح): البريد وكلمة المرور والزر disabled، Enter لا يرسل، Click لا يرسل، الرابط دون تغيير، لا قيم مُسلسلة (تفتيش HTML الصادر من SSR + مراقبة الشبكة).
- B. بعد الـHydration: دخول صحيح، دخول خاطئ برسالة آمنة، Google، رابط الدخول لمرة واحدة إن كان معروضاً، نسيت كلمة المرور.
- C. فشل تحميل JS (حجب حزمة الـclient): بيانات الدخول لا تغادر الصفحة إطلاقاً.
- إمكانية الوصول: التنقل بلوحة المفاتيح وقارئ الشاشة بعد الـHydration، ومديرو كلمات المرور يعبّئون الحقول.

**MIGRATION:** لا يوجد. **PRODUCTION_DATA_IMPACT:** لا يوجد.

---

## BATCH 2 — MEHLA-E2E-001 (P1): فقدان التاريخ/الوقت في الجلسات والمهل

**ROOT_CAUSE_NOT_YET_CONFIRMED**
**DIAGNOSTIC_STEP_REQUIRED_BEFORE_IMPLEMENTATION**

**EVIDENCE (ما هو معروف فقط):** `src/routes/_authenticated/hearings.tsx` يستخدم `datetime-local` ثم `new Date(val).toISOString()`؛ و`src/lib/drafts/use-dialog-draft.ts` + `use-autosave-draft.ts` يستعيدان المسودة بشكل غير متزامن بعد أول عرض. هذان مرشّحان فقط، ولا دليل يحدد نقطة الفقد.

**EXACT_FILES (للتتبع لا للتعديل الآن):** `src/routes/_authenticated/hearings.tsx`, `src/routes/_authenticated/deadlines.tsx`, `src/lib/drafts/use-dialog-draft.ts`, `src/lib/drafts/use-autosave-draft.ts`, دالة الحفظ الخادمية المقابلة.

**DIAGNOSTIC (في المعاينة/QA فقط، بيانات QA معزولة، تتبّع مؤقت يُحذف بعد التشخيص):** تتبّع القيمة عند: 1) قيمة DOM لحقل `datetime-local` 2) حالة النموذج في React 3) القيمة قبل التحقق مباشرة 4) بعد تحليل المخطط 5) حمولة الـmutation 6) مدخل الخادم/RPC 7) القيمة المخزّنة في قاعدة البيانات 8) القيمة العائدة من قاعدة البيانات 9) القيمة عند إعادة فتح النموذج. تحديد أول نقطة تختلف فيها القيمة.

**MINIMAL_FIX (يُختار بعد الدليل، منفصلاً لا مجتمعاً):**
- إن كان السبب استعادة المسودة → إصلاح الاستعادة فقط (عدم الكتابة فوق حقل لمسه المستخدم).
- إن كان السبب التسلسل/التحقق → إصلاح التسلسل فقط.
- إن كان السبب المنطقة الزمنية → توثيق دلالات المنطقة الزمنية الحالية أولاً (هل المصدر يفترض توقيت المتصفح، أم توقيت المكتب، أم UTC مخزّن مع عرض محلي)، ثم أصغر إصلاح متوافق. لا hardcode لـAsia/Riyadh ولا تغيير لمعمارية التوقيت دون دليل.

**WHAT_WILL_NOT_CHANGE:** مخطط قاعدة البيانات، صيغة التخزين، بقية النماذج، سلوك المسودات في الوحدات الأخرى.
**REGRESSION_RISK:** يُقدَّر بعد تحديد السبب.
**TARGETED_TESTS:** إنشاء وتعديل جلسة ومهلة، ثم قراءة الصف من قاعدة البيانات ومطابقة القيمة، ثم إعادة فتح النموذج، مع اختبار المسودة المستعادة والحفظ الفوري دون انتظار.
**MIGRATION:** لا يوجد حتى إثبات السبب. **PRODUCTION_DATA_IMPACT:** لا يوجد.

**STOP — لا تنفيذ قبل نتيجة التشخيص.**

---

## BATCH 3A — MEHLA-SALES-002: تعذّر حذف مسودة عرض السعر

**ROOT_CAUSE_NOT_YET_CONFIRMED**
**DIAGNOSTIC_STEP_REQUIRED_BEFORE_IMPLEMENTATION**

**EVIDENCE (تم استبعاد فرضيات لا إثبات سبب):** كل المفاتيح الأجنبية على `sales_documents` بـ`ON DELETE CASCADE` (`sales_document_items`, `sales_document_events`, `sales_document_signatures`)؛ تريجر `sales_doc_immutability` يعمل `BEFORE UPDATE` فقط ولا يمسّ الحذف؛ الحذف يجري بعميل خادمي يتجاوز RLS. رسالة الفشل التي رآها الفحص تحمل «مرجع» وهي مولّدة من `fail()` في `src/lib/sales-docs.server.ts`، لكن سجلات الخادم لا تحفظ إلا ساعة واحدة فلم يُستخرج كود الخطأ الحقيقي بعد. المسودة القائمة `QA-E2E-QUOTE-20260814-537738` بحالة `draft` وصالحة لإعادة الإنتاج.

**DIAGNOSTIC:** تنفيذ الحذف على مسودة QA في المعاينة مع قراءة سجل دالة الخادم فوراً لاستخراج كود Postgres/سبب الرفض الفعلي من سطر `[sales-docs]`.
**MINIMAL_FIX:** يُحدَّد بعد ذلك (تحقق صلاحية، أو قيد ارتباط من جدول أُضيف لاحقاً، أو تحقق حالة) — أصغر إصلاح يعالج السبب، مع رسالة عربية تشرح السبب الحقيقي دون كشف تفاصيل داخلية.
**WHAT_WILL_NOT_CHANGE:** حالات المستند، الثبات (immutability) للمستندات المُرسلة، سجل التدقيق.
**MIGRATION:** لا يوجد حتى إثبات السبب. **PRODUCTION_DATA_IMPACT:** الحذف يُجرى على مسودة QA فقط.

**STOP.**

## BATCH 3B — MEHLA-SALES-001: PDF عرض السعر

**ROOT_CAUSE_NOT_YET_CONFIRMED**
**DIAGNOSTIC_STEP_REQUIRED_BEFORE_IMPLEMENTATION**

**EVIDENCE:** المسار الحالي في `src/routes/mehla-admin/sales/$id.tsx` ينادي `salesDocumentPdf` ثم `downloadPdfPayload`. لا دليل بعد على عطل منتج مقابل قيد في أدوات الفحص الآلي.
**DIAGNOSTIC:** فتح مستند في المعاينة والضغط على PDF مع رصد: هل صدر الطلب؟ HTTP status؟ `content-type`؟ `content-disposition`؟ هل أُنتج Blob/ملف؟ هل نفّذ المتصفح التنزيل/الفتح؟
**التصنيف:** إن عمل المسار بشكل صحيح → لا تغيير في تجربة الاستخدام، ويُسجَّل `NO_PRODUCT_DEFECT_CONFIRMED` (AUTOMATION_OBSERVABILITY_LIMITATION). إن ثبت العطل → إصلاح السبب الجذري الحالي فقط.
**ملاحظة نطاق:** أي نافذة معاينة PDF جديدة = FEATURE_CHANGE وتحتاج USER_APPROVAL_REQUIRED منفصلاً، وليست جزءاً من هذه الدفعة.
**MIGRATION:** لا يوجد. **PRODUCTION_DATA_IMPACT:** لا يوجد.

**STOP.**

---

## BATCH 4 — MEHLA-MAIL-001 (P2): حالة مجلدات البريد

**ROOT_CAUSE_NOT_YET_CONFIRMED (لا يُكتفى بفحص الكود)**
**DIAGNOSTIC_STEP_REQUIRED_BEFORE_IMPLEMENTATION**

**EVIDENCE (فحص كود فقط، غير كافٍ للإغلاق):** `src/routes/mehla-admin/mail.tsx` يحفظ `folder` في الحالة ويضعه في مفتاح الاستعلام والطلب، والتصفية الخادمية في `src/lib/email/workspace.server.ts` تستخدم `.eq("folder", input.folder)`. الإبراز الحالي `bg-primary/10` مع `aria-current={folder === f.id}` أي يخرج `aria-current="false"` للعناصر غير النشطة.
**DIAGNOSTIC:** في المعاينة، الضغط على الوارد ثم الصادر ثم المسوّدات ثم الأرشيف، وتحقق لكل واحد من: حالة التحديد المرئية، مفتاح الاستعلام، مرشّح الطلب في الشبكة، مجموعة البيانات العائدة، الرسائل الظاهرة، ومعاملات الرابط إن وُجدت.
**التصنيف المطلوب:** VISUAL_STATE_ONLY أو DATA_FILTER_WIRING أو BOTH.
**MINIMAL_FIX حسب النتيجة:** إن كانت البيانات تتغير صحيحاً والمشكلة الإبراز فقط → إصلاح UI محدود (`aria-current="page"` عند التطابق فقط، إبراز أوضح، إظهار اسم المجلد النشط في ترويسة القائمة). إن كانت البيانات لا تتغير → إصلاح ربط التصفية نفسه، ولا يُكتفى بـCSS أو `aria-current`.
**WHAT_WILL_NOT_CHANGE:** الصناديق والحسابات، الإرسال والاستلام، ربط التذاكر.
**MIGRATION:** لا يوجد. **PRODUCTION_DATA_IMPACT:** لا يوجد (قراءة فقط).

---

## BATCH 5 — MEHLA-DOC-001 (P2): جودة العلامة المائية

**CONFIRMED_ROOT_CAUSE:** كثافة الوسم وأحجامه الحالية تُنتج تزاحماً بصرياً يصعّب قراءة المحتوى: `OPACITY 0.12`، `TILE_X 260`, `TILE_Y 190`، `FONT_SIZE 11`، `LINE_GAP 15`، زاوية −35.
**EVIDENCE:** `src/lib/secure-view/stamp.server.ts` (ثوابت الوسم ودالة `drawWatermark` وسطر التذييل `drawFooter`).
**EXACT_FILES:** `src/lib/secure-view/stamp.server.ts` فقط.
**MINIMAL_FIX:** ضبط التباعد وحجم الخط والشفافية وتمييز سطري الهوية بمقاسين، مع وسم كل الصفحات.
**MEASURE OF SUCCESS (الصياغة المعتمدة):** تتبّع بصري واضح، حفظ الهوية والسياق، وسم جميع الصفحات، صعوبة كافية لتجاوزه بالنظر، وقراءة سليمة دون حجب جوهري للمحتوى القانوني. لا نستخدم وصف «غير قابل للإزالة».
**WHAT_WILL_NOT_CHANGE:** سياسة الوسم، أحداث سجل التدقيق (view/download/print/share)، الروابط الموقعة، مسار العرض الآمن.
**REGRESSION_RISK:** منخفض وبصري فقط.
**TARGETED_TESTS:** مستند PDF متعدد الصفحات، صورة، ونص محوّل — عرض وتنزيل وطباعة، والتأكد من بقاء نفس أحداث التدقيق.
**MIGRATION:** لا يوجد. **PRODUCTION_DATA_IMPACT:** لا يوجد (النسخة المائية تُبنى عند الطلب).

---

## BATCH 6 — تنظيف منخفض الأولوية

**CONFIRMED_ROOT_CAUSE:** (أ) حد الحجم مكتوب يدوياً «20 ميجابايت» في موضعين بدل مصدر واحد. (ب) ورقة «المزيد» في تنقل الجوال لا تُغلق بمفتاح Escape.
**EVIDENCE:** `src/routes/_authenticated/documents.tsx:435` و`src/routes/upload.$token.tsx:243` يستخدمان `SUPPORTED_FORMATS_LABEL` من `src/lib/client-portal.shared.ts` مع رقم حجم مكتوب نصاً؛ `src/components/app/workspace-mobile-nav.tsx` يدير `moreOpen` بـ`aria-expanded` دون معالج Escape.
**MINIMAL_FIX:** ثابت واحد لحد الحجم في `src/lib/client-portal.shared.ts` يُستهلك في الموضعين؛ وإغلاق الورقة بـEscape مع إعادة التركيز إلى الزر.
**WHAT_WILL_NOT_CHANGE:** الحد الفعلي المطبَّق على الخادم والمخزن، قائمة الصيغ المسموحة، عناصر التنقل.
**REGRESSION_RISK:** منخفض.
**TARGETED_TESTS:** مطابقة النص مع الحد الخادمي الفعلي؛ فتح وإغلاق ورقة الجوال بلوحة المفاتيح وباللمس.
**MIGRATION:** لا يوجد. **PRODUCTION_DATA_IMPACT:** لا يوجد.

---

## ترتيب التنفيذ المقترح
1) Batch 1 (P0). 2) تشخيص Batch 2 ثم إصلاحه بدليل. 3) تشخيص 3A و3B. 4) تشخيص Batch 4 ثم إصلاحه بتصنيفه. 5) Batch 5. 6) Batch 6.
بعد كل دفعة: Type Check + ESLint + اختبار الرحلة الفعلية (نجاح/فشل/صلاحيات/جوال)، ثم انتظار إعادة اختبار مستقل قبل الإغلاق.

CORRECTED_PLAN_READY
USER_APPROVAL_REQUIRED
