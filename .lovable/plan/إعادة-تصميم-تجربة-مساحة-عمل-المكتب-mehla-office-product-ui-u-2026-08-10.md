# إعادة تصميم تجربة مساحة عمل المكتب (MEHLA Office Product UI/UX)

نطاق العمل: العرض والتفاعل فقط داخل `_authenticated`. لا تغيير في الباك إند، RLS، RBAC، الفواتير، KPI، أمن المستندات.
**BACKEND CHANGE REQUIRED = NO** لكل المناطق أدناه.

## 1) جرد المسارات الفعلية (18 ملفاً)
dashboard · cases.index · cases.$id · clients · tasks · deadlines · hearings · documents · search · team · team-performance · team-performance.$memberId · office-page · subscription · support · print-log · settings · route (البوابة).

## 2) القشرة الحالية
`src/components/dashboard/shell.tsx` (363 سطراً) يجمع: Sidebar يمين ثابت + مجموعات تنقل ثلاث + مبدّل مكتب + طيّ محفوظ في localStorage + Drawer جوال بعرض 280px + Topbar فيه العنوان وجرس الإشعارات + `SubscriptionAlert` + `PrintGuard`. لا يوجد Bottom Navigation، ولا Quick Create، ولا Breadcrumb.

## 3) نظام التوكنات الحالي (سليم ويُعاد استخدامه)
`src/styles.css`: توكنات oklch كاملة (primary/surface/border/text/success/warning/danger/info/gold)، سلالم radius وelevation وz-index وmotion، `@theme inline` لـ Tailwind v4، طبقة base عربية دقيقة، وأدوات نصية جاهزة (`text-page-title`, `text-section-title`, `text-stat`, `text-table`, `text-caption`, `surface-card`…). الخط IBM Plex Sans Arabic محلي.
**القرار: لا ننشئ نظام `--mehla-*` جديداً.** نضبط قيم التوكنات القائمة لتقارب الاتجاه البصري (أخضر أعمق + Sidebar داكن) ونضيف فقط توكنات القشرة الداكنة الناقصة عبر `--sidebar-*` الموجودة أصلاً.

## 4) مكونات مشتركة موجودة (`src/lib/list-utils.tsx` 673 سطراً)
Btn · IconBtn · PageHeader · SectionCard · PageToolbar · DataCard · Th/Td · Modal · FormField · inputCls · Badge · EmptyState · Skeleton/LoadingBlock/StatsSkeleton/SectionLoader/BusyOverlay · ErrorBlock · ConfirmDialog · Pagination · useDebounced. وshadcn كامل في `src/components/ui` (46 مكوناً) لكنه شبه غير مستخدم في صفحات المكتب.

## 5) التكرار وعدم الاتساق المرصود
- كل صفحة قائمة تكرر يدوياً: PageToolbar + جدول `<table>` + بطاقات جوال + Pagination بمنطق متطابق تقريباً (cases, clients, tasks, deadlines, hearings, documents, print-log).
- طبقتان متوازيتان: `list-utils` مقابل shadcn (dialog/sheet/table/select/badge) — تُوحَّد لصالح `list-utils` مع تبنّي `sheet.tsx` للجوال فقط.
- `Modal` واحد لكل السياقات، بدون Bottom Sheet حقيقي على الجوال.
- أحجام خطوط مباشرة (`text-[13.5px]`, `text-[28px]`) داخل القشرة بدل أدوات النص.
- `overflow-x-auto` مبثوث في الصفحات بدل عنصر جدول واحد.

## 6) يُستخدم كما هو
Btn · IconBtn · Badge · ConfirmDialog · Skeletons · ErrorBlock · useDebounced · Pagination (منطقها) · NotificationBell · PrintGuard · SubscriptionAlert · جميع hooks (`use-auth`, `use-subscription`, `use-mobile`).

## 7) يحتاج تحسين بصري
PageHeader · PageToolbar · SectionCard · DataCard · Th/Td · StatCard · Modal · FormField/inputCls · EmptyState.

## 8) يُدمج
جداول الصفحات السبع → `DataTable` واحد. بطاقات الجوال → `ResponsiveList`. مرشّحات الصفحات → `FilterBar` + `FilterSheet`. رؤوس التفاصيل → `DetailHeader`.

