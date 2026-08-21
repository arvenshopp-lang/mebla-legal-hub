# مِهلة | MEHLA — خطة Phase B: حوكمة الفهرسة وظهور المنصة (نسخة مُصححة)

## التصحيحات المُدخلة على هذه النسخة
1. **بوابة GitHub**: لم تعد تشترط ظهور رابط GitHub كـ `git remote` محلي؛ الإثبات يعتمد على حالة Project Git Sync الرسمية وارتباط المشروع بالمستودع.
2. **Baseline إلزامي** قبل أي تعديل، مع تصنيف `PRE_EXISTING_BLOCKER` لأي فشل قديم وعدم إصلاحه.
3. **تسلسل robots.txt**: لا Disallow لأي مسار كان قابلاً للفهرسة (`/office/*`، `/login`، `/register`، `/track`) حتى تُقرأ noindex/410؛ الحظر النهائي خطوة لاحقة موثّقة.
4. **410 لا يُفترض**: يُفحص Loader ويُثبت بالاختبار؛ وإلا 404 مع تعديل معيار القبول.
5. **تطبيع مركزي للمسارات** قبل `isIndexablePath` (Query/Hash/trailing slash/حدود المسار) مع اختبارات.
6. **Stage B2 مُصحّح**: موافقة ← مراجعة PR ← Merge إلى `main` ← تسجيل Merge SHA ← Clean Build من نفس SHA ← نشر المطابق ← Migration ← تحقق حي.
7. **فصل Browser Testing**: Stage B1 آلي فقط؛ اختبار المتصفح والتحقق الحي في Stage B2.
8. **`/.well-known/*`** لا يُمنع جملةً قبل جرد المسارات الموجودة فعلاً وتصنيفها بلا تغيير وظيفي.
9. باقي القرارات والمحظورات كما هي حرفياً.

---

## 0. حالة المراجع الملزمة
- **Supabase Production = `xklzpjocsiadnoglwryw`** — ✅ مؤكد؛ هو المشروع المتصل فعلياً، ولم يُلمَس `pmiyheweosmbysywzqhw` ولا يوجد له أثر في الكود.
- **GitHub `arvenshopp-lang/mebla-legal-hub`** — ⏳ غير مُثبت بعد. آخر Commit محلي `7d35570` (2026-08-20 21:40 UTC) وشجرة العمل نظيفة. لا يُستنتج انقطاع Git Sync من كون الـremote داخلياً، لذلك يُفحص عبر حالة Git Sync الرسمية للمشروع.

---

## Stage B1 — كود + Migration غير مُطبقة + فحوص آلية + PR (يتوقف عند PR)

### B1.0 بوابة إيقاف — إثبات Git Sync
1. قراءة حالة **Project Git Sync** الرسمية وارتباط المشروع بالمستودع `arvenshopp-lang/mebla-legal-hub` (لا يُشترط ظهور remote خارجي محلياً).
2. إثبات صلاحية قراءة المستودع وإنشاء فرع جديد.
3. مقارنة آخر Commit المرتبط بالمستودع مع النسخة الحالية والتأكد من وجود Merge Base صحيح.
4. بعد التنفيذ: إثبات ظهور **Commit الفرع نفسه** في GitHub.

ممنوع Force Push / Reset / Clean / Overwrite / حذف تغييرات قائمة / Push إلى `main`. أي إثبات متعذر ⇒ `BLOCKED — GITHUB SYNC REQUIRED — NO CHANGES MADE` وتوقف بلا مسار بديل.

### B1.0.b Baseline إلزامي قبل أي تعديل
تشغيل Typecheck وLint وBuild والاختبارات القائمة **قبل** أي تغيير وتسجيل النتائج حرفياً. أي فشل قائم مسبقاً يُسجَّل `PRE_EXISTING_BLOCKER` ولا يُصلَح، وممنوع لمس ملفات الاشتراكات أو الدفع أو البريد لمعالجة فشل قديم. تُصلَح فقط الأخطاء الجديدة الناتجة عن تغييرات هذه المهمة، وتُقاس بالفرق عن الـBaseline.

