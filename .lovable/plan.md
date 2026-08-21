# مِهلة | MEHLA — خطة Phase B: حوكمة الفهرسة وظهور المنصة

## 0. حالة المراجع الملزمة (تحقق فعلي)
- **Supabase Production = `xklzpjocsiadnoglwryw`** — ✅ مؤكد؛ هو المشروع المتصل فعلياً بالمشروع، ولم يُلمَس `pmiyheweosmbysywzqhw` ولا يوجد له أثر في الكود.
- **GitHub `arvenshopp-lang/mebla-legal-hub`** — ❌ غير مُثبت. الـ remote الوحيد المتاح في بيئة العمل هو مستودع Lovable الداخلي (`git.private.lovable-gcp…` ومرآة S3). لا يوجد remote يشير إلى المستودع، والمحاولة السابقة عبر موصل GitHub API أعادت 404 وقائمة مستودعات فارغة.
- آخر Commit محلي: `7d35570` "Added legacy file binding" (2026-08-20 21:40 UTC)، وشجرة العمل نظيفة.

**النتيجة الحالية: BLOCKED — GITHUB SYNC REQUIRED — NO CHANGES MADE.**

بحسب أمرك، لا يبدأ أي تعديل ملف قبل اجتياز بوابة GitHub. المطلوب منك خطوة واحدة: قائمة **(+)** في مربع المحادثة ← **GitHub** ← **Connect project** ← حساب `arvenshopp-lang` ← المستودع `mebla-legal-hub`. بمجرد ظهور "Connected" أعيد فحص البوابة (وجود remote، صلاحية إنشاء Branch، Merge Base صحيح) وأبدأ Stage B1 فقط عند نجاحها الكامل. لا مسار بديل، ولا حفظ داخلي بلا إثبات في GitHub.

---

## Stage B1 — تعديل الكود + Migration غير مُطبقة + اختبارات + PR (يتوقف عند PR)

### B1.0 بوابة إيقاف
فحص remote المستودع، صلاحية Push لفرع جديد، ومقارنة آخر Commit في GitHub مع النسخة الحالية والتأكد من Merge Base. ممنوع Force Push / Reset / Clean / Overwrite / Push إلى `main`. أي فشل ⇒ `BLOCKED — GITHUB SYNC REQUIRED — NO CHANGES MADE` وتوقف.

### B1.1 Branch
`chore/indexing-governance-ai-discoverability` — كل العمل داخله فقط.

### B1.2 Allowlist مركزية — ملف جديد `src/config/indexing.ts`
مصدر الحقيقة الوحيد: `NOINDEX_BY_DEFAULT = true`، `INDEXABLE_PATHS`، `FORBIDDEN_PREFIXES`، ودالة واحدة `isIndexablePath(pathname)`. أي مسار غير مُدرَج = noindex تلقائياً. لا تُكرَّر أي قائمة في ملف آخر.

`INDEXABLE_PATHS` (الصفحات الرسمية الموجودة فعلاً فقط): `/`، `/about`، `/how-it-works`، `/pricing`، `/faq`، `/security`، `/docs`، `/contact`، `/privacy`، `/terms` (+ `/verify` وفق B1.6).

`FORBIDDEN_PREFIXES`: `/office`، `/portal`، `/track`، `/share`، `/sign`، `/upload`، `/invite`، `/api`، `/login`، `/register`، `/forgot-password`، `/reset-password`، `/onboarding`، `/pending-access`، `/auth`، `/_authenticated`، `/mehla-admin`، `/mcp`، `/.mcp`، `/lovable`، `/.well-known`.

### B1.3 Meta لكل مسار ممنوع
إضافة `noindex,nofollow,nosnippet,noimageindex` في `head()` لكل مسار ممنوع يفتقدها أو يحمل صيغة أضعف، وحذف `canonical` من المسارات الممنوعة (login، register، forgot-password، reset-password، onboarding، pending-access، track). لا تغيير في المكوّنات أو رحلة المستخدم.

