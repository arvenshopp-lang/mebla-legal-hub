# معالجة جذرية لصفحة «مظهر المنصة / CSS»

## 1. التشخيص الحقيقي

وحدة التصميم سليمة معمارياً في النشر، والعطل محصور في المعاينة والمحرّر:

- `src/components/admin/design-preview.tsx`: المعاينة **صفحة وهمية مكتوبة يدوياً** (`mockBody()` + `BASE_CSS`) بأصناف لا وجود لها في المنصة (`.hero`, `.card`, `.mock-header`, `.badge.ok`). الصفحات الحقيقية مبنية على Tailwind v4 وtokens من `src/styles.css` ومكوّنات shadcn. لذلك أي CSS يُكتب في المحرّر «يعمل» في المعاينة ولا يعمل في الصفحة الفعلية، والعكس. هذا هو السبب الجذري.
- المعاينة تُحمّل `/fonts/mehla-fonts.css` فقط ولا تُحمّل `src/styles.css`، فالفروق البصرية مضاعفة.
- CSS المخصص للصفحة يُحصر فعلياً في `[data-page="key"]` عبر `scopeCss` في `src/lib/design/css-guard.ts`، ويُطبَّق على المنصة عبر `data-page` في `src/routes/__root.tsx:171` وحزمة `/api/public/theme.css?v=cacheVersion`. أي أن **النشر يعمل**، والمعاينة فقط هي الكاذبة.
- المحرّر `textarea` عادي (`design.tsx:248`) بلا تلوين صياغة ولا بحث ولا قالب بداية مبني على عناصر الصفحة.
- `src/lib/design/pages.ts` لا يغطي المسارات الديناميكية الفعلية (تفاصيل القضية `/cases/$id`، تذكرة الدعم، `/share/$token`, `/upload/$token`, `/invite/$token`) ويعيد مفتاح `app` غير موجود في السجل.
- الاسترجاع الحالي خطوة واحدة فقط (`rollbackTheme` → `previous_version_id`)، بلا استعادة إصدار محدد من السجل، وبلا معالجة تعارض بين مشرفين (`revision_number` موجود في `design_drafts` لكنه لا يُستخدم كقفل تفاؤلي).

## 2. المصطلحات الثلاثة (تُعرض صريحة في الواجهة)

| الطبقة | المصدر | قابلة للتعديل من اللوحة |
|---|---|---|
| CSS الأساسي | `src/styles.css` + Tailwind + مكوّنات shadcn داخل الكود | لا — للنسخ والمرجع فقط |
| CSS المخصص وقت التشغيل | `design_drafts` (مسودة) ثم `design_versions` (منشور) | نعم |
| CSS الفعلي النهائي | الأساسي + طبقة tokens + المخصص المُحصَّر، مجموعة في `/api/public/theme.css` بعد `styles.css` | النتيجة المطبقة |

## 3. البنية المقترحة (إعادة استخدام الموجود، بلا نظام موازٍ)

### أ. معاينة الصفحة الحقيقية عبر iframe من نفس النطاق + Preview Bridge
- iframe يفتح `previewPath` الحقيقي للصفحة مع `?__design=1`، من نفس الأصل، بجلسة المشرف نفسها — بلا تجاوز صلاحيات أو عزل مكاتب: الصفحة تُعرض بما يملكه المستخدم فعلاً، وأي صفحة محمية تُرفض كما تُرفض عادة.
- في `__root.tsx`: عند وجود العلم يُضاف `<style id="mehla-design-draft">` فارغ ومستقبِل `postMessage` يقبل الرسائل من نفس الأصل فقط، ويكتب CSS المسودة **بعد** الحزمة المنشورة. نفس محرك التطبيق ونفس `data-page` ونفس `styles.css`.
- الأجهزة: تغيير عرض الـ iframe (1280 / 834 / 390) بدل صفحة مبسطة.
- الصفحات بلا سطح فعلي (`error_404`, `modals`, `buttons`…) تُعرض بمعاينة عناصر واقعية مبنية من مكوّنات المنصة نفسها لا من HTML وهمي.

