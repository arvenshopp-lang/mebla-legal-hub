# حوكمة الفهرسة والظهور في محركات البحث وإجابات الذكاء الاصطناعي — حزمة التسليم

المشروع: مِهلة | MEHLA — `mehlalex.com`
المرحلة: **Stage L (تنفيذ داخل Lovable) — منجزة**، ويتبقى **Stage H (تسليم وتطبيق خارجي)**.
مرجع القاعدة الإنتاجية: `xklzpjocsiadnoglwryw`.

---

## 1. الخط الأساسي (Baseline) قبل التعديل

| فحص | النتيجة قبل التعديل | التصنيف |
| --- | --- | --- |
| `npx tsgo --noEmit` | ناجح | — |
| `bun run build` | ناجح | — |
| `bun run security:check` | ناجح (لا مخالفات) | — |
| `bun run lint` (ESLint) | فاشل: `TypeError: expand is not a function` داخل `minimatch` | `PRE_EXISTING_BLOCKER` |

الفشل في ESLint سابق لهذا العمل وسببه اعتماد مكسور في `minimatch` لا علاقة له بحوكمة الفهرسة،
ولم يُلمس ضمن هذا النطاق.

## 2. ما نُفِّذ فعلياً

### 2.1 مصدر واحد للحقيقة
- `src/config/indexing.ts` (جديد): قائمة الصفحات الرسمية `INDEXABLE_PATHS` (10 صفحات)،
  البادئات الممنوعة، مسارات بلا تخزين/بلا إحالة، وتطبيع المسار، ودالة القرار الوحيدة
  `indexingDecision` التي تأخذ **سياق الطلب الكامل** (المسار + Query Parameters + وجود توكن أو نتيجة).
- القاعدة الافتراضية: **كل مسار غير مُدرج صريحاً = noindex**، فأي Route جديد لا يظهر
  في محركات البحث حتى يُضاف يدوياً.

### 2.2 تطابق Meta مع الترويسة
- `src/lib/security-headers.server.ts`: `X-Robots-Tag` تُشتق من `indexingDecision` نفسها
  على كل استجابة، مع `Cache-Control: private, no-store` و`Referrer-Policy: no-referrer`
  لمسارات التوكنات والتحقق. `/robots.txt` و`/sitemap.xml` مستثنيان من وسم noindex.
- كل صفحة ممنوعة تستخدم `NOINDEX_META` المستوردة من الملف المركزي (64 ملف Route وُحِّد،
  ولم يبقَ أي وسم robots مكتوب يدوياً في المشروع).
- حُذفت `canonical` و`og:*` و`twitter:card` من كل الصفحات الممنوعة حتى لا توجد إشارات متضاربة.

### 2.3 صفحات المكاتب `/office/$slug`
- لم تبق تنشر أي بيانات مشترك: أُزيلت `title` الديناميكية والوصف و`og:*` و`canonical`
  وSchema.org `LegalService` (كانت تنشر اسم المكتب وهاتفه وبريده وعنوانه).
- العنوان أصبح محايداً: «صفحة مكتب — مِهلة» + `noindex, nofollow, nosnippet, noimageindex`.
- وظيفة الصفحة لمن يملك الرابط لم تتغير.

### 2.4 خريطة الموقع
- `src/routes/sitemap[.]xml.ts`: تُفلتَر آلياً بـ `isIndexablePath`، وحُذفت منها
  `/track` و`/login` و`/register` وكل صفحات المكاتب.
- النتيجة: 10 روابط رسمية فقط.

### 2.5 robots.txt
- `/office` و`/track` و`/verify` **تُركت قابلة للزحف عن قصد** حتى تقرأ الزواحف
  `noindex` و`404` وتُسقط ما هو مفهرس اليوم. تُضاف `Disallow` لها لاحقاً بعد اختفائها من الفهرس.
- منع صريح لجامعي بيانات تدريب الذكاء الاصطناعي: `GPTBot`, `Google-Extended`, `CCBot`,
  `ClaudeBot`, `anthropic-ai`, `Applebot-Extended`, `Bytespider`, `meta-externalagent`.
- سماح صريح لمحرك بحث ChatGPT: `OAI-SearchBot` (الصفحات الرسمية فقط، والباقي محكوم بـ noindex).

### 2.6 تصحيح المحتوى (صدق الميزات)
- الصفحة الرئيسية: حُذف كل ما يعِد بوحدة الأتعاب والمطالبات المالية (المحذوفة فعلياً من
  المنصة لعدم اكتمال توافق زاتكا): بطاقة «أتعاب محصلة»، قائمة «أحدث مطالبات الأتعاب»،
  ميزة «عروض الأسعار ومطالبات الأتعاب»، وذِكر «الأتعاب» في العنوان الرئيسي والوصف.
  حلّت مكانها وحدة **العقود الرقمية والتوقيع الإلكتروني** الموجودة فعلاً (بصمة SHA-256،
  رقم تحقق، رمز QR، صفحة تحقق عامة).