### B1.4 HTTP Headers — `src/lib/security-headers.server.ts`
إضافة `X-Robots-Tag: noindex, nofollow, nosnippet, noimageindex` مشتقة من `isIndexablePath` وحدها، و`Cache-Control: private, no-store` + `Referrer-Policy: no-referrer` لمسارات التوكن (`/share`، `/sign`، `/upload`، `/invite`، `/api/public/doc`). بلا أي مساس بـ CSP أو HSTS أو باقي الترويسات.

### B1.5 صفحات المكاتب — `src/routes/office.$slug.tsx`
noindex دائم (منشورة أو لا)، حذف canonical الخاص بالمكتب، حذف JSON-LD `LegalService` بالكامل، وإزالة اسم/هاتف/بريد/عنوان المكتب من كل Metadata وOpen Graph. يُسمح بـ og عام باسم «مِهلة» فقط لمنع تعطل معاينة الرابط. **لا تغيير وظيفي**: الرابط والصفحة ونموذج التواصل كما هي. لا QR ولا Apple Wallet.

`/office/mktb-salh` تبقى منشورة وعاملة بالرابط المباشر وغير قابلة للفهرسة؛ ممنوع حذفها أو أرشفتها أو تعديل بياناتها أو نموذجها.

### B1.6 `/verify`
سيتم فحص `src/routes/verify.tsx` أولاً. تبقى قابلة للفهرسة **فقط** إذا كانت الصفحة الأساسية خدمة عامة بلا أي بيانات مكتب/عميل/مستند، وأمكن فصل حالة النتيجة: canonical ذاتي للصفحة الأساسية فقط، وnoindex + `Cache-Control: private, no-store` لأي نتيجة أو Query Parameter أو Token، ولا نتائج في Sitemap ولا بيانات مشترك في Metadata/Schema. إذا تعذر الفصل الآمن ⇒ `/verify` بالكامل noindex ويُسجَّل ذلك في التقرير بدل حل غير مؤكد.

### B1.7 Sitemap — `src/routes/sitemap[.]xml.ts`
يُبنى من Allowlist وحدها. حذف صفحات المكاتب واستدعاء `listPublishedOfficeSlugs()` و`/login` و`/register` و`/track`. صفر URL ديناميكي تابع لمشترك.

### B1.8 `public/robots.txt` وزواحف AI
- `User-agent: *` — Allow للصفحات الرسمية، Disallow لكل Prefix ممنوع، **باستثناء `/office/`** الذي يبقى قابلاً للزحف مؤقتاً حتى يقرأ المحرك noindex/410 (ترتيب الإزالة).
- `OAI-SearchBot` — الصفحات الرسمية فقط.
- `GPTBot` — **منع كامل** (قرار معتمد).
- ترتيب الإزالة: noindex/410 ← إخراج من Sitemap والروابط الداخلية ← تحقق من استجابة Production ← تسليمك خطوات الإزالة اليدوية في Search Console وBing. لا يُنفَّذ أي إجراء داخل حسابي Google أو Bing.

### B1.9 Schema للصفحات الرسمية
`Organization` + `WebSite` + `SoftwareApplication` في `__root.tsx`، `FAQPage` مطابقة حرفياً للأسئلة الظاهرة في `/faq`، `BreadcrumbList` للصفحات الفرعية الفعلية. بلا اسم قانوني أو سجل أو اعتماد أو سعر أو تقييم غير مُثبت، وبلا `LegalService` أو `ProfilePage` أو أي بيانات مشترك.