### B1.1 Branch
`chore/indexing-governance-ai-discoverability` — كل العمل داخله فقط.

### B1.2 Allowlist مركزية — ملف جديد `src/config/indexing.ts`
مصدر الحقيقة الوحيد: `NOINDEX_BY_DEFAULT = true`، `INDEXABLE_PATHS`، `FORBIDDEN_PREFIXES`، ودالة `normalizePathname()` ودالة `isIndexablePath()`. لا تُكرَّر أي قائمة في ملف آخر، وأي مسار غير مُدرَج = noindex تلقائياً.

**التطبيع المركزي** قبل أي مقارنة: إسقاط Query String وHash، توحيد trailing slash (`/about/` ≡ `/about`)، توحيد حالة الأحرف، وفكّ الترميز بأمان. المطابقة على **حدود المسار** فقط، فلا يتطابق `/office-other` مع `/office`، ولا `/trackers` مع `/track`.

`INDEXABLE_PATHS` (الموجودة فعلاً فقط): `/`، `/about`، `/how-it-works`، `/pricing`، `/faq`، `/security`، `/docs`، `/contact`، `/privacy`، `/terms` (+ `/verify` وفق B1.6).

`FORBIDDEN_PREFIXES`: `/office`، `/portal`، `/track`، `/share`، `/sign`، `/upload`، `/invite`، `/api`، `/login`، `/register`، `/forgot-password`، `/reset-password`، `/onboarding`، `/pending-access`، `/auth`، `/_authenticated`، `/mehla-admin`، `/mcp`، `/.mcp`، `/lovable`.

**`/.well-known/*`**: يُجرَد أولاً ما هو موجود فعلاً (حالياً `oauth-protected-resource` المرتبط بمسار MCP، ومسارات Trust center المُدارة من المنصة). تُصنَّف الموجودة فقط، بلا منع شامل للبادئة وبلا أي تغيير وظيفي، ويُوثَّق التصنيف في مصفوفة المسارات.

اختبارات التطبيع الإلزامية: `/about` و`/about/` قابلة للفهرسة؛ `/about?x=1` تُطبَّع للأساس؛ صفحة نتيجة بـQuery Parameters تُعالَج وفق سياسة `/verify`؛ `/office-other` و`/trackers` لا يتطابقان خطأً؛ مسار جديد غير مصنَّف = noindex.

### B1.3 Meta لكل مسار ممنوع
إضافة `noindex,nofollow,nosnippet,noimageindex` في `head()` لكل مسار ممنوع يفتقدها أو يحمل صيغة أضعف، وحذف `canonical` من المسارات الممنوعة (login، register، forgot-password، reset-password، onboarding، pending-access، track). بلا تغيير في المكوّنات أو رحلة المستخدم.

### B1.4 HTTP Headers — `src/lib/security-headers.server.ts`
`X-Robots-Tag: noindex, nofollow, nosnippet, noimageindex` مشتقة من `isIndexablePath` وحدها، و`Cache-Control: private, no-store` + `Referrer-Policy: no-referrer` لمسارات التوكن (`/share`، `/sign`، `/upload`، `/invite`، `/api/public/doc`). بلا مساس بـ CSP أو HSTS أو باقي الترويسات.

### B1.5 صفحات المكاتب — `src/routes/office.$slug.tsx`
noindex دائم (منشورة أو لا)، حذف canonical الخاص بالمكتب، حذف JSON-LD `LegalService` بالكامل، وإزالة اسم/هاتف/بريد/عنوان المكتب من كل Metadata وOpen Graph. يُسمح بـ og عام باسم «مِهلة» فقط لمنع تعطل معاينة الرابط. **بلا تغيير وظيفي**: الرابط والصفحة ونموذج التواصل كما هي. لا QR ولا Apple Wallet.

