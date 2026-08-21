# تقرير المرحلة A — حوكمة الفهرسة وظهور مِهلة (Read-only)

## 1. تأكيد المشروع والمراجع
- المشروع: مِهلة | MEHLA — Lovable ID `0ac4f813-8ba3-4f48-9bc7-432613df3dae`.
- Supabase Production المتصل فعلياً بالمشروع: `xklzpjocsiadnoglwryw` — **مؤكد**. لم يُلمَس `pmiyheweosmbysywzqhw` ولا يوجد له أي أثر في الكود.
- `SUPABASE_CHANGE`: مطلوب فقط لبيانات اختبار (بند 5)، لا Schema ولا RLS.

## 2. GitHub SHA مقابل Production SHA — تعذّر الإثبات
- الـ remote الوحيد في بيئة العمل هو مستودع Lovable الداخلي (`git.private.lovable-gcp…` + مرآة S3). لا يوجد remote باسم `arvenshopp-lang/mebla-legal-hub` يمكن قراءته من هنا.
- آخر Commit محلي: `7d35570` — "Added legacy file binding" (2026-08-20 21:40 UTC)، شجرة العمل نظيفة، والفرع الحالي فرع تحرير مؤقت.
- المحاولة السابقة لقراءة المستودع عبر موصل GitHub API أعادت 404 وقائمة مستودعات فارغة (الرمز بلا صلاحية مستودع).
- النتيجة: `GITHUB_SOURCE_OF_TRUTH = BLOCKED` حتى تُفعّل مزامنة Git Sync أو يُمنح الموصل صلاحية قراءة المستودع. لا يمكنني كذلك حساب Production SHA أو تنفيذ Clean Build من نسخة GitHub قبل ذلك.
- ملاحظة: `supabase/migrations/` موجود ومحدَّث (153 ملفاً). `supabase/functions/` **غير موجود** — لا Edge Functions؛ كل منطق الخادم في `src/routes/api/*` و`*.functions.ts` داخل الكود، وهذا في صالح قابلية النقل.

## 3. تصنيف المسارات (من الكود الفعلي)
A — مسموح بالفهرسة (11): `/`، `/about`، `/how-it-works`، `/pricing`، `/faq`، `/security`، `/docs`، `/contact`، `/privacy`، `/terms`، `/verify`.

B — عامة وظيفياً وممنوعة من الفهرسة: `/office/$slug`، `/portal/$slug`، `/track`، `/share/$token`، `/sign/$token`، `/upload`، `/upload/$token`، `/invite/$token`، `/api/public/*`.

C — خاصة/إدارية: `/login`، `/register`، `/forgot-password`، `/reset-password`، `/onboarding`، `/pending-access`، `/auth/*`، كل `/_authenticated/*` (dashboard، clients، cases، hearings، deadlines، tasks، documents، team، settings، subscription، support، contracts، bayan، print-log، office-page، search، team-performance)، كل `/mehla-admin/*` (45 مساراً)، `/mcp`، `/.mcp/*`، `/.well-known/*`، `/lovable/*`.

## 4. المشاكل المكتشفة (بدليل)
| # | Severity | الدليل |
|---|---|---|
| 1 | **Critical** | `src/routes/office.$slug.tsx` يضع `noindex` **فقط** في حالة عدم توفر البيانات (سطر 17). الصفحة المنشورة تُصدر `canonical` + `og:*` + JSON-LD `LegalService` بالكامل → صفحات المكاتب قابلة للفهرسة فعلياً، وتحمل اسم المكتب وهاتفه وبريده وعنوانه في Metadata وSchema. مخالِف مباشر للقرار النهائي. |
| 2 | **Critical** | `src/routes/sitemap[.]xml.ts` يضيف كل صفحة مكتب منشورة عبر `listPublishedOfficeSlugs()`، ويضيف كذلك `/login`، `/register`، `/track` (وهي ممنوعة). |
| 3 | **Critical** | `office_public_pages` في Production يحتوي صفحة اختبار منشورة: `slug = qa-f01-alpha` (منشورة 2026-08-09، غير موقوفة) — وهي التي ظهرت في محركات البحث. توجد كذلك مسودات QA: `qa-plan2-20260809-mktb-b`، `qa-live-20260809-mktb-alrshyd-llmhamah-w` (غير منشورة، فلا تُفهرَس اليوم لكنها قابلة للنشر بالخطأ). صفحة حقيقية واحدة منشورة: `mktb-salh`. |
| 4 | High | لا يوجد ترويسة `X-Robots-Tag` للمسارات العامة الممنوعة. `applySecurityHeaders` في `src/lib/security-headers.server.ts` تضعها للملفات الثنائية فقط. |
| 5 | High | لا توجد Allowlist مركزية للفهرسة؛ السلوك الافتراضي «مسموح» — أي Route جديد يصبح قابلاً للفهرسة تلقائياً. لا يوجد اختبار CI يمنع تسرّب مسار خاص إلى Sitemap. |
| 6 | Medium | `public/robots.txt` قائمة حظر جزئية بأسلوب Blacklist: لا تشمل `/mehla-admin`، `/office`، `/portal`، `/track`، `/share`، `/sign`، `/invite`، `/login`، `/register`، `/api`، ولا أي سياسة لزواحف الذكاء الاصطناعي (OAI-SearchBot / GPTBot). |
| 7 | Medium | صفحات مسموحة تُصدر canonical لكن لا توجد Schema موحّدة على مستوى الموقع (Organization / SoftwareApplication / WebSite / BreadcrumbList)، وFAQPage غير مؤكدة الوجود على `/faq`. |
| 8 | Low | صفحات خاصة (login/register/onboarding/pending-access/forgot-password/reset-password) تحمل `canonical` — لا ضرر أمني، لكنه يعزّز فهرستها ويجب حذفه مع noindex. |

