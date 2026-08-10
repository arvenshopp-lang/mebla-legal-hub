# نظام الطباعة العام لمِهلة — Tajawal + Cairo

## 1. الوضع الحالي (مثبت بالفحص)
- `src/styles.css:117-119` داخل `@theme inline`: `--font-sans` و`--font-serif` و`--font-mono` كلها = `"IBM Plex Sans Arabic"` → مصدر واحد لكل عائلات Tailwind.
- التحميل: `@import "./styles/fonts.css"` في أعلى `src/styles.css`، و8 ملفات woff2 محلية في `public/fonts/` (عربي/لاتيني × 400/500/600/700)، مع `preload` لوزنَي 400/700 العربي في `src/routes/__root.tsx:146-160`. نسخة مكرّرة مقصودة في `public/fonts/mehla-fonts.css` لمحرك الطباعة وصفحات HTML الخارجة عن React.
- الأساس في `@layer base`: `html`/`body` = `var(--font-sans)`، `body` line-height 1.7، عناصر النماذج و`::placeholder` ترث الخط صراحة، العناوين h1–h6 = `var(--font-sans)` بـ line-height 1.35 ووزن 700 (h3/h4 = 600).
- أدوات الطباعة القائمة (`@utility`): `text-display, text-h1..h4, text-body-lg, text-body, text-body-sm, text-caption, text-label, text-table, text-page-title, text-section-title, text-stat` (بـ tabular-nums)، `text-menu`, `measure`. لا تحدد أي منها `font-family` — كلها ترث. هذه نقطة الارتكاز للتنفيذ.
- تجاوزات الخط الموجودة (كلها خارج DOM التطبيق): محرك الطباعة `src/lib/print/print-engine.tsx:83`، حاجز الطباعة `print-guard.tsx:90`، العلامة المائية SVG `src/lib/print/watermark.ts`، قوالب البريد (`email-templates/*`, `email.functions.ts`, `attachments.server.ts`, `csat.server.ts`, `compose-modal.tsx`)، و`sales-docs.server.ts:461`.
- استوديو التصميم (`src/lib/design/tokens.ts:107-130`) يسمح للمالك بتغيير `--font-arabic` و`--font-headings` عبر `html` و`h1..h6` — طبقة حقن CSS قائمة يجب ألا يتعارض معها التوكن الجديد.
- الـ PDF: `src/lib/billing/pdf/engine.server.ts` و`src/lib/secure-view/stamp.server.ts` يدمجان خطاً واحداً مضمّناً base64 (`src/lib/secure-view/watermark-font.ts`) عبر fontkit مع تشكيل عربي مخصص (`arabic.server.ts`) — يعمل ومقبول.
- CSP (`src/lib/security-headers.server.ts:18-19`): `style-src 'self' 'unsafe-inline'` و`font-src 'self' data:` — لا يوجد أي مصدر خطوط خارجي.

## 2. تنبيه قبل الموافقة
ذاكرة المشروع الحالية تنص: «IBM Plex Sans Arabic هو الخط الرسمي الوحيد… ممنوع Google Fonts أو أي CDN خطوط». هذا الطلب يغيّر القاعدة. الموافقة على الخطة = تحديث القاعدة إلى: Tajawal (واجهة) + Cairo (عناوين)، مستضافان محلياً، وIBM Plex يبقى احتياطياً.

## 3. القرار: استضافة محلية (Option A) — موصى به
- Tajawal وCairo بترخيص **SIL OFL 1.1** → الاستضافة الذاتية والتضمين مسموحان (مع الإبقاء على نص الترخيص داخل `public/fonts/`).
- الأسباب: لا طلب خارجي من متصفح محامٍ يتعامل مع بيانات حساسة (خصوصية)، **صفر تغيير على CSP** (`font-src 'self' data:` كافٍ)، لا نقطة فشل خارجية، تحكم كامل في الكاش، ونفس النمط المعمول به فعلاً.
- Google Fonts (Option B) مرفوض هنا: يتطلب توسيع `style-src` إلى `https://fonts.googleapis.com` و`font-src` إلى `https://fonts.gstatic.com`، ويكشف IP وReferer لكل مستخدم لطرف ثالث، ويضيف اعتماداً شبكياً على مسار العرض الأول.