`/office/mktb-salh` تبقى منشورة وعاملة بالرابط المباشر وغير قابلة للفهرسة؛ ممنوع حذفها أو أرشفتها أو تعديل بياناتها أو نموذجها.

### B1.6 `/verify`
يُفحص `src/routes/verify.tsx` أولاً. تبقى قابلة للفهرسة **فقط** إذا كانت الصفحة الأساسية خدمة عامة بلا أي بيانات مكتب/عميل/مستند، وأمكن فصل حالة النتيجة: canonical ذاتي للأساس فقط، وnoindex + `Cache-Control: private, no-store` لأي نتيجة أو Query Parameter أو Token، ولا نتائج في Sitemap ولا بيانات مشترك في Metadata/Schema. إذا تعذر الفصل الآمن ⇒ `/verify` بالكامل noindex ويُسجَّل في التقرير.

### B1.7 Sitemap — `src/routes/sitemap[.]xml.ts`
يُبنى من Allowlist وحدها. حذف صفحات المكاتب واستدعاء `listPublishedOfficeSlugs()` و`/login` و`/register` و`/track`. صفر URL ديناميكي تابع لمشترك.

### B1.8 `public/robots.txt` وزواحف AI — تسلسل صحيح
- **لا Disallow** لأي مسار كان قابلاً للفهرسة سابقاً: `/office/*`، `/login`، `/register`، `/track` تبقى **قابلة للزحف مؤقتاً** حتى يقرأ المحرك noindex أو 410 وتُحذف من Sitemap. Disallow ليس وسيلة إزالة.
- `User-agent: *`: Allow للصفحات الرسمية، وDisallow يبقى محصوراً بالمسارات التي لم تكن مفهرسة أصلاً ولا تحتاج قراءة noindex (مثل `/api`، `/mehla-admin`، `/_authenticated`).
- `OAI-SearchBot`: الصفحات الرسمية فقط، بلا حظر يعوق قراءة noindex على المسارات المفهرسة سابقاً.
- `GPTBot`: **منع كامل** (قرار معتمد).
- التسلسل: noindex/410 ← إخراج من Sitemap والروابط الداخلية ← تحقق من استجابة Production ← خطوات إزالة يدوية أسلّمها لك لـSearch Console وBing ← **ثم** Disallow النهائي كخطوة لاحقة موثّقة بعد تأكيد الإزالة. لا إجراء داخل حسابي Google أو Bing.

### B1.9 Schema للصفحات الرسمية
`Organization` + `WebSite` + `SoftwareApplication` في `__root.tsx`، `FAQPage` مطابقة حرفياً للأسئلة الظاهرة في `/faq`، `BreadcrumbList` للصفحات الفرعية الفعلية. بلا اسم قانوني أو سجل أو اعتماد أو سعر أو تقييم غير مُثبت، وبلا `LegalService` أو `ProfilePage` أو أي بيانات مشترك.

### B1.10 تصحيح المحتوى — `src/routes/index.tsx`
- حذف «حساب تلقائي لمدد المهل القضائية» (~493) و«مهلة نظامية تُحسب تلقائياً» (~696)، واستخدام الصياغة المعتمدة: «تتابع مِهلة تاريخ الاستحقاق بناءً على التاريخ والمدة اللذين يدخلهما المكتب، وتعرض التنبيهات وفق الإعدادات المحددة. ولا تحدد المنصة المدة النظامية نيابة عن المحامي.»
- حذف «بطاقة مالية مدمجة للأتعاب والمطالبات» (~485) بلا بديل ادعائي.
- إضافة «بيانات توضيحية افتراضية لا تمثل مكتباً أو عميلاً أو قضية حقيقية.» قرب واجهات العرض.
- بلا تعديل على التصميم أو الهوية أو ترتيب الأقسام إلا بالقدر اللازم لإضافة النص.