- أُزيل ادعاء «حساب تلقائي لمدد المهل القضائية» المتعارض مع الإجابة الصريحة في الأسئلة
  الشائعة، واستُبدل بالوصف الصحيح: تاريخ الانتهاء يُحسب من تاريخ البداية والمدة التي
  يُدخلها المكتب، وتحديد المهلة نظاماً مسؤولية المحامي المختص.

### 2.7 حارس دائم
- `scripts/indexing-guardrails.ts` + `bun run seo:check` (ومضاف إلى `security:all`):
  يفشل البناء إذا ظهر Route ممنوع بلا `NOINDEX_META`، أو وسم robots يدوي، أو `canonical`
  أو `og:url` على مسار ممنوع، أو مسار في القائمة الرسمية بلا Route فعلي.

## 3. أدلة التحقق (بيئة التشغيل الفعلية)

| المسار | HTTP | `X-Robots-Tag` | Meta robots داخل الصفحة | Cache-Control |
| --- | --- | --- | --- | --- |
| `/` `/about` `/pricing` `/faq` `/docs` | 200 | (غير موجودة = مسموح) | (لا شيء) | افتراضي |
| `/verify` | 200 | noindex, nofollow, nosnippet, noimageindex, noarchive | مطابق | private, no-store |
| `/verify?id=MHL-TEST-12345` | 200 | مطابق | مطابق | private, no-store |
| `/office/mktb-salh` | 200 | مطابق | مطابق | افتراضي |
| `/office/nope-xyz` | **404** | مطابق | مطابق | افتراضي |
| `/track` `/register` `/portal/x` | 200 | مطابق | مطابق | — |
| `/share/abc` | 200 | مطابق | مطابق | private, no-store |
| `/sitemap.xml` `/robots.txt` | 200 | (غير موجودة عن قصد) | — | كما هي |

فحص تسريب بيانات المشترك في `/office/mktb-salh`: العنوان «صفحة مكتب — مِهلة» فقط،
ولا `og:url` ولا `canonical` ولا `application/ld+json`.

### ملاحظة مهمة: 410 مقابل 404
قيد المخطط الحالي `office_pages_status_check` يسمح فقط بـ `draft | published | unpublished`،
ولا توجد حالة `archived`، وسلوك `loadPublishedOfficePage` الحالي يُنتج **404** لأي صفحة
غير منشورة (مثبت أعلاه على `/office/nope-xyz`). لذلك اعتُمد الخيار المسموح في الخطة:
**404 + noindex** بدل 410، دون تغيير المخطط ودون اختراع حالة جديدة. لا يوجد أي ادعاء بـ410.

## 4. Stage H — ما يُطبَّق خارج Lovable

1. دمج الفرع، ثم بناء نظيف من Merge SHA، ثم النشر.
2. تطبيق `migration-archive-qa-office-pages.sql` (في هذا المجلد) على القاعدة الإنتاجية:
   يُخرج صفحات الاختبار الثلاث `qa-f01-alpha`, `qa-live-20260809-mktb-alrshyd-llmhamah-w`,
   `qa-plan2-20260809-mktb-b` من الفضاء العام عبر `status = 'unpublished'` وتفريغ اللقطة المنشورة.
   العملية قابلة للعكس ولا تحذف بيانات ولا سجلات تدقيق.
3. بعد النشر: التحقق من `https://mehlalex.com/robots.txt` و`/sitemap.xml`،
   ثم طلب إزالة الروابط القديمة (صفحات المكاتب وسجلات QA) من Google Search Console.
4. بعد تأكيد اختفائها من الفهرس: إضافة `Disallow: /office` و`Disallow: /track`
   و`Disallow: /verify` إلى `public/robots.txt`.
5. `bun run lint` سيبقى فاشلاً لسبب سابق (`PRE_EXISTING_BLOCKER` في `minimatch`) —
   يُعالج في مهمة صيانة اعتمادات مستقلة.

## 5. حالة الفحوص بعد التنفيذ

- `npx tsgo --noEmit`: ناجح.
- `bun run build`: ناجح.
- `bun run security:check`: ناجح — لا مخالفات.
- `bun run seo:check`: ناجح — 87 Route، 10 صفحات رسمية.
- `bun run lint`: فاشل بنفس الخطأ السابق (`PRE_EXISTING_BLOCKER`).

لم تُلمس تكاملات الدفع (Moyasar) ولا البريد (Resend) ولا أي منطق أعمال أو صلاحيات.
