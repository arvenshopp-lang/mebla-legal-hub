# مِهلة | MEHLA — الخطة النهائية: حوكمة الفهرسة وظهور المنصة

## التصحيحات في هذه النسخة النهائية
1. **حدود المسؤولية**: مرحلة Lovable تُنفَّذ داخل بيئة Lovable ولا تتعطل بسبب عدم إثبات GitHub؛ النتيجة `LOVABLE_STAGE_COMPLETE — ANTIGRAVITY_HANDOFF_REQUIRED`.
2. **قرار الفهرسة يعتمد سياق الطلب الكامل** (pathname + searchParams + وجود Token/نتيجة + Override للمسارات الحساسة)، لا pathname وحده.
3. **`/verify`**: الأساس بلا Query ولا نتيجة هو وحده القابل للتقييم؛ أي Query/Token/نتيجة ⇒ noindex إلزامي + `private, no-store`، مع تطابق Meta وX-Robots-Tag.
4. **Case-sensitive افتراضياً** بلا lowercase إلا بإثبات سلوك الراوتر.
5. **حزمة تسليم إلى Google Antigravity** بدل تنفيذ Git/PR/نشر/Migration من Lovable.
6. باقي القرارات والمحظورات كما هي حرفياً.

---

## 0. المراجع
- **Supabase Production `xklzpjocsiadnoglwryw`** — مؤكد؛ `pmiyheweosmbysywzqhw` لا يُلمَس ولا أثر له في الكود.
- **GitHub `arvenshopp-lang/mebla-legal-hub`** — غير مُثبت من داخل البيئة، ولا يمنع تنفيذ مرحلة Lovable. لا ربط ولا فصل ولا إدارة لـGit Sync؛ إن كانت المزامنة تعمل تلقائياً تُترك كما هي.
- آخر Commit داخلي: `7d35570` (2026-08-20 21:40 UTC)، شجرة العمل نظيفة.

---

## Stage L — تنفيذ Lovable (يبدأ بعد موافقتك)

### L0 Baseline قبل أي تعديل
Typecheck + Lint + Build + الاختبارات القائمة، وتسجيل النتائج حرفياً. أي فشل قائم مسبقاً يُسجَّل `PRE_EXISTING_BLOCKER` ولا يُصلَح، وممنوع لمس ملفات الاشتراكات أو الدفع أو البريد لمعالجة فشل قديم. تُصلَح فقط الأخطاء الجديدة الناتجة عن هذه المهمة، وتُقاس بالفرق عن الـBaseline.

### L1 المصدر المركزي — ملف جديد `src/config/indexing.ts`
مصدر الحقيقة الوحيد. لا تُكرَّر أي قائمة في ملف آخر.
- `NOINDEX_BY_DEFAULT = true`.
- `INDEXABLE_PATHS` (الموجودة فعلاً فقط): `/`، `/about`، `/how-it-works`، `/pricing`، `/faq`، `/security`، `/docs`، `/contact`، `/privacy`، `/terms`، `/verify` (بشرط L4).
- `FORBIDDEN_PREFIXES`: `/office`، `/portal`، `/track`، `/share`، `/sign`، `/upload`، `/invite`، `/api`، `/login`، `/register`، `/forgot-password`، `/reset-password`، `/onboarding`، `/pending-access`، `/auth`، `/_authenticated`، `/mehla-admin`، `/mcp`، `/.mcp`، `/lovable`.
- `SENSITIVE_QUERY_OVERRIDE`: مسارات لا تُفهرَس إطلاقاً عند وجود Query/Token/نتيجة (حالياً `/verify`).
- **دالة قرار واحدة تأخذ سياق الطلب الكامل**: `indexingDecision({ pathname, searchParams, hasToken, hasResult })` تُرجع `{ indexable, robots, noStore }`. أي Query Parameter أو Token أو نتيجة على مسار حساس ⇒ `noindex,nofollow,nosnippet,noimageindex` + `Cache-Control: private, no-store`.
- **التطبيع**: إسقاط Hash، توحيد trailing slash (`/about/` ≡ `/about`)، فكّ ترميز آمن، ومطابقة على **حدود المسار** فقط فلا يتطابق `/office-other` مع `/office` ولا `/trackers` مع `/track`. **بلا lowercase**: المطابقة Case-sensitive افتراضياً، وأي صيغة غير مطابقة حرفياً (مثل `/ABOUT`) ⇒ noindex. يُستثنى ذلك فقط إذا أُثبت بالفحص أن الراوتر غير حساس لحالة الأحرف، ويُوثَّق الإثبات.
- **`/.well-known/*`**: جرد الموجود فعلاً أولاً (`oauth-protected-resource` المرتبط بمسار MCP، ومسارات Trust center المُدارة من المنصة)، وتصنيف الموجود فقط بلا منع شامل للبادئة وبلا أي تغيير وظيفي.