## 9-13) نظام التصميم المقترح
- **الألوان:** ضبط `--primary` إلى الأخضر الأعمق، `--gold` كلمسة، خلفية دافئة off-white، وSidebar داكن عبر `--sidebar`/`--sidebar-foreground`/`--sidebar-accent`. لا قيم hex في المكونات.
- **الطباعة:** استخدام إلزامي للأدوات القائمة: عنوان صفحة `text-page-title`، قسم `text-section-title`، بطاقة `text-h4`، نص `text-body-sm`، بيانات وصفية `text-caption`، جدول `text-table`، أرقام `text-stat` + `tabular-nums`، تسميات `text-label`.
- **المسافات:** سلّم موحد: حشو الصفحة 16/24، فجوة الأقسام 24، حشو البطاقة 16–20، فجوة الحقول 16، فجوة الشريط 8–12 — عبر أدوات مساحة موحدة لا قيم عشوائية.
- **الحدود والظلال:** `--radius-s/m/l` فقط + `--elevation-xs/s/m` فقط للأسطح، `overlay` للنوافذ.
- **الأيقونات:** lucide حصراً. 18px للسايدبار، 16px للأزرار والحقول، 14px لقوائم الإجراءات.

## 14-16) القشرة والتنقل
تفكيك `shell.tsx` إلى: `AppShell` · `Sidebar` · `MobileNav` · `Topbar` · `PageContainer`.
- **سطح المكتب:** سايدبار يمين داكن 264px، مجموعات مصغّرة العنوان، حالة نشطة بشريط ذهبي رقيق + خلفية شفافة، منطقة حساب أسفل. الطيّ الحالي محفوظ (72px).
- **Topbar:** هوية المكتب/مبدّل المكتب + بحث المستندات القائم فقط + إنشاء سريع يفتح نماذج قائمة فعلاً (قضية/عميل/مهمة/جلسة) بحسب الصلاحية + الإشعارات + حساب المستخدم. لا وظائف وهمية.
- **الجوال:** رأس مضغوط + Bottom Navigation بخمسة عناصر يومية (الرئيسية، القضايا، الجلسات، المهام، المزيد) و«المزيد» يفتح Sheet بباقي المسارات، مع safe-area وأهداف لمس ≥44px. RBAC يبقى مصدر إظهار العناصر.

## 17) الرئيسية (المرجع البصري) — RESTRUCTURE UI
تُعاد بنفس استعلامات `dashboard.tsx` الحالية دون أي بيانات مُختلقة: سياق ترحيبي + شريط KPI (قضايا مفتوحة، جلسات اليوم، مهل 7 أيام، مهام متأخرة) + لوحات: الجلسات القادمة، المهل النشطة، مهام تحتاج إجراء، وإضافة لوحة «آخر المستندات» و«ملخص أداء الفريق» للمالك/المدير فقط باستخدام Feature 02 القائم دون تغيير حساباته.

## 18-26) المعايير المشتركة
- **صفحة قائمة:** عنوان + سياق + إجراء رئيسي → شريط (بحث/مرشّحات/ترتيب) → جدول سطح مكتب أو بطاقات جوال → ترقيم.
- **الجدول:** رؤوس واضحة، تمرير داخلي للمنطقة فقط (لا تمرير أفقي للصفحة)، قصّ ذكي للنص العربي مع القيمة الكاملة عبر `title`، شارات حالة، قائمة إجراءات، Skeleton، حالة فراغ.
- **الجوال:** بطاقة صف مضغوطة (عنوان + حالة + تاريخ + إجراء) — لا جدول مضغوط.
- **التفاصيل:** DetailHeader (عنوان/حالة/بيانات/إجراءات) → ملخص → تبويبات للعلاقات القائمة فقط → سجل النشاط.
- **النماذج:** عمودان على سطح المكتب، عمود واحد على الجوال، تسميات مرتبطة، أخطاء عربية، أزرار ملتصقة في النماذج الطويلة.
- **المرشّحات:** Popover على سطح المكتب، Bottom Sheet على الجوال، شرائح للمرشّحات النشطة + «مسح الفلاتر».
- **الحالات:** Skeleton / فراغ / خطأ / غير مصرح / غير موجود — بلا أخطاء خام، وCTA يظهر فقط لمن يملك الصلاحية.
- **الحالة والأولوية:** توحيد الشارات من `src/lib/enums.ts` القائم، مع رمز/نص إلى جانب اللون.