### ب. CSS مرجعي صادق + قالب بداية ذكي
- لوح «الأنماط الحالية» يعرض ثلاثة مصادر واضحة، كلها قابلة للنسخ:
  1. طبقة الـ tokens الفعلية للصفحة (`tokensToCss`) مع ذكر ملفها `src/styles.css`.
  2. CSS المخصص المنشور حالياً للصفحة من الإصدار النشط.
  3. **خريطة العناصر الحقيقية**: قراءة DOM المعاينة (نفس الأصل) واستخراج selectors فعلية (`[data-slot=...]`, `header`, `main`, `table`, `h1`) مع ملاحظة صريحة: «الأنماط الأساسية مبنية على Tailwind داخل React ولا يمكن تحريرها كملف CSS».
- قالب البداية يُبنى من هذه الخريطة الفعلية للصفحة المختارة، لا CSS عام فارغ. لا يُعرض أي CSS مولَّد أو مضغوط كمصدر قابل للتعديل.

### ج. محرّر CSS احترافي
CodeMirror 6 (`@uiw/react-codemirror` + `@codemirror/lang-css` + بحث) محمّل lazy: تلوين صياغة، أرقام أسطر، بحث/استبدال، طيّ، تنبيه أخطاء من `validateCustomCss`، نسخ، محتوى LTR داخل واجهة RTL.

### د. الحفظ والنشر
- زر أساسي واحد: **«حفظ ونشر الآن»** (مسودة + نشر في عملية واحدة). زر ثانوي «حفظ مسودة فقط».
- النشر يرفع `cache_version` → يتغيّر رابط `theme.css` → لا يظهر تصميم قديم؛ الرابط القديم `immutable` والجديد فوري. الجلسات المفتوحة: أي تنقل/تحديث يجلب النسخة الجديدة، وتُضاف مزامنة خفيفة تتحقق من `cache_version` وتستبدل رابط الـ stylesheet دون إعادة تحميل.
- منع نشر CSS غير صالح موجود مسبقاً في `publishTheme` (يوقف النشر ويسجّل `publish_blocked`) ويبقى الإصدار السليم نشطاً.
- التعارض: قفل تفاؤلي على `design_drafts.revision_number` — إن عدّل مشرف آخر تُرفض الكتابة برسالة عربية وخيار «إعادة التحميل ثم المحاولة».

### هـ. الأمان والحوكمة
- التحقق الخادمي قائم: `requireOwner` في `theme.functions.ts` (super_admin فقط + `design.manage`) وكل جداول التصميم محجوبة عن `anon/authenticated` مع `service_role` فقط. لا توسيع صلاحيات مطلوب.
- `css-guard.ts` ليس Regex بسيطاً: تقسيم كتل وفحص قواعد وحصر نطاق. يُقوّى بـ: حجب أي `@import` (القائمة الموثوقة فارغة أصلاً)، حجب `url()` خارجي غير data-image، وحجب هروب النطاق (`:root`, `html`, `body`, `:where/:is` ملتفة) عند صفحة محددة.
- `design_audit_logs` يسجّل publish / blocked / failed / rollback؛ يُضاف `restore_version`.

## 4. قاعدة البيانات

**لا جداول جديدة ولا Migration مطلوب.** الأعمدة القائمة تكفي: `design_versions.page_css_json/page_tokens_json/version_number`, `design_publish_state.cache_version`, `design_drafts.revision_number`, `design_audit_logs`. الاستعادة تُنفَّذ بإنشاء إصدار جديد منسوخ من الإصدار المطلوب (بلا تعديل التاريخ) ثم تحديث `active_version_id`.

## 5. مخطط التدفق