### L2 Meta لكل مسار ممنوع
`noindex,nofollow,nosnippet,noimageindex` في `head()` لكل مسار ممنوع يفتقدها أو يحمل صيغة أضعف، وحذف `canonical` من المسارات الممنوعة (login، register، forgot-password، reset-password، onboarding، pending-access، track). **Meta robots وX-Robots-Tag يجب أن تتطابقا في كل حالة**، وكلتاهما مشتقتان من نفس دالة القرار. بلا تغيير في المكوّنات أو رحلة المستخدم.

### L3 HTTP Headers — `src/lib/security-headers.server.ts`
`X-Robots-Tag` مشتقة من `indexingDecision` بسياق الطلب الكامل (pathname + Query)، لا من pathname بعد إسقاط Query. إضافة `Cache-Control: private, no-store` و`Referrer-Policy: no-referrer` لمسارات التوكن (`/share`، `/sign`، `/upload`، `/invite`، `/api/public/doc`) ولنتائج `/verify`. بلا مساس بـ CSP أو HSTS أو باقي الترويسات أو Auth أو Sessions.

### L4 `/verify`
الصفحة الأساسية (`/verify` بلا Query وبلا نتيجة) هي وحدها القابلة للفهرسة، بـcanonical ذاتي فقط. الصفحة تعمل بـ `ssr: false` وتقبل `?id=`، وتشغّل التحقق تلقائياً عند وجوده — لذلك أي `?id=` أو `?token=` أو `?document=` أو أي Query، وأي حالة نتيجة (ناجحة أو فاشلة)، تحصل إلزامياً على noindex الكامل + `private, no-store`، ولا تدخل Sitemap، ولا يظهر أي اسم مكتب أو رقم عقد أو بصمة في Metadata أو Schema أو canonical. إذا تعذر ضمان هذا الفصل بشكل مُثبت ⇒ `/verify` بالكامل noindex ويُسجَّل في التقرير.

### L5 صفحات المكاتب — `src/routes/office.$slug.tsx`
noindex دائم (منشورة أو لا)، حذف canonical الخاص بالمكتب، حذف JSON-LD `LegalService` بالكامل، وإزالة اسم/هاتف/بريد/عنوان المكتب من كل Metadata وOpen Graph. يُسمح بـ og عام باسم «مِهلة» فقط لمنع تعطل معاينة الرابط. **بلا تغيير وظيفي**: الرابط والصفحة ونموذج التواصل كما هي. لا QR ولا Apple Wallet. `/office/mktb-salh` تبقى منشورة وعاملة وغير قابلة للفهرسة؛ ممنوع حذفها أو أرشفتها أو تعديل بياناتها أو نموذجها.

### L6 Sitemap — `src/routes/sitemap[.]xml.ts`
يُبنى من Allowlist وحدها. حذف صفحات المكاتب واستدعاء `listPublishedOfficeSlugs()` و`/login` و`/register` و`/track`. صفر URL ديناميكي تابع لمشترك، وصفر Query Parameters.

### L7 `public/robots.txt` وزواحف AI — التسلسل المعتمد
- **لا Disallow** لأي مسار كان قابلاً للفهرسة سابقاً: `/office/*`، `/login`، `/register`، `/track` تبقى قابلة للزحف مؤقتاً حتى يقرأ المحرك noindex/410 وتُحذف من Sitemap.
- Disallow يبقى محصوراً بما لم يكن مفهرساً أصلاً ولا يحتاج قراءة noindex (`/api`، `/mehla-admin`، `/_authenticated`).
- `OAI-SearchBot`: الصفحات الرسمية فقط، بلا حظر يعوق قراءة noindex.
- `GPTBot`: **منع كامل**.
- الحظر النهائي للمسارات المفهرسة سابقاً يُوثَّق كخطوة لاحقة بعد تأكيد الإزالة. لا إجراء داخل حسابي Google أو Bing؛ تُسلَّم الخطوات اليدوية فقط.

