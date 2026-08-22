/**
 * حارس أصول الهوية — يتأكد أن كل صفحة عامة تُرجع نفس روابط شعار مِهلة الجديد.
 *
 * يزحف على الصفحات العامة مقابل السيرفر المحلي ويفحص لكل صفحة:
 *  1. وسوم المشاركة: og:image و og:image:secure_url و twitter:image مطابقة
 *     للرابط المتوقع مع مفتاح الإصدار الحالي، مع الأبعاد والنص البديل والبطاقة.
 *  2. روابط الأيقونات (ico/svg/16/32/apple-touch) والمانيفست مطابقة للمصدر المركزي.
 *  3. لا وجود لأي أصل هوية قديم (بدون v3) أو أصل خارجي في الرأس.
 *  4. كل ملف أصل يُرجع 200 بنوع MIME صحيح، والمانيفست يحمل الأيقونات وthemeColor.
 *
 * التشغيل: bun run brand:check   (يفترض السيرفر شغّالاً على http://localhost:8080)
 */
import {
  BRAND_ICONS,
  BRAND_ICON_HREFS,
  MANIFEST_PATH,
  OG_IMAGE,
  versionedAsset,
} from "../src/config/brand-assets";
import { INDEXABLE_PATHS, NOINDEX_FOLLOW_PATHS } from "../src/config/indexing";

const BASE = process.env["BRAND_CHECK_BASE"] ?? "http://localhost:8080";
const PAGES = [...INDEXABLE_PATHS, ...NOINDEX_FOLLOW_PATHS];

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[:.]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

function linkHrefs(html: string): { rel: string; href: string; sizes?: string }[] {
  return [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    return {
      rel: (tag.match(/rel=["']([^"']*)["']/i)?.[1] ?? "").toLowerCase(),
      href: tag.match(/href=["']([^"']*)["']/i)?.[1] ?? "",
      sizes: tag.match(/sizes=["']([^"']*)["']/i)?.[1],
    };
  });
}

const EXPECTED_META: [("property" | "name"), string, string][] = [
  ["property", "og:image", OG_IMAGE.url],
  ["property", "og:image:secure_url", OG_IMAGE.url],
  ["property", "og:image:width", OG_IMAGE.width],
  ["property", "og:image:height", OG_IMAGE.height],
  ["property", "og:image:alt", OG_IMAGE.alt],
  ["name", "twitter:image", OG_IMAGE.url],
  ["name", "twitter:image:alt", OG_IMAGE.alt],
  ["name", "twitter:card", "summary_large_image"],
  ["name", "theme-color", "#173F35"],
];

const EXPECTED_LINKS: [string, string, string | undefined][] = [
  ["icon", BRAND_ICON_HREFS.ico, undefined],
  ["icon", BRAND_ICON_HREFS.svg, undefined],
  ["icon", BRAND_ICON_HREFS.png16, "16x16"],
  ["icon", BRAND_ICON_HREFS.png32, "32x32"],
  ["apple-touch-icon", BRAND_ICON_HREFS.appleTouch, "180x180"],
  ["manifest", BRAND_ICON_HREFS.manifest, undefined],
];