```text
اختيار الصفحة → iframe للصفحة الحقيقية (نفس الأصل، نفس الجلسة)
   ↓                       ↑ postMessage(draftCss)
محرّر CodeMirror → css-guard في المتصفح (تنبيه فوري)
   ↓ حفظ ونشر
server fn (super_admin) → css-guard خادمي → design_drafts → design_versions
   → cache_version++ → invalidateThemeCache → audit
   ↓
/api/public/theme.css?v=N  →  <html data-page="key">  →  الصفحة الفعلية
```

## 6. الملفات التي ستتغيّر

| الملف | السبب |
|---|---|
| `src/components/admin/design-preview.tsx` | إعادة بناء: iframe للصفحة الحقيقية + أجهزة + قبل/بعد، وحذف mock HTML |
| `src/lib/design/preview-bridge.ts` (جديد) | عقد رسائل المعاينة من نفس الأصل + حقن `<style>` المسودة |
| `src/routes/__root.tsx` | وضع المعاينة: عنصر style للمسودة + مستقبِل الرسائل + مزامنة `cache_version` |
| `src/lib/design/pages.ts` | تغطية المسارات الديناميكية الفعلية (`/cases/$id`, تذكرة الدعم, `/share`, `/upload`, `/invite`) وإزالة مفتاح `app` الوهمي |
| `src/lib/design/selectors.ts` (جديد) | خريطة العناصر وقوالب البداية لكل صفحة |
| `src/routes/mehla-admin/design.tsx` | محرّر CodeMirror، لوح CSS المرجعي، «حفظ ونشر الآن»، استعادة إصدار، رسائل التعارض |
| `src/lib/design/css-guard.ts` | تقوية حجب هروب النطاق وurl الخارجي |
| `src/lib/design/theme.server.ts` | `restoreVersion`، قفل تفاؤلي، توحيد النشر الفوري |
| `src/lib/design/theme.functions.ts` | `restoreDesignVersion` و`saveAndPublish` بنفس حرس المالك |
| `package.json` | إضافة CodeMirror (lazy) |

## 7. خطة اختبار E2E حقيقية (Playwright على الخادم الحي)

`scripts/e2e/design-studio.e2e.py`:
1. تعديل صفحة `cases` ونشرها → فتح `/cases` والتأكد من تطبيق النمط، ثم فتح `/clients` و`/mehla-admin` والتأكد من عدم التأثر (مقارنة computed style).
2. مطابقة المعاينة: مقارنة `getComputedStyle` لعنصر محدد داخل iframe المعاينة مع الصفحة الحقيقية بعد النشر.
3. حفظ ونشر ثم فتح الصفحة في سياق متصفح جديد والتأكد من ظهور النسخة الجديدة ورقم الإصدار.
4. استعادة إصدار سابق من السجل والتأكد من عودة القيم وتسجيل `restore_version` في التدقيق.
5. CSS محظور (`@import`, `url(https://…)`, `:root{display:none}`, هروب نطاق) → رفض النشر وبقاء الإصدار السليم نشطاً.
6. مستخدم غير مخوّل (staff عادي + مالك مكتب) → استدعاء server fn مباشرة يعيد رفضاً خادمياً، لا إخفاء زر فقط.
7. المعاينة على 1280/834/390 والتأكد من غياب التمرير الأفقي وحدّ اللمس 44px.
8. تعارض: تعديل من جلستين على نفس الصفحة → رفض واضح للثانية بلا فقد بيانات.

## 8. خطة الاسترجاع (Rollback)

1. زر «استرجاع» القائم يعيد الإصدار السابق فوراً ويرفع `cache_version`.
2. استعادة أي إصدار من السجل عند فشل أعمق.
3. مسار طارئ: تصفير `page_css_json` لصفحة واحدة ونشر إصدار نظيف بلا لمس بقية الصفحات.
4. الحد الأقصى للضرر محدود بحصر `[data-page]`، ولوحة `/mehla-admin` تُستثنى دائماً من CSS الصفحات.