### L8 Schema للصفحات الرسمية
`Organization` + `WebSite` + `SoftwareApplication` في `__root.tsx`، `FAQPage` مطابقة حرفياً للأسئلة الظاهرة في `/faq`، `BreadcrumbList` للصفحات الفرعية الفعلية. بلا اسم قانوني أو سجل أو اعتماد أو سعر أو تقييم غير مُثبت، وبلا `LegalService` أو `ProfilePage` أو أي بيانات مشترك.

### L9 تصحيح المحتوى — `src/routes/index.tsx`
حذف «حساب تلقائي لمدد المهل القضائية» (~493) و«مهلة نظامية تُحسب تلقائياً» (~696) واستخدام الصياغة المعتمدة: «تتابع مِهلة تاريخ الاستحقاق بناءً على التاريخ والمدة اللذين يدخلهما المكتب، وتعرض التنبيهات وفق الإعدادات المحددة. ولا تحدد المنصة المدة النظامية نيابة عن المحامي.» وحذف «بطاقة مالية مدمجة للأتعاب والمطالبات» (~485) بلا بديل ادعائي، وإضافة «بيانات توضيحية افتراضية لا تمثل مكتباً أو عميلاً أو قضية حقيقية.» قرب واجهات العرض. بلا تعديل تصميم أو هوية أو ترتيب أقسام إلا بالقدر اللازم للنص.

### L10 Migration أرشفة QA — ملف فقط، بلا تطبيق
تحقق قراءة فقط: تأكيد `xklzpjocsiadnoglwryw`، أعمدة `office_public_pages` والقيم المسموحة في `status`، وجود السجلات الثلاث بالضبط (`qa-f01-alpha`، `qa-plan2-20260809-mktb-b`، `qa-live-20260809-mktb-alrshyd-llmhamah-w`)، وأن `mktb-salh` خارج نطاق التحديث. إن لم تكن `archived` قيمة مسموحة: تُستخدم آلية التعطيل القائمة إن وُجدت، وإلا يُسجَّل `BLOCKED` لهذا البند بلا تعديل Schema وبلا قيمة مخترعة. أي اختلاف في العدد ⇒ توقف عند البند.

**410 لا يُفترض**: يُفحص Loader `office.$slug.tsx` و`loadPublishedOfficePage`، ويُثبت السلوك باختبار. إن كان الحالي 404: إما معالجة محدودة وآمنة تُرجع 410 للمؤرشف فقط بلا تغيير سلوك المنشور والمسودات وبلا كشف بيانات، أو اعتماد 404 وتعديل معيار القبول إلى `qa-f01-alpha ⇒ 404 + noindex`. لا ادعاء بـ410 بلا إثبات.

الملف يُنشأ مُرقّماً في `supabase/migrations/` — **Data-only** (لا Schema، لا RLS، لا Auth، لا Storage، لا Functions، لا Triggers، لا Policies، لا Grants)، بلا Migration عكسية تُعيد نشر صفحات QA، **ولا يُطبَّق في هذه المرحلة**.

### L11 Guardrails وفحوص آلية
`scripts/indexing-guardrails.ts` يفشل عند: Prefix ممنوع أو صفحة مكتب في Sitemap؛ غياب noindex عن مسار ممنوع؛ `LegalService` أو Schema مشترك؛ اسم/هاتف/بريد مكتب في Metadata أو JSON-LD؛ Route جديد غير مصنَّف؛ فهرسة `login`/`register`/`track`؛ صفحة QA ضمن القابل للفهرسة؛ **اختلاف Meta robots عن X-Robots-Tag**.

اختبارات إلزامية: `/verify`، `/verify?token=test`، `/verify?document=test`، `/verify?id=…` بنتيجة ناجحة وأخرى فاشلة، `/about` و`/about/` و`/ABOUT`، `/office-other`، `/trackers`، ومسار جديد غير مصنَّف. يُضاف إلى CI القائمة (`.github/workflows/security.yml` + script في `package.json`) دون إعادة بناء CI.

يُنفَّذ في Stage L: Typecheck، Lint، Build، الاختبارات القائمة، Guardrails الجديدة والقائمة (`security:check`)، فحص Sitemap المُصيَّر، فحص Headers، فحص HTML الخادمي، وفحص عدم وجود Secrets في الملفات المتتبعة. **بلا Browser Testing وبلا تحقق حي وبلا أي إرسال حقيقي.** أي Secret متتبَّع أو في التاريخ ⇒ `SECURITY_DECISION_REQUIRED` بلا كشف قيمة وبلا حذف تاريخ وبلا تدوير.

