/**
 * أصول الهوية العامة لمِهلة — المصدر المركزي الوحيد.
 *
 * كل أيقونة موقع وصورة مشاركة اجتماعية تُشتق من هنا، حتى لا تتفرّق النسخ
 * بين الصفحات ولا يظهر شعار قديم في متصفح أو منصة تواصل.
 *
 * أسماء الملفات تحمل لاحقة إصدار (v3) لأن المتصفحات ومنصات التواصل تُخزّن
 * الأيقونات وصور المعاينة بعمر طويل: أي تحديث بصري يستلزم اسم ملف جديد.
 */

/** الأصل الرسمي المعلن في canonical وsitemap. */
export const SITE_ORIGIN = "https://mehlalex.com" as const;

/**
 * إصدار أصول الهوية — مفتاح كسر الكاش الوحيد.
 *
 * منصات التواصل (واتساب/فيسبوك، إكس، لينكدإن) والمتصفحات تُخزّن صورة المعاينة
 * والأيقونات بعمر طويل. تغيير هذه القيمة يبدّل كل روابط الأصول في الصفحات
 * العامة فوراً، فتُعاد سحب المعاينة عند أول مشاركة جديدة دون إعادة تسمية الملفات
 * (حتى لا تنكسر معاينات محفوظة قديمة).
 *
 * راجع docs/handoff/seo-governance/social-previews.md لخطوات إعادة التحديث.
 */
export const BRAND_ASSET_VERSION = "2026-08-v3" as const;

/** يُلحق مفتاح الإصدار بمسار أصل عام. */
export function versionedAsset(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}v=${BRAND_ASSET_VERSION}`;
}

/** يبني رابطاً مطلقاً مع مفتاح الإصدار (مطلوب لوسوم og/twitter وSchema.org). */
export function absoluteVersionedAsset(path: string): string {
  return `${SITE_ORIGIN}${versionedAsset(path)}`;
}

/** أيقونات الموقع المستضافة في public/ — مسارات خام بلا إصدار (للفحص والوجود) */
export const BRAND_ICONS = {
  /** ICO متعدد المقاسات (16/32/48) للمتصفحات القديمة وشريط المفضلة */
  ico: "/favicon.ico",
  /** SVG متجه: أدق مظهر في المتصفحات الحديثة ووضع الليل */
  svg: "/favicon.svg",
  png16: "/favicon-mehla-16-v3.png",
  png32: "/favicon-mehla-32-v3.png",
  appleTouch: "/apple-touch-icon-v3.png",
  png192: "/icon-mehla-192-v3.png",
  png512: "/icon-mehla-512-v3.png",
} as const;

/** مسار المانيفست الخام (بلا إصدار). */
export const MANIFEST_PATH = "/site.webmanifest" as const;

/** الروابط الفعلية المستخدمة في رأس الصفحة — تحمل مفتاح الإصدار. */
export const BRAND_ICON_HREFS = {
  ico: versionedAsset(BRAND_ICONS.ico),
  svg: versionedAsset(BRAND_ICONS.svg),
  png16: versionedAsset(BRAND_ICONS.png16),
  png32: versionedAsset(BRAND_ICONS.png32),
  appleTouch: versionedAsset(BRAND_ICONS.appleTouch),
  manifest: versionedAsset(MANIFEST_PATH),
} as const;

/** صورة المشاركة الاجتماعية الرسمية (1200×630) */
export const OG_IMAGE = {
  path: "/og-mehlalex-v3.jpg",
  url: absoluteVersionedAsset("/og-mehlalex-v3.jpg"),
  width: "1200",
  height: "630",
  alt: "مِهلة | MEHLA — منصة سعودية لإدارة القضايا والمكاتب القانونية",
} as const;

/** شعار مربّع يُستخدم في بيانات Schema.org (لا تُقبل صورة 1200×630 كشعار) */
export const ORGANIZATION_LOGO_URL = absoluteVersionedAsset(BRAND_ICONS.png512);

type MetaEntry = { property?: string; name?: string; content: string };

/**
 * وسوم المعاينة الاجتماعية لصفحة عامة واحدة: بطاقة كبيرة تحمل شعار مِهلة
 * في تويتر/إكس وواتساب ولينكدإن وفيسبوك.
 */
export function socialPreviewMeta({
  title,
  description,
}: {
  title: string;
  description: string;
}): MetaEntry[] {
  return [
    { property: "og:image", content: OG_IMAGE.url },
    { property: "og:image:secure_url", content: OG_IMAGE.url },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:width", content: OG_IMAGE.width },
    { property: "og:image:height", content: OG_IMAGE.height },
    { property: "og:image:alt", content: OG_IMAGE.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: OG_IMAGE.url },
    { name: "twitter:image:alt", content: OG_IMAGE.alt },
  ];
}
