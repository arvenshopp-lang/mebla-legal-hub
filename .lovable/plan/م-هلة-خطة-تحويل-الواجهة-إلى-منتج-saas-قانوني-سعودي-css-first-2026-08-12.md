# مِهلة — خطة تحويل الواجهة إلى منتج SaaS قانوني سعودي (CSS-first)

تخطيط فقط. لا تعديل ملفات، لا Backend، لا Supabase، لا Routing، لا منطق.

## 1) Executive Summary

**الحالة الفعلية:** الأساس أقوى مما يبدو. `src/styles.css` (563 سطراً) يحتوي نظام توكنات كامل بـ oklch (primary أخضر عميق، nav داكن، ألوان دلالية، gold، سلالم radius/elevation/z/motion) مع `@theme inline` لـ Tailwind v4، وخطوط Tajawal/Cairo محلية في `src/styles/fonts.css`، وطبقة base عربية دقيقة (منع قص الهمزات، tabular-nums، focus-visible، reduced-motion). المكونات المشتركة موجودة: `src/lib/list-utils.tsx` (714 سطراً: Btn/PageHeader/SectionCard/PageToolbar/Modal/FormField/Badge/EmptyState/Skeletons/ErrorBlock/Pagination)، `src/components/data/data-view.tsx` (جدول Desktop + بطاقات Mobile حقيقية)، قشرة المكتب مفكّكة في `src/components/app/` (app-shell, workspace-sidebar, workspace-topbar, workspace-mobile-nav)، وقشرة الإدارة `src/components/admin/shell.tsx` (Breadcrumb + SectionTabs + Command Palette).

**المشكلات البصرية الرئيسية (مقيسة، لا انطباعية):**
1. **انحراف الطباعة:** 644 استخدام لأحجام خطوط عشوائية `text-[NNpx]` داخل الصفحات، بينما أدوات النص الرسمية (`text-page-title`, `text-section-title`, `text-table`, `text-caption`, `text-label`, `text-stat`) شبه معطلة الاستخدام. دليل: `src/routes/_authenticated/dashboard.tsx:185,190,221,257,260`.
2. **لوحة التحكم أرقام لا أولويات:** `dashboard.tsx` يبدأ بأربع StatCards متساوية الوزن (سطر 137) ثم بطاقات متشابهة بلا تسلسل «ما يحتاج إجراء الآن».
3. **كثافة الإدارة غير مُروَّضة:** 28+ ملفاً يعتمد `overflow-x-auto` كحل وحيد للجداول (أعلاها `mehla-admin/security.tsx` بخمس مرات) بدل نمط جدول موحّد برأس مثبّت وحدود هادئة.
4. **طبقتان بصريتان متوازيتان:** `list-utils` مقابل `components/ui` (shadcn) داخل الأسطح الإدارية.
5. **`transition-all`** في 8 مواضع (منها `_authenticated/documents.tsx` و`components/ui/*`).
6. **قيم لونية مباشرة** في 15 موضعاً خارج التوكنات (`mehla-admin/integrations.tsx`, `admin/mail/compose-modal.tsx`, `office/public/*`).
7. **ملفات صفحات ضخمة تكرّر التنسيق يدوياً:** `cases.$id.tsx` 879، `cases.index.tsx` 811، `mehla-admin/design.tsx` 980، `mehla-admin/mail.tsx` 929.

**الاتجاه المقترح:** لا هوية جديدة. توحيد صارم للتوكنات القائمة + طبقة أدوات CSS واحدة («شريط المِهلة»، سلّم كثافة، نمط جدول، لغة استحقاق) واستبدال القيم العشوائية بأدوات النص. الفكرة الحاكمة: **الوقت هو المحرك البصري** — الاستحقاق يُقرأ قبل الرقم.

**الأثر المتوقع:** اتساق بصري كامل بلا مخاطر وظيفية، تقليص القيم العشوائية من 644 إلى ~0، ولغة واحدة للحالة والاستحقاق عبر 18 صفحة مكتب و37 صفحة إدارة.

## 2) Current UI Audit