## 5. تعارضات المحتوى والادعاءات
- `src/routes/index.tsx:493` يعِد بـ **«حساب تلقائي لمدد المهل القضائية»**، و`:696` «مهلة نظامية تُحسب تلقائياً»، بينما `src/content/faq.ts:21-23` ينص صراحة على أن المنصة **لا** تحدد المهلة نظاماً. تعارض صريح يجب توحيده.
- `src/routes/index.tsx:485` يذكر «بطاقة مالية مدمجة للأتعاب والمطالبات» — وحدة الأتعاب والمطالبات **محذوفة** من المنصة. ميزة معلنة غير موجودة.
- لم أجد في الصفحات الرسمية أي ادعاء امتثال NCA/PDPL أو عبارة «مستوى مصرفي» — سليم؛ نصوص `/security` وصفية وقابلة للإثبات.

## 6. نواقص SEO / AEO / GEO
موجود: عناوين ووصف وcanonical لكل صفحة رسمية، خط محلي، robots + sitemap، محتوى مُصيَّر من الخادم (SSR).
ناقص: Allowlist، X-Robots-Tag، Schema سيتية موحّدة، BreadcrumbList، إفصاح «بيانات توضيحية افتراضية» على واجهات العرض في الصفحة الرئيسية، سياسة زواحف AI، IndexNow، اسم المراجع وتاريخ آخر مراجعة للمحتوى الحساس (`/security`، `/privacy`، `/terms`)، وثائق التشغيل والخروج، واختبارات CI للفهرسة.

## 7. خطة التنفيذ بعد الموافقة (Phase B)
1. `src/config/indexing.ts` — مصدر حقيقة واحد: `NOINDEX_BY_DEFAULT = true`، `INDEXABLE_PATHS` (المسارات الـ11 فقط)، `FORBIDDEN_PREFIXES`.
2. حقن `noindex,nofollow,nosnippet,noimageindex` في `head()` لكل مسار غير مُدرَج (تعديل موضعي لكل ملف مسار ممنوع يفتقدها)، وحذف `canonical` من الصفحات الممنوعة.
3. `src/lib/security-headers.server.ts` — إضافة `X-Robots-Tag` تُحسب من نفس Allowlist لكل استجابة، مع `Cache-Control: private, no-store` و`Referrer-Policy: no-referrer` لمسارات التوكن.
4. `src/routes/sitemap[.]xml.ts` — يُبنى من Allowlist فقط؛ حذف صفحات المكاتب و`/login` و`/register` و`/track`، وإزالة استدعاء `listPublishedOfficeSlugs` من خريطة الموقع.
5. `src/routes/office.$slug.tsx` — noindex دائم، حذف canonical وog:*، وحذف JSON-LD `LegalService` بالكامل. الوظيفة (الرابط/QR/النموذج) تبقى كما هي بلا تغيير سلوكي.
6. `public/robots.txt` — Allow للصفحات الرسمية، Disallow لكل Prefix خاص، وقسم مستقل لـ OAI-SearchBot. **GPTBot يبقى بانتظار قرارك.** لن نمنع Crawl عن `/office/*` مباشرة حتى تُقرأ الـ noindex/410 (بند 12).
7. Schema للصفحات الرسمية فقط: Organization + WebSite + SoftwareApplication في `__root.tsx`، FAQPage على `/faq`، BreadcrumbList على الصفحات الفرعية.
8. توحيد نص المهل في `index.tsx` إلى الصياغة الدقيقة التي اعتمدتها، وحذف ادعاء «الأتعاب والمطالبات»، وإضافة إفصاح «بيانات توضيحية افتراضية…» أسفل واجهات العرض.
9. اختبارات: `scripts/indexing-guardrails.ts` يفشل عند دخول Prefix ممنوع إلى Sitemap، أو غياب noindex عن مسار ممنوع، أو ظهور Schema مكتب مشترك، أو مسار جديد غير مصنَّف.
10. وثائق: `docs/SEO_INDEXING_POLICY.md`، `docs/AI_DISCOVERABILITY.md`، `docs/PUBLIC_PRIVATE_ROUTE_MATRIX.md`، `docs/EXIT_READINESS.md`، `docs/ENVIRONMENT_VARIABLES.md`، وتحديث `.env.example` (أسماء فقط).