### L12 وثائق
`docs/SEO_INDEXING_POLICY.md`، `docs/AI_DISCOVERABILITY.md`، `docs/PUBLIC_PRIVATE_ROUTE_MATRIX.md`، `docs/EXIT_READINESS.md`، `docs/ENVIRONMENT_VARIABLES.md`، و`.env.example` (أسماء متغيرات فقط، بلا قيم، وبلا تغيير أسماء متغيرات Moyasar أو Resend). `EXIT_READINESS.md` يوضح صراحة أن ملفات تكامل **Moyasar وResend موجودة في المستودع وليست Lovable-only**، ولا يُصنَّف أي عنصر Lovable-only بلا دليل Runtime مباشر. أي استخدام فعلي لـ `LOVABLE_API_KEY` يُوثَّق فقط (الملف، الوظيفة، الـEndpoint، الميزة المتأثرة) بلا تعديل. IndexNow وSearch Console خطوات مستقبلية موثّقة فقط.

### ممنوع في Stage L
ربط أو فصل GitHub، إنشاء مستودع، Branch أو Commit أو Push أو Merge أو PR، تطبيق Migration، أي تعديل على Supabase Production، النشر، Browser Testing، وأي إرسال بريد أو دفع أو SMS أو WhatsApp حقيقي.

**مخرَج المرحلة**: `LOVABLE_STAGE_COMPLETE — ANTIGRAVITY_HANDOFF_REQUIRED`.

---

## Stage H — حزمة التسليم إلى Google Antigravity
تُقدَّم عند انتهاء Stage L وتشمل:
1. معرّف آخر نسخة/Commit داخلي في Lovable.
2. قائمة الملفات المنشأة والمعدلة.
3. Diff أو ملخص دقيق لكل تغيير.
4. مسار ملف Migration وChecksum إن أمكن.
5. نتائج Baseline قبل التعديل.
6. نتائج Typecheck وLint وBuild والاختبارات بعد التعديل.
7. الأخطاء المصنَّفة `PRE_EXISTING_BLOCKER`.
8. أي فحص تعذر تنفيذه داخل Lovable وسببه.
9. أوامر التحقق المقترحة لـGoogle Antigravity.
10. تأكيد صريح أن Production وSupabase وGitHub وDNS وMoyasar وResend وQR وApple Wallet **لم تُلمَس**.

ثم يتولى Google Antigravity: Branch وCommit وPush وPR وCI، فحص Secrets، بناء النسخة من SHA الفعلي، وبعد موافقة مستقلة: الدمج والنشر وتطبيق Migration على `xklzpjocsiadnoglwryw` والتحقق الحي.

---

## خارج النطاق
QR، Apple Wallet، IndexNow، إجراءات Search Console/Bing، صفحات SEO أو مدونة جديدة، Marketplace، دليل مكاتب، تغييرات تصميم واسعة، Moyasar، Resend، PostHog، البريد، الدفع، Schema/RLS/Auth/Storage، DNS، نقل الاستضافة، حذف Lovable Cloud، تغيير `LOVABLE_API_KEY`، تدوير Secrets، وإصلاح أي فشل قديم خارج نطاق الفهرسة.

## معايير القبول
`SUBSCRIBER_INDEXABLE_ROUTES=0`، `PRIVATE_ROUTES_IN_SITEMAP=0`، `TEST_ROUTES_IN_PRODUCTION_INDEXABLE=0` (410 أو 404 وفق ما يُثبت)، `SUBSCRIBER_DATA_IN_METADATA=0`، `SUBSCRIBER_SCHEMA_ENTITIES=0`، `CLAIM_CONTRADICTIONS=0`، `SCHEMA_VALIDATION_ERRORS=0`، `OFFICIAL_PAGES_WITH_UNIQUE_METADATA=100%`، `META_ROBOTS_MATCHES_HEADER=100%`، `SECRETS_COMMITTED=0`، `PRODUCTION_SUPABASE=xklzpjocsiadnoglwryw`، `MOYASAR_CHANGED=NO`، `RESEND_CHANGED=NO`، `QR_CREATED=NO`، `APPLE_WALLET_CREATED=NO`، `REAL_OFFICE_DATA_CHANGED=NO`، `RLS_CHANGED=NO`، `AUTH_CHANGED=NO`، `STORAGE_CHANGED=NO`. (`GITHUB_SOURCE_OF_TRUTH` و`CLEAN_BUILD_FROM_GITHUB` يثبتهما Google Antigravity في Stage H.)

STOP — FINAL PLAN UPDATE ONLY — NO CHANGES MADE