### B1.11 أرشفة QA — Migration تُنشأ ولا تُطبق + إثبات كود الحالة
تحقق مسبق: تأكيد `xklzpjocsiadnoglwryw`، قراءة أعمدة `office_public_pages` والقيم المسموحة في `status`، تأكيد وجود السجلات الثلاث بالضبط (`qa-f01-alpha`، `qa-plan2-20260809-mktb-b`، `qa-live-20260809-mktb-alrshyd-llmhamah-w`)، وتأكيد أن `mktb-salh` خارج نطاق التحديث. إن لم تكن `archived` قيمة مسموحة: تُستخدم آلية التعطيل القائمة إن وُجدت، وإلا `BLOCKED` بلا تعديل Schema وبلا قيمة مخترعة. أي اختلاف في العدد ⇒ توقف.

**410 لا يُفترض**: يُفحص Loader `office.$slug.tsx` و`loadPublishedOfficePage` فعلياً. إن كان السلوك الحالي `notFound()` (404):
- الخيار (أ) معالجة محدودة وآمنة تُرجع **410 Gone** للصفحات المؤرشفة فقط، دون تغيير سلوك الصفحات المنشورة أو المسودات، ودون كشف أي بيانات؛
- الخيار (ب) اعتماد **404** وتعديل معيار القبول إلى `qa-f01-alpha ⇒ 404 + noindex`.
يُعتمد الخيار بعد إثبات السلوك باختبار، وممنوع الادعاء بـ410 بلا إثبات.

Migration مُرقّمة في `supabase/migrations/` — **Data-only**: لا Schema، لا RLS، لا Auth، لا Storage، لا Functions، لا Triggers، لا Policies، لا Grants. لا Migration عكسية تُعيد نشر صفحات QA؛ الأرشفة نفسها هي وسيلة الاسترجاع. تُحفظ في GitHub ولا تُطبَّق في Stage B1.

### B1.12 Guardrails وفحوص آلية فقط
`scripts/indexing-guardrails.ts` يفشل عند: دخول Prefix ممنوع أو صفحة مكتب إلى Sitemap؛ غياب noindex عن مسار ممنوع؛ وجود `LegalService` أو Schema مشترك؛ ظهور اسم/هاتف/بريد مكتب في Metadata أو JSON-LD؛ Route جديد غير مصنَّف؛ فهرسة `login`/`register`/`track`؛ ظهور صفحة QA ضمن القابل للفهرسة؛ فشل أي حالة من حالات التطبيع في B1.2. يُضاف إلى CI القائمة (`.github/workflows/security.yml` + script في `package.json`) دون إعادة بناء CI.

يُنفَّذ في Stage B1: Typecheck، Lint، Build، الاختبارات القائمة، Guardrails الجديدة والقائمة (`security:check`)، فحص Sitemap المُصيَّر، فحص Headers، فحص HTML الخادمي، وفحص عدم وجود Secrets في الملفات المتتبعة. **بلا اختبار متصفح وبلا تحقق حي في هذه المرحلة.** أي Secret متتبَّع أو في التاريخ ⇒ `SECURITY_DECISION_REQUIRED` بلا كشف قيمة وبلا حذف تاريخ وبلا تدوير.

### B1.13 وثائق
`docs/SEO_INDEXING_POLICY.md`، `docs/AI_DISCOVERABILITY.md`، `docs/PUBLIC_PRIVATE_ROUTE_MATRIX.md`، `docs/EXIT_READINESS.md`، `docs/ENVIRONMENT_VARIABLES.md`، و`.env.example` (أسماء متغيرات فقط، بلا قيم، وبلا تغيير أسماء متغيرات Moyasar أو Resend). `EXIT_READINESS.md` يوضح صراحة أن ملفات تكامل **Moyasar وResend موجودة في GitHub وليست Lovable-only**؛ ولا يُصنَّف أي عنصر كتبعية Lovable-only بلا دليل Runtime مباشر. أي استخدام فعلي لـ `LOVABLE_API_KEY` يُوثَّق فقط (الملف، الوظيفة، الـEndpoint، الميزة المتأثرة) بلا تعديل. IndexNow وSearch Console خطوات مستقبلية موثّقة فقط.