## 8. Supabase — مطلوب جزئياً
`SUPABASE_CHANGE: REQUIRED (data-only)` — Migration مُرقّمة تُحوّل صفحات QA الثلاث إلى `status='archived'` (أو حذفها) دون لمس `mktb-salh` ولا أي Schema/RLS/Auth/Storage. تُحفظ في `supabase/migrations/` وتُعتمد منك قبل التطبيق. سيرجع `/office/qa-f01-alpha` بعدها **410 Gone** ليُسقطه المحرك من الفهرس.

## 9. الحفظ في GitHub
فرع `chore/indexing-governance-ai-discoverability` عبر PR، بلا لمس `main` وبلا أي Secret. **هذا محجوب حالياً** — يلزم تفعيل Git Sync إلى `arvenshopp-lang/mebla-legal-hub` (قائمة `+` ← GitHub ← Connect project) لأتمكن من إثبات Commit SHA وقائمة الملفات وClean Build.

## 10. مخاطر الانتقال من Lovable
- لا Edge Functions ولا `supabase/functions/` → لا منطق خادمي خارج المستودع. جيد.
- تبعيات مرتبطة بـ Lovable يجب توثيقها لا حذفها: مسارات `src/routes/lovable/*`، `src/integrations/lovable/`، بوابة الموصلات (PostHog/Resend/Moyasar) عبر `LOVABLE_API_KEY`، وقيم `VITE_SUPABASE_*`.
- خطر عالٍ حالي: `.env` يحتوي أسراراً حقيقية (Resend, Moyasar Live) ويجب أن يبقى خارج التتبع؛ سيتحقق من ذلك اختبار الأسرار.

## 11. الاختبارات وRollback
اختبارات: guardrails الفهرسة + Sitemap + Headers، `tsgo`، Lint، Build، وفحص يدوي لرحلة `/track` و`/upload/$token` و`/share/$token` و`/office/mktb-salh` للتأكد أن الوظيفة لم تتأثر.
Rollback: كل التغيير في ملفات كود قابلة للعكس بـ Revert للـ PR؛ Migration بيانات QA لها Migration معاكسة تعيد `status='published'` عند الحاجة؛ لا تغيير مدمّر على أي بيانات مكتب حقيقي.

## 12. قرارات تحتاج موافقتك
1. **GPTBot**: سماح (استخدام المحتوى في التدريب) أم منع؟ — `DECISION_REQUIRED`.
2. **صفحة المكتب الحقيقية `mktb-salh`**: سيتم إخراجها من الفهرسة كلياً حسب القرار النهائي — تأكيد مطلوب لأنها صفحة مشترك حقيقي منشورة.
3. **صفحات QA**: أرشفة (استرجاعية) أم حذف نهائي من Production؟
4. **`/verify`**: تبقى قابلة للفهرسة كصفحة رسمية للتحقق من المستندات؟
5. **Git Sync**: تفعيله الآن حتى يكون GitHub مصدر الحقيقة فعلاً.

## النتيجة النهائية
`FIX_REQUIRED` + `DECISION_REQUIRED` + `BLOCKED` (على شق GitHub وحده).
- SUBSCRIBER_INDEXABLE_ROUTES = 2 (`/office/mktb-salh`, `/office/qa-f01-alpha`) — يجب أن تصير 0
- PRIVATE_ROUTES_IN_SITEMAP = 5 (صفحتا مكتب + login + register + track)
- TEST_ROUTES_IN_PRODUCTION_INDEX = 1
- SUBSCRIBER_DATA_IN_METADATA / SCHEMA_ENTITIES > 0
- CLAIM_CONTRADICTIONS = 2
- PRODUCTION_SUPABASE_CONFIRMED = xklzpjocsiadnoglwryw

STOP — NO CHANGES MADE
