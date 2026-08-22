# توحيد أصول الهوية: كسر كاش المعاينات + فحص تلقائي + مانيفست كامل

ثلاث مهام مترابطة على الطبقة العامة فقط (بدون قاعدة بيانات، بدون Auth، بدون Service Worker).

## 1) كسر كاش صورة المشاركة (og:image / twitter:image)

- إضافة ثابت إصدار واحد في `src/config/brand-assets.ts`:
  `export const BRAND_ASSET_VERSION = "2026-08-v3"`.
- بناء روابط الأصول عبر دالة `versioned(path)` تُنتج `https://mehlalex.com/og-mehlalex-v3.jpg?v=2026-08-v3`.
- تطبيقها على `OG_IMAGE.url` (وبالتالي `og:image` و`og:image:secure_url` و`twitter:image` في `socialPreviewMeta`)، وعلى `ORGANIZATION_LOGO_URL` في Schema.org، وعلى روابط الأيقونات والمانيفست في رأس `src/routes/__root.tsx`.
- أي تحديث بصري لاحقاً = تغيير قيمة `BRAND_ASSET_VERSION` فقط، ويسري على كل الصفحات العامة تلقائياً.
- ملاحظة: اسم الملف يبقى كما هو (لا حذف/إعادة تسمية) حتى لا تنكسر معاينات محفوظة قديمة.

### خطة إعادة تحديث المعاينات (توثيق في `docs/handoff/seo-governance/social-previews.md`)
- واتساب: يعتمد كاش فيسبوك — تحديث فوري عبر Facebook Sharing Debugger («Scrape Again») لكل رابط عام (9 مسارات).
- X/تويتر: يحدّث تلقائياً بعد تغيّر الرابط؛ لا يوجد Debugger عام حالياً — إعادة نشر رابط جديد بالمعامل `?v=` تظهر البطاقة الجديدة.
- لينكدإن: Post Inspector.
- تلغرام: `@WebpageBot`.
- قائمة الروابط الرسمية التسعة + خطوات مرتبة + ملاحظة أن الظهور قد يتأخر حتى إعادة السحب.

## 2) فحص تلقائي (crawler) لأصول الهوية

سكربت حاجز جديد `scripts/brand-assets-guardrails.ts` على نمط `scripts/indexing-guardrails.ts`:

- يزحف على كل مسار في `INDEXABLE_PATHS` + `/docs` مقابل السيرفر المحلي.
- يتحقق لكل صفحة:
  - وجود `og:image` و`og:image:secure_url` و`twitter:image` وتساويها مع الرابط المتوقع بالإصدار الحالي.
  - وجود `og:image:width/height/alt` و`twitter:card=summary_large_image`.
  - وجود كل روابط الأيقونات (`ico`, `svg`, `16`, `32`, `apple-touch`) و`rel="manifest"` بنفس القيم المركزية.
  - عدم وجود أي رابط صورة هوية قديمة (بدون `v3`) أو أي أصل خارجي.
- يتحقق أن كل ملف أصل يُرجع فعلاً `200` ونوع MIME صحيح (بما فيها ملفات المانيفست).
- يفشل بخروج غير صفري مع تقرير عربي واضح يذكر الصفحة والوسم والقيمة المتوقعة.
- إضافته إلى نصوص الفحص في `package.json` كـ `brand:check`.

## 3) إكمال المانيفست وربطه بالـPWA

- `public/site.webmanifest`: إضافة أيقونات 16×16 و32×32 و180×180 (apple-touch) إلى مصفوفة `icons` مع `type` و`purpose: "any"`، والحفاظ على 192/512 و512 maskable، وتأكيد `theme_color: #173F35` و`background_color: #F5F3EE` و`lang/dir` و`id: "/"`.
- إضافة `<meta name="theme-color" content="#173F35">` في `__root.tsx` ليطابق المانيفست (غير موجود حالياً).
- رابط المانيفست يحمل معامل الإصدار: `/site.webmanifest?v=...`.
- بقاء النطاق manifest-only: لا `vite-plugin-pwa`، لا Service Worker، لا تغيير `start_url`/`scope`/`display` (لأن الأجهزة المثبَّتة تحتفظ بها).

## تفاصيل تقنية
- الملفات المعدّلة: `src/config/brand-assets.ts`، `src/routes/__root.tsx`، `public/site.webmanifest`، `package.json`، وملفان جديدان: `scripts/brand-assets-guardrails.ts` و`docs/handoff/seo-governance/social-previews.md`.
- `socialPreviewMeta` تبقى الواجهة الوحيدة للصفحات التسعة — لا تعديل داخل ملفات المسارات.
- التحقق: تشغيل الحاجز الجديد + فحص الخطوط والفهرسة الحالية + التأكد من غياب أخطاء البناء.