## 4. العائلات والأوزان
| الدور | العائلة | الأوزان المحمّلة |
|---|---|---|
| الواجهة والنص والأزرار والجداول والنماذج | Tajawal | 400, 500, 600 (+700 للحالات النادرة فقط) |
| العناوين الكبرى والأرقام البارزة | Cairo | 600, 700 |

`font-display: swap` لكل الوجوه. Preload لملفَي البداية فقط: Tajawal 400 عربي + Cairo 700 عربي (ويُلغى preload الخاص بـ IBM Plex).

سلاسل الاحتياط:
```
--font-sans: "Tajawal", "IBM Plex Sans Arabic", system-ui, "Segoe UI", sans-serif;
--font-display: "Cairo", "IBM Plex Sans Arabic", system-ui, sans-serif;
```
IBM Plex = **KEEP AS FALLBACK** (يبقى محمّلاً بأوزانه الحالية، ولا يُحذف).

## 5. التوكنات والتكامل مع Tailwind v4
داخل `@theme inline` فقط، بلا نظام موازٍ:
- تعديل `--font-sans` (Tajawal) و`--font-serif`/`--font-mono` لتتبعه.
- توكن دلالي جديد واحد: `--font-display` (Cairo).
- الربط داخل الأدوات القائمة فقط: `text-page-title`, `text-section-title`, `text-display`, `text-h1`, `text-h2`, `text-stat` تحصل على `font-family: var(--font-display)` — فترث كل صفحة Cairo تلقائياً بلا تعديل مكوّنات. الباقي (`text-body*`, `text-table`, `text-label`, `text-caption`, `text-menu`, `text-h3/h4`) يبقى Tajawal.
- `@layer base`: قاعدة العناوين تتحول إلى h1/h2 = display و h3–h6 = sans، مع الإبقاء على `padding-block: .04em` (يمنع قص الهمزات).
- ممنوع إنشاء `--font-sidebar/-button/-table/-modal/-form`.
- مزامنة `public/fonts/mehla-fonts.css` بنفس `@font-face` (نسخة مستقلة لمحرك الطباعة).

### التطبيق على الأسطح المطلوبة
- الأزرار وCTA: Tajawal 500، والأساسي 600 — لا Cairo.
- السايدبار: Tajawal 500، والعنصر النشط 600 (بلا تغيير أبعاد أو معمارية).
- الشريط العلوي والبحث وQuick Create والإشعارات ومبدّل المكاتب: Tajawal؛ عنوان الصفحة المنفصل = Cairo.
- الجداول: رأس Tajawal 600، صفوف 400/500، الأرقام والمعرّفات والهواتف والمبالغ بـ `tabular-nums` بلا مساس بمعالجة RTL/LTR.
- النماذج: Tajawal للتسميات والمدخلات والنصوص المساعدة والأخطاء (الوراثة الصريحة موجودة أصلاً وتبقى).
- KPI: الرقم Cairo 700 + tabular-nums، والتسمية والشرح Tajawal — بلا لمس حسابات Feature 02.
- الصفحة العامة للمكتب والمصادقة والتسويق: العناوين الكبرى Cairo، وكل ما تبقى Tajawal — عبر الوراثة فقط.

## 6. القياسات العربية بعد التغيير
Tajawal أضيق من Plex → يُعاد ضبط الأرقام في الأدوات فقط: `body` line-height 1.75 للنص، `text-table` تبقى 1.5 (كثافة الجداول)، `text-page-title` بـ Cairo: line-height 1.4 و`letter-spacing: 0` (لا تضييق سلبي كاللاتيني)، `text-stat` كما هي. لا `line-height` عام على العناصر.