### B1.10 تصحيح المحتوى — `src/routes/index.tsx`
- حذف «حساب تلقائي لمدد المهل القضائية» (سطر ~493) و«مهلة نظامية تُحسب تلقائياً» (سطر ~696)، واستخدام الصياغة المعتمدة: «تتابع مِهلة تاريخ الاستحقاق بناءً على التاريخ والمدة اللذين يدخلهما المكتب، وتعرض التنبيهات وفق الإعدادات المحددة. ولا تحدد المنصة المدة النظامية نيابة عن المحامي.»
- حذف «بطاقة مالية مدمجة للأتعاب والمطالبات» (سطر ~485) بلا بديل ادعائي.
- إضافة «بيانات توضيحية افتراضية لا تمثل مكتباً أو عميلاً أو قضية حقيقية.» قرب واجهات العرض.
- لا تعديل على التصميم أو الهوية أو ترتيب الأقسام إلا بالقدر اللازم لإضافة النص.

### B1.11 Migration أرشفة QA — تُنشأ ولا تُطبق
تحقق مسبق إلزامي: تأكيد `xklzpjocsiadnoglwryw`، قراءة أسماء أعمدة `office_public_pages` والقيم المسموحة في `status`، تأكيد وجود السجلات الثلاث بالضبط (`qa-f01-alpha`، `qa-plan2-20260809-mktb-b`، `qa-live-20260809-mktb-alrshyd-llmhamah-w`)، وتأكيد أن `mktb-salh` خارج نطاق التحديث. إن لم تكن `archived` قيمة مسموحة: تُستخدم آلية التعطيل القائمة إن وُجدت، وإلا `BLOCKED` بلا تعديل Schema وبلا قيمة مخترعة. أي اختلاف في عدد السجلات المستهدفة ⇒ توقف.

Migration مُرقّمة في `supabase/migrations/` — **Data-only**: لا Schema، لا RLS، لا Auth، لا Storage، لا Functions، لا Triggers، لا Policies، لا Grants. لا Migration عكسية تُعيد نشر صفحات QA. تُحفظ في GitHub ولا تُطبَّق في Stage B1.

### B1.12 Guardrails واختبارات
ملف جديد `scripts/indexing-guardrails.ts` يفشل عند: دخول Prefix ممنوع أو صفحة مكتب إلى Sitemap؛ غياب noindex عن مسار ممنوع؛ وجود `LegalService` أو Schema مشترك؛ ظهور اسم/هاتف/بريد مكتب في Metadata أو JSON-LD؛ ظهور Route جديد غير مصنَّف؛ فهرسة `login`/`register`/`track`؛ ظهور صفحة QA ضمن القابل للفهرسة. يُضاف إلى CI القائمة (`.github/workflows/security.yml` + script في `package.json`) دون إعادة بناء CI.

يُنفَّذ: Typecheck، Lint، Build، الاختبارات القائمة، Guardrails الجديدة والقائمة (`security:check`)، فحص Sitemap المُصيَّر، فحص Headers، فحص HTML الخادمي، وفحص عدم وجود Secrets في الملفات المتتبعة. أي Secret متتبَّع أو في التاريخ ⇒ `SECURITY_DECISION_REQUIRED` بلا كشف قيمة وبلا حذف تاريخ وبلا تدوير.

### B1.13 اختبارات عدم الانحدار (بيانات اختبار فقط، بلا إرسال حقيقي)
`/office/mktb-salh`، `/track`، `/upload/$token`، `/share/$token`، `/sign/$token`، `/verify`، `/login`، `/register` تعمل جميعها وnoindex وفق السياسة؛ المسارات المحمية بلا تغيير؛ بلا أثر على البريد أو الدفع أو التنبيهات أو الصلاحيات أو RLS أو بيانات المكتب الحقيقي. لا بريد ولا دفع ولا SMS ولا واتساب حقيقي.