### B1.14 Commit / Push / PR ثم توقف
Commit واضح ← Push للفرع ← فتح PR إن توفرت الصلاحية ← إثبات ظهور نفس Commit على GitHub. بلا Force Push وبلا Merge. ثم **توقف** وأسلّم تقرير Stage B1: Remote المؤكد، Branch، Commit SHA، رابط PR، الملفات المتغيرة، Baseline مقابل النتائج بعد التعديل، وأي `PRE_EXISTING_BLOCKER`.

---

## Stage B2 — الدمج والنشر والتحقق (بموافقة مستقلة بعد Stage B1)
1. نجاح CI ومراجعة PR ← **Merge إلى `main` بعد موافقتك فقط** ← تسجيل **Merge SHA**.
2. **Clean Build من Merge SHA نفسه** وإثبات نجاحه.
3. نشر النسخة المطابقة لذلك SHA عبر مسار النشر المعتاد للمشروع. ممنوع نشر نسخة غير مدمجة ثم اعتبار GitHub مصدر الحقيقة.
4. بعد نجاح نشر الكود: تطبيق Migration الأرشفة على `xklzpjocsiadnoglwryw` فقط، مع عدّ السجلات قبل/بعد وإثبات أن `mktb-salh` لم يُلمَس.
5. التحقق الحي واختبار المتصفح: Headers، Sitemap، `/office/qa-f01-alpha` (410 أو 404 وفق ما ثُبت)، `/office/mktb-salh` (يعمل + noindex)، `/track`، `/upload/$token`، `/share/$token`، `/sign/$token`، `/verify`، `/login`، `/register` — ببيانات اختبار فقط وبلا إرسال بريد أو دفع أو SMS أو WhatsApp حقيقي.
6. تسليم خطوات الإزالة اليدوية في Search Console وBing، ثم توثيق Disallow النهائي كخطوة لاحقة.
7. أي فشل تحقق ⇒ Revert للـPR بلا حذف بيانات. بلا فصل Lovable وبلا تغيير DNS.

---

## خارج النطاق (لا يُنفَّذ)
QR، Apple Wallet، IndexNow، إجراءات Search Console/Bing، صفحات SEO أو مدونة جديدة، Marketplace، دليل مكاتب، تغييرات تصميم واسعة، Moyasar، Resend، PostHog، البريد، الدفع، Schema/RLS/Auth/Storage، DNS، نقل الاستضافة، حذف Lovable Cloud، تغيير `LOVABLE_API_KEY`، تدوير Secrets، أي اختبار دفع أو إرسال حقيقي، وإصلاح أي فشل قديم خارج نطاق الفهرسة.

## معايير القبول
`SUBSCRIBER_INDEXABLE_ROUTES=0`، `PRIVATE_ROUTES_IN_SITEMAP=0`، `TEST_ROUTES_IN_PRODUCTION_INDEXABLE=0` (بحالة 410 أو 404 وفق ما ثُبت)، `SUBSCRIBER_DATA_IN_METADATA=0`، `SUBSCRIBER_SCHEMA_ENTITIES=0`، `CLAIM_CONTRADICTIONS=0`، `SCHEMA_VALIDATION_ERRORS=0`، `OFFICIAL_PAGES_WITH_UNIQUE_METADATA=100%`، `GITHUB_SOURCE_OF_TRUTH=PASS`، `CLEAN_BUILD_FROM_GITHUB=PASS` (من Merge SHA)، `SECRETS_COMMITTED=0`، `PRODUCTION_SUPABASE=xklzpjocsiadnoglwryw`، `MOYASAR_CHANGED=NO`، `RESEND_CHANGED=NO`، `QR_CREATED=NO`، `APPLE_WALLET_CREATED=NO`، `REAL_OFFICE_DATA_CHANGED=NO`، `RLS_CHANGED=NO`، `AUTH_CHANGED=NO`، `STORAGE_CHANGED=NO`.

STOP — PLAN UPDATE ONLY — NO CHANGES MADE