## 7. تصنيف الأسطح
- **REUSE (وراثة تلقائية، صفر تعديل ملفات)**: Dashboard، القضايا وتفاصيلها، العملاء، المهام، المهل، الجلسات، المستندات، الفريق، أداء الفريق/KPI، الاشتراك، الدعم، الإعدادات، إدارة الصفحة العامة، الصفحة العامة للمكتب، المصادقة، الصفحات التسويقية، وكل `src/routes/mehla-admin/*` (الخيار A: وراثة آمنة للتوكنات، لا قواعد نطاق خاصة).
- **CHANGE (ملفات تُعدّل فعلياً)**: `src/styles.css`، `src/styles/fonts.css`، `public/fonts/mehla-fonts.css`، `src/routes/__root.tsx` (preload)، أصول `public/fonts/*` الجديدة. وعند ظهور قص فعلي: تعديل تقديمي في مكوّن واحد بعينه.
- **NO CHANGE**: `src/components/app/*` (المرحلتان A/B مغلقتان)، معمارية Stage C، قوالب البريد (عملاء البريد لا تعرف الخطوط الجديدة)، أي منطق خادمي أو RBAC/RLS.
- **KEEP (طباعة/PDF)**: `print-engine.tsx`, `print-guard.tsx`, `watermark.ts`, `billing/pdf/*`, `secure-view/*` تبقى على الخط المضمّن الحالي — تشكيل fontkit مُثبت ولا يُخاطر به.
- **DEFERRED**: Traditional Arabic / Simplified Arabic — غير موجودين في المستودع، ولا حق تضمين مؤكد، ولا توفر على خادم الإنتاج.

## 8. ترتيب التنفيذ
1. إضافة أصول woff2 ونص الترخيص، وكتابة `@font-face` في `src/styles/fonts.css` ونسخها إلى `public/fonts/mehla-fonts.css`.
2. تحديث `@theme inline` (`--font-sans`, `--font-display`) وقاعدة العناوين في `@layer base`.
3. ربط Cairo داخل أدوات العناوين والإحصاءات القائمة فقط.
4. تحديث preload في `__root.tsx`.
5. ضبط line-height وletter-spacing العربي.
6. تدقيق بصري ووظيفي ثم إصلاح أي قص تقديمي.

## 9. القبول
- **بصري**: لقطات على 390/768/1024/1440 لـ: Dashboard, Cases, Case Detail, Clients, Tasks, Deadlines, Hearings, Documents, Team, Team Performance, إدارة الصفحة العامة, الصفحة العامة, Settings, Auth, mehla-admin.
- **حسابي**: `getComputedStyle` يثبت Tajawal على النص والأزرار والجداول والنماذج والملاحة، وCairo على `text-page-title`/`text-section-title`/`text-stat`، ولا خط متصفح افتراضي، ولا ظهور غير مقصود لـ IBM Plex.
- **تجاوب**: صفر تمرير أفقي على 320/390/430/768/1024/1280/1440، ولا قص في تسميات السايدبار أو الشريط السفلي أو ورقة «المزيد» أو الأزرار أو الشارات.
- **أداء**: من Network — عدد طلبات الخطوط، حالة 200 لكل ملف، لا 404، لا تنزيل مكرر، لا أخطاء CSP، وقياس إزاحة التخطيط قبل/بعد بدل الادعاء.
- **وظيفي**: التنقل، Quick Create، النماذج، الحوارات، الأوراق السفلية، الجداول، الفلاتر، ملاحة الجوال، عرض KPI، نموذج طلبات الصفحة العامة، نماذج المصادقة. `tsgo` و`ESLint` نظيفان.

## 10. المخاطر
- ضيق Tajawal قد يغيّر لفّ النص في السايدبار وعناوين الجداول → مقيس في القبول، والإصلاح تقديمي فقط.
- استوديو التصميم يستطيع تجاوز الخط لكل المنصة؛ يجب أن تبقى قيم fallback المعروضة فيه متوافقة مع النظام الجديد.
- تكرار `fonts.css` في مكانين: أي إغفال يُظهر خطاً مختلفاً في صفحات الطباعة → الملفان يُحدّثان في نفس الدفعة.

BACKEND CHANGE REQUIRED = NO

READY FOR MEHLA TAJAWAL + CAIRO TYPOGRAPHY BUILD