## 27-36) الصفحات
RESTYLE + استخدام المعايير: clients · tasks · deadlines · hearings · documents · print-log · search.
RESTRUCTURE UI: dashboard · cases.index · cases.$id · settings (تصنيف أقسام + تنقل داخلي) · team.
RESTYLE فقط (منطق مغلق): team-performance و`$memberId` (بلا كؤوس أو تلعيب) · subscription · support · office-page (إدارة الصفحة العامة تورث القشرة والتبويبات؛ الصفحة العامة نفسها NO CHANGE).

## 37) وعي الأدوار
تخطيط واحد مع أقسام تظهر حسب `activeRole`: المالك/المدير يرى ملخص المكتب والفريق، المحامي يرى عمله المسند، القارئ يرى قراءة فقط بلا أزرار إنشاء.

## 38) التجاوب
320/390/430: عمود واحد + Bottom Nav + Sheets. 768: عمودان، سايدبار مخفي خلف زر. 1024: سايدبار مصغّر افتراضياً + جداول كاملة. 1280/1440+: سايدبار موسّع + حد أقصى 1400px. صفر تمرير أفقي على مستوى الصفحة.

## 39-40) الوصولية والأداء
عناوين هرمية صحيحة، تسميات مرتبطة، `focus-visible` القائم، تباين AA، ≥44px، حالة لا تعتمد اللون وحده، احترام reduced-motion. أداءً: لا مكتبات حركة أو رسوم جديدة، لا استعلامات إضافية، CSS فقط للحركات، تجزئة `shell.tsx` تخفض حجم الحزمة.

## 41) ملفات متوقّع تغيّرها
`src/styles.css` · `src/components/dashboard/shell.tsx` (تفكيك) · مكونات جديدة تحت `src/components/app/` (AppShell, Sidebar, MobileNav, Topbar, PageContainer, DataTable, ResponsiveList, FilterBar, DetailHeader, StatusBadge) · `src/lib/list-utils.tsx` (تحسين بصري) · صفحات `_authenticated/*` (عرض فقط).

## 42) ممنوع التغيير
كل `*.server.ts` و`*.functions.ts` · `src/lib/kpi/*` · `src/lib/billing/*` · `src/lib/rbac/*` · `src/lib/documents/*` · `src/integrations/supabase/*` · `src/routes/mehla-admin/*` · `src/components/office/public/*` · الصفحات التسويقية · أي Migration.

## 43) ترتيب التنفيذ الآمن
A توكنات وأدوات النص → B تفكيك القشرة والتنقل (سطح مكتب + جوال) → C الرئيسية كمرجع → D DataTable/FilterBar/Forms → E الصفحات اليومية → F صفحات التفاصيل → G الفريق والأداء → H الإعدادات والأسطح المساندة → I تلميع الجوال → J القبول البصري والوظيفي. نقطة تحقق بعد كل مرحلة.

## 44-45) القبول
لقطات Playwright عند 390/768/1024/1440 لكل سطح رئيسي + فحص تمرير أفقي عند 320/390/430/768/1024/1280/1440، ثم اختبار رحلات حقيقية ببيانات QA: إنشاء وتعديل عميل وقضية، مهمة (إنشاء/إكمال/إعادة فتح)، مهلة، جلسة، وصول ورفع مستند، صلاحيات الفريق، KPI، تنقل RBAC، مرشّحات وبحث وترقيم. مع Type Check وESLint وبناء إنتاجي.

## 46-47) المخاطر والعوائق
مخاطر: انحراف بصري بين الصفحات إذا نُفّذت قبل اكتمال المرحلة A؛ فقدان سلوك قائم أثناء تفكيك القشرة؛ تعارض «مظهر المنصة/CSS» مع القشرة الجديدة — يُعالج بحصر الحقن ضمن حدود آمنة دون لمس منطقه.
لا عوائق معمارية: البنية الحالية تدعم إعادة التصميم بلا أي تعديل خلفي.

READY FOR MEHLA PRODUCT UI/UX BUILD