### B1.14 وثائق
`docs/SEO_INDEXING_POLICY.md`، `docs/AI_DISCOVERABILITY.md`، `docs/PUBLIC_PRIVATE_ROUTE_MATRIX.md`، `docs/EXIT_READINESS.md`، `docs/ENVIRONMENT_VARIABLES.md`، و`.env.example` (أسماء متغيرات فقط، بلا قيم، وبلا تغيير أسماء متغيرات Moyasar أو Resend). `EXIT_READINESS.md` يوضح صراحة أن ملفات تكامل **Moyasar وResend موجودة في GitHub وليست ميزات Lovable-only**؛ ولا يُصنَّف أي عنصر كتبعية Lovable-only بلا دليل Runtime مباشر. أي استخدام فعلي لـ `LOVABLE_API_KEY` يُوثَّق فقط (الملف، الوظيفة، الـEndpoint، الميزة المتأثرة) بلا تعديل. IndexNow وSearch Console يُذكران كخطوات مستقبلية فقط.

### B1.15 Commit / Push / PR
Commit واضح ← Push للفرع ← فتح PR إن توفرت الصلاحية. بلا Force Push وبلا Merge إلى `main`. لا يُعتبر العمل محفوظاً قبل إثبات وجود الـCommit على GitHub Remote. ثم **توقف** وأسلّم تقرير Stage B1 (Remote، Branch، SHA، PR، الملفات المتغيرة، نتائج كل فحص).

---

## Stage B2 — التطبيق على Production (لا يبدأ إلا بموافقة مستقلة منك بعد Stage B1)
1. إثبات أن Migration محفوظة فعلاً على GitHub.
2. نشر تغييرات الكود عبر مسار النشر المعتاد للمشروع أولاً (حتى يكون مسار 410 جاهزاً).
3. تطبيق Migration الأرشفة على `xklzpjocsiadnoglwryw` فقط، مع عدّ السجلات قبل/بعد وإثبات أن `mktb-salh` لم يُلمَس.
4. تحقق حي على Production: Headers وSitemap و`/office/qa-f01-alpha` (410) و`/office/mktb-salh` (يعمل + noindex) و`/verify`.
5. تسليم خطوات الإزالة اليدوية في Search Console وBing.
6. أي فشل تحقق ⇒ Revert للـPR بلا حذف بيانات. بلا فصل Lovable وبلا تغيير DNS.

---

## خارج النطاق (لا يُنفَّذ)
QR، Apple Wallet، IndexNow، إجراءات Search Console/Bing، صفحات SEO أو مدونة جديدة، Marketplace، دليل مكاتب، تغييرات تصميم واسعة، Moyasar، Resend، PostHog، البريد، الدفع، Schema/RLS/Auth/Storage، DNS، نقل الاستضافة، حذف Lovable Cloud، تغيير `LOVABLE_API_KEY`، تدوير Secrets، أي اختبار دفع أو إرسال حقيقي.

## معايير القبول التي ستُثبت بالأدلة
`SUBSCRIBER_INDEXABLE_ROUTES=0`، `PRIVATE_ROUTES_IN_SITEMAP=0`، `TEST_ROUTES_IN_PRODUCTION_INDEXABLE=0`، `SUBSCRIBER_DATA_IN_METADATA=0`، `SUBSCRIBER_SCHEMA_ENTITIES=0`، `CLAIM_CONTRADICTIONS=0`، `SCHEMA_VALIDATION_ERRORS=0`، `OFFICIAL_PAGES_WITH_UNIQUE_METADATA=100%`، `GITHUB_SOURCE_OF_TRUTH=PASS`، `CLEAN_BUILD_FROM_GITHUB=PASS`، `SECRETS_COMMITTED=0`، `PRODUCTION_SUPABASE=xklzpjocsiadnoglwryw`، `MOYASAR_CHANGED=NO`، `RESEND_CHANGED=NO`، `QR_CREATED=NO`، `APPLE_WALLET_CREATED=NO`، `REAL_OFFICE_DATA_CHANGED=NO`، `RLS_CHANGED=NO`، `AUTH_CHANGED=NO`، `STORAGE_CHANGED=NO`.

## التصنيف الحالي
`BLOCKED` — بانتظار تفعيل Git Sync إلى `arvenshopp-lang/mebla-legal-hub`. `PRODUCTION_SUPABASE` مؤكد.

STOP — NO CHANGES MADE