async function checkPage(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": "MehlaBrandCheck/1" } });
  if (!res.ok) {
    fail(`الصفحة ${path}: استجابة ${res.status} بدلاً من 200`);
    return;
  }
  const html = await res.text();

  for (const [attr, key, expected] of EXPECTED_META) {
    const actual = metaContent(html, attr, key);
    if (actual !== expected) {
      fail(`الصفحة ${path}: الوسم ${key} = ${actual ?? "غير موجود"} — المتوقع ${expected}`);
    }
  }

  const links = linkHrefs(html);
  for (const [rel, href, sizes] of EXPECTED_LINKS) {
    const match = links.find((l) => l.rel === rel && l.href === href);
    if (!match) {
      fail(`الصفحة ${path}: رابط ${rel} المتوقع ${href} غير موجود`);
      continue;
    }
    if (sizes && match.sizes !== sizes) {
      fail(`الصفحة ${path}: رابط ${rel} بمقاس ${match.sizes ?? "غير محدد"} — المتوقع ${sizes}`);
    }
  }

  // أصول هوية قديمة أو خارجية في الرأس
  const head = html.slice(0, html.indexOf("</head>") + 7);
  for (const stale of ["og-image.png", "og-mehlalex.jpg", "favicon-32x32.png", "logo-mehla.png"]) {
    if (head.includes(stale)) fail(`الصفحة ${path}: أصل هوية قديم في الرأس (${stale})`);
  }
  for (const iconLink of links.filter((l) => /icon|manifest/.test(l.rel))) {
    if (/^https?:\/\//i.test(iconLink.href) && !iconLink.href.startsWith("https://mehlalex.com")) {
      fail(`الصفحة ${path}: أيقونة من أصل خارجي (${iconLink.href})`);
    }
  }
}

const EXPECTED_MIME: Record<string, RegExp> = {
  [BRAND_ICONS.ico]: /image\/(x-icon|vnd\.microsoft\.icon)/,
  [BRAND_ICONS.svg]: /image\/svg\+xml/,
  [BRAND_ICONS.png16]: /image\/png/,
  [BRAND_ICONS.png32]: /image\/png/,
  [BRAND_ICONS.appleTouch]: /image\/png/,
  [BRAND_ICONS.png192]: /image\/png/,
  [BRAND_ICONS.png512]: /image\/png/,
  [OG_IMAGE.path]: /image\/jpe?g/,
  [MANIFEST_PATH]: /(application\/manifest\+json|application\/json)/,
};

async function checkAssets() {
  for (const [path, mime] of Object.entries(EXPECTED_MIME)) {
    const res = await fetch(`${BASE}${versionedAsset(path)}`);
    if (!res.ok) {
      fail(`الأصل ${path}: استجابة ${res.status} بدلاً من 200`);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!mime.test(type)) fail(`الأصل ${path}: نوع MIME غير متوقع (${type})`);
  }
}

async function checkManifest() {
  const res = await fetch(`${BASE}${BRAND_ICON_HREFS.manifest}`);
  if (!res.ok) {
    fail(`المانيفست: استجابة ${res.status}`);
    return;
  }
  const manifest = (await res.json()) as {
    theme_color?: string;
    background_color?: string;
    display?: string;
    icons?: { src: string; sizes: string; type?: string; purpose?: string }[];
  };
  if (manifest.theme_color !== "#173F35") fail(`المانيفست: theme_color = ${manifest.theme_color}`);
  if (manifest.background_color !== "#F5F3EE")
    fail(`المانيفست: background_color = ${manifest.background_color}`);
  if (manifest.display !== "standalone") fail(`المانيفست: display = ${manifest.display}`);

  const icons = manifest.icons ?? [];
  for (const [src, sizes] of [
    [BRAND_ICONS.png16, "16x16"],
    [BRAND_ICONS.png32, "32x32"],
    [BRAND_ICONS.appleTouch, "180x180"],
    [BRAND_ICONS.png192, "192x192"],
    [BRAND_ICONS.png512, "512x512"],
  ] as const) {
    if (!icons.some((i) => i.src === src && i.sizes === sizes)) {
      fail(`المانيفست: أيقونة ${src} بمقاس ${sizes} غير مُدرجة`);
    }
  }
  if (!icons.some((i) => i.purpose?.includes("maskable"))) {
    fail("المانيفست: لا توجد أيقونة maskable");
  }
}

for (const path of PAGES) await checkPage(path);
await checkAssets();
await checkManifest();

if (failures.length > 0) {
  console.error(`✖ حارس أصول الهوية: ${failures.length} مخالفة\n`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  `✔ حارس أصول الهوية: ${PAGES.length} صفحة عامة تُرجع نفس روابط شعار مِهلة، ` +
    `وكل الأصول والمانيفست سليمة.`,
);