| الصفحة/المكوّن | المشكلة | الدليل | أثر UX | أولوية | CSS-only |
|---|---|---|---|---|---|
| كل صفحات المكتب/الإدارة | 644 حجم خط عشوائي | `rg "text-\[[0-9]+px\]" src` | تشوّش هرمي | Critical | نعم (تبديل classes) |
| dashboard | لا أولوية «يحتاج إجراء» | `dashboard.tsx:137-269` | تفويت المهل | Critical | جزئي |
| جداول الإدارة | overflow-x-auto كحل وحيد ×28 | `mehla-admin/security.tsx` (5) | تمرير داخلي مُربك | High | نعم |
| list-utils مقابل shadcn | طبقتان للأزرار/الحوارات | `components/ui/*` + `list-utils.tsx` | اختلاف مظهر | High | نعم |
| المستندات | كثافة إجراءات الصف | `documents.tsx` (519 سطراً) | ضغط خطأ | High | نعم |
| 15 موضعاً | قيم لونية مباشرة | `integrations.tsx`, `compose-modal.tsx` | خروج عن الهوية | High | نعم |
| ui/* + documents | `transition-all` ×8 | `rg transition-all src` | حركة بلا فائدة | Medium | نعم |
| SectionCard/PageHeader | حشو ثابت p-5/mb-6 بلا سلّم كثافة | `list-utils.tsx:90-120` | هدر مساحة على الجوال | Medium | نعم |
| Badge | الحالة تعتمد اللون أساساً | `list-utils.tsx:606` | ضعف وصولية | High | نعم (رمز عبر `::before`) |
| cases.$id | 879 سطراً بلا فصل بصري للأقسام | الملف | تشتت | Medium | نعم |

## 3) Design System Plan

- **Color:** التوكنات الحالية تبقى بقيمها. يُمنع أي لون خارج `--primary/--nav/--success/--warning/--danger/--info/--gold`. الذهبي محصور في: مؤشر التنقل النشط، شريط المِهلة الحرج، شارة الباقة.
- **Typography:** فرض `text-page-title / text-section-title / text-h4 / text-body / text-body-sm / text-table / text-caption / text-label / text-stat` — Cairo للعناوين والأرقام البارزة، Tajawal للباقي. لا تغيير خطوط.
- **Spacing:** سلّم واحد 4/8/12/16/20/24/32 عبر أداتين `density-comfortable` و`density-compact` تضبطان حشو البطاقة وارتفاع الصف.
- **Radius/Border/Elevation:** `--radius-s/m/l` فقط؛ الأسطح `--elevation-xs/s`؛ الطبقات العائمة `--elevation-overlay`. لا ظلال ثقيلة ولا زوايا > 12px داخل اللوحات.
- **Icons:** lucide حصراً — 18px سايدبار، 16px أزرار وحقول، 14px إجراءات الصف.
- **Status/Due language (لا لون وحده):** أداة `status-chip` بنقطة + نص + رمز، وأداة `due-flag` بحالات: متأخر (danger + خط سفلي مزدوج)، اليوم (gold)، ≤3 أيام (warning)، ≤7 أيام (info)، منجز (success + ✓)، ملغي (muted + شطب خفيف)، بلا مسؤول/بلا تاريخ (`border-dashed` + نص «غير محدد»).
- **«شريط المِهلة»:** أداة CSS واحدة `mehla-timeline` — خط رقيق بعُقد دقيقة وتعبئة تقدّم زمنية بلون دلالي، ولمسة هندسية نجدية خفيفة عبر `grid-lines` القائمة كخلفية باهتة فقط.
- **Table:** `table-mehla` (رأس sticky، حدود صف hairline، `text-align: start`، قصّ ذكي مع `title` للقيمة الكاملة)، مع `data-view` كمالك وحيد لتحويل الجدول إلى بطاقات.
- **Modal/Drawer:** Bottom Sheet على الجوال بـ safe-area، ومركزي على Desktop بظل overlay.
- **States:** Skeleton يطابق شكل النهائي، Empty بإجراء مصرّح فقط، Error برسالة عربية + خطوة تالية، Disabled بسبب واضح، Permission-denied سطح مستقل لا فراغ.
- **Focus:** يبقى `focus-visible` الحالي (outline 2px primary)؛ يُمنع `outline: none`.

## 4) Page-by-Page Plan

1. **الموقع العام** (`index, about, how-it-works, security, faq, contact, privacy, terms, track, office.$slug`): إيقاع أقسام واحد عبر `section-y` + `container-page`، Hero بلا رموز قانونية نمطية، «شريط المِهلة» كعنصر توضيحي، وبقاء `data-surface="office-public"` معزولاً كما هو. Desktop: شبكة 12؛ Mobile: عمود واحد + CTA ثابت آمن. مخاطر منخفضة. CSS-only.
2. **Auth/Onboarding** (`login, register, forgot/reset-password, auth.verified, pending-access, invite.$token, onboarding`): توحيد بطاقة AuthShell، ترتيب Google أعلى كما هو، رسائل `role="alert"` بلا تغيير. لا لمس لمنطق المصادقة. CSS-only.
3. **قشرة المكتب** (`components/app/*`): سايدبار داكن بمجموعات مصغّرة العنوان ومؤشر ذهبي رقيق، حالة مصغّرة 76px، Topbar بعنوان + إجراء رئيسي + إنشاء سريع + إشعارات، Bottom Nav بخمسة عناصر و«المزيد» Sheet مع safe-area و≥44px. CSS-only عدا Tooltips (خارج النطاق).
4. **لوحة التحكم** (`dashboard.tsx`): الترتيب البصري المستهدف: يحتاج إجراء → برنامج اليوم → مؤشرات مختصرة (StatCards أخفّ وزناً) → الجلسات والمهل → قضايا تحتاج متابعة → مهام الفريق → مستندات حديثة. **CSS-only يغطي** الوزن والحجم والترتيب داخل الشبكة عبر `order-*` وسلّم StatCard. **خارج نطاق CSS:** إعادة ترتيب DOM فعلياً أو إضافة قسم جديد.
5. **القضايا** (`cases.index.tsx`, `cases.$id.tsx`): Toolbar بشرائح فلاتر نشطة، `table-mehla`، بطاقات جوال عبر DataView، شارات حالة/أولوية جديدة، رأس تفاصيل بصري وأقسام مفصولة وشريط المِهلة للجلسات والمهل. لا تغيير حقول أو تدفقات.
6. **الجلسات/المهل/المهام** (`hearings, deadlines, tasks`): لغة `due-flag` الموحّدة وتجميع بصري «اليوم/هذا الأسبوع/لاحقاً» عبر أنماط الصف فقط.
7. **المستندات** (`documents, search, upload.*, share.$token`): عمود اسم الملف مسيطر + صف ميتا ثانوي، إجراء أساسي ظاهر والثانوية في قائمة، بطاقات جوال بلا تمرير أفقي للصفحة.
8. **الفريق/الأداء/الإعدادات/الاشتراك/الفواتير/الدعم/سجل الطباعة/الصفحة العامة:** تطبيق المعايير المشتركة وحالات صلاحية واضحة، وبلا كؤوس أو تلعيب في صفحات الأداء.
9. **لوحة مالك المنصة** (37 مساراً): تبقى منفصلة بصرياً (كثافة أعلى عبر `density-compact`، تباين قشرة مختلف عن مساحة المكتب)، Attention Inbox قبل المؤشرات في `mehla-admin/index.tsx`، تشديد بصري لـ Breadcrumbs وSectionTabs القائمة، جداول موحّدة، Drawers للتفاصيل، تمييز العمليات الحساسة بحد danger، ولافتة صريحة بأن بيانات القضايا القانونية غير متاحة للإدارة.

## 5) Shared Components Plan (مرتبة حسب اعتماد الصفحات)

1. `src/styles.css` — أدوات: `status-chip`, `due-flag`, `mehla-timeline`, `table-mehla`, `density-*`, `sheet-mobile`.
2. `src/lib/list-utils.tsx` — تحسين بصري فقط لـ Btn/PageHeader/SectionCard/PageToolbar/Modal/FormField/Badge/EmptyState/ErrorBlock/Skeletons/Pagination.
3. `src/components/data/data-view.tsx` — نمط جدول/بطاقة واحد لسبع صفحات مكتب.
4. `src/components/app/*` — قشرة المكتب.
5. `src/components/admin/shell.tsx` + `section-tabs.tsx` — قشرة الإدارة.
6. `src/components/dashboard/shell.tsx` (StatCard).

## 6) Implementation Phases

| المرحلة | الهدف | الملفات المتوقعة | المخاطر | شرط القبول | الرجوع |
|---|---|---|---|---|---|
| 0 | Baseline: لقطات 375/390/430/768/1024/1440 وجرد overflow | قراءة فقط | لا | مرجع مقارنة كامل | — |
| 1 | التوكنات والأساس وأدوات الحالة | `src/styles.css` | تأثير عام | صفر تغيير وظيفي + بناء ناجح | ملف واحد |
| 2 | القشرة والتنقل | `components/app/*`, `admin/shell.tsx` | فقدان سلوك الطيّ | الطيّ وBottom Nav وRBAC كما هي | ملفات محدودة |
| 3 | النماذج والحالات المشتركة | `list-utils.tsx`, `data-view.tsx` | انحدار واسع | كل الصفحات تُعرض بلا كسر | ملفان |
| 4 | لوحة المكتب | `dashboard.tsx`, `dashboard/shell.tsx` | منخفضة | أولوية بصرية واضحة | ملف |
| 5 | القضايا والعملاء | `cases.*`, `clients.tsx` | كثافة | جدول/بطاقة سليمة | لكل ملف |
| 6 | الجلسات والمهل والمهام | 3 ملفات | لغة الاستحقاق | الحالات مميزة بلا لون وحده | لكل ملف |
| 7 | المستندات ورفع العميل | `documents, search, upload.*, share.*` | إجراءات الصف | صفر تمرير أفقي للصفحة | لكل ملف |
| 8 | الفريق والاشتراك والدعم والإعدادات | 7 ملفات | حالات الصلاحية | حالات مصرّح/غير مصرّح واضحة | لكل ملف |
| 9 | لوحة مالك المنصة | 37 مساراً + `components/admin/*` | حجم النطاق | كثافة منظمة + Breadcrumbs | على مجموعات |
| 10 | الجوال والوصولية والانحدار البصري | تلميع | لا | كل معايير القسم 7 | — |

## 7) Validation Plan

Playwright: لقطات Before/After عند 375/390/430/768/1024/1440 لكل سطح رئيسي؛ فحص `scrollWidth > clientWidth` على مستوى الصفحة؛ تنقل لوحة مفاتيح كامل مع Focus مرئي؛ تباين AA للنص والشارات؛ نص عربي طويل (200 حرف) في العنوان والجدول والبطاقة؛ حالات Loading/Empty/Error/Success/Disabled/Permission-denied لكل نمط صفحة؛ صفر أخطاء Console؛ Regression وظيفي على رحلات القضية والمهمة والمهلة والمستند ببيانات QA فقط؛ Type Check وESLint وبناء إنتاجي.

## 8) CSS-only Boundary Report

| التحسين | CSS-only | يحتاج markup؟ | يمس logic؟ | القرار |
|---|---|---|---|---|
| توحيد الطباعة (644 قيمة) | نعم | تبديل class فقط | لا | مصرّح لاحقاً |
| التوكنات وأدوات الحالة والاستحقاق | نعم | لا | لا | مصرّح لاحقاً |
| نمط الجدول وسلّم الكثافة | نعم | لا | لا | مصرّح لاحقاً |
| إزالة `transition-all` والقيم اللونية | نعم | لا | لا | مصرّح لاحقاً |
| شارة حالة برمز إضافي | نعم (`::before`) | لا | لا | مصرّح لاحقاً |
| شريط المِهلة كعنصر بصري | نعم داخل حاويات قائمة | لا | لا | مصرّح لاحقاً |
| إعادة ترتيب أقسام لوحة التحكم | جزئي (`order-*`) | نعم للترتيب الفعلي | لا | الجزء غير الـCSS: OUT OF SCOPE |
| Bottom Sheet حقيقي لكل النوافذ | لا | نعم | لا | OUT OF SCOPE |
| Tooltips للسايدبار المصغّر | لا | نعم | لا | OUT OF SCOPE |
| Attention Inbox جديد في الإدارة | لا | نعم | نعم (استعلام) | OUT OF SCOPE |
| أي تغيير حقول/تدفق/صلاحية/Backend | لا | — | نعم | OUT OF SCOPE |

## 9) Recommended Execution Order

1 (التوكنات) → 3 (المكونات المشتركة) → 2 (القشرة) → 4 (لوحة المكتب) → 6 (لغة الاستحقاق) → 5 (القضايا) → 7 (المستندات) → 8 (الأسطح المساندة) → 9 (لوحة المنصة) → 10 (الجوال والوصولية والانحدار البصري)، مع المرحلة 0 قبل كل شيء ونقطة تحقق بعد كل مرحلة.

توقف: بانتظار موافقتك الصريحة على المرحلة الأولى.