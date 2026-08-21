/**
 * حارس حوكمة الفهرسة — يمنع رجوع أي مسار غير رسمي إلى محركات البحث.
 *
 * يفحص ثلاثة شروط ثابتة:
 *  1. كل Route غير مُدرج في `INDEXABLE_PATHS` يعرّف `NOINDEX_META` في `head()`.
 *  2. لا يوجد وسم robots مكتوب يدوياً في أي Route (المصدر الوحيد هو الملف المركزي).
 *  3. المسارات الممنوعة لا تحمل `canonical` ولا `og:url` (إشارات فهرسة متضاربة).
 *
 * التشغيل: bun run seo:check
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { INDEXABLE_PATHS, isIndexablePath } from "../src/config/indexing";

const ROUTES_DIR = "src/routes";

/** مسارات لا تُصدر HTML (مسارات خادم / خرائط / اكتشاف) فتُستثنى من فحص Meta. */
const NON_HTML_ROUTES = [
  "sitemap[.]xml.ts",
  "mcp.ts",
  "api",
  "lovable",
  "[.mcp]",
  "[.well-known]",
  "[.]lovable.oauth.consent.tsx",
  "README.md",
];

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (NON_HTML_ROUTES.includes(entry)) continue;
    if (statSync(full).isDirectory()) collectRouteFiles(full, acc);
    else if (/\.tsx$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** يشتق مسار الـ URL من مسار الملف وفق قواعد التوجيه بالملفات. */
function urlPathFor(file: string): string {
  let rel = file.slice(`${ROUTES_DIR}/`.length).replace(/\.tsx$/, "");
  if (rel === "__root") return "__root";
  rel = rel
    .split("/")
    .join(".")
    .split(".")
    .filter((seg) => seg !== "_authenticated" && seg !== "index" && seg !== "route")
    .join("/");
  return `/${rel}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

const failures: string[] = [];
const files = collectRouteFiles(ROUTES_DIR).filter((f) => !f.endsWith("__root.tsx"));

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const path = urlPathFor(file);
  const indexable = isIndexablePath(path);

  if (/name:\s*"robots"/.test(source)) {
    failures.push(`${file}: وسم robots مكتوب يدوياً — استخدم NOINDEX_META من src/config/indexing.ts`);
  }

  if (!indexable) {
    if (!/NOINDEX_META|NOINDEX_FOLLOW_META/.test(source)) {
      failures.push(`${file}: المسار ${path} غير مسموح بفهرسته ولا يعرّف NOINDEX_META في head()`);
    }

    if (/rel:\s*"canonical"/.test(source)) {
      failures.push(`${file}: المسار ${path} ممنوع من الفهرسة ولا يجوز أن يحمل canonical`);
    }
    if (/property:\s*"og:url"/.test(source)) {
      failures.push(`${file}: المسار ${path} ممنوع من الفهرسة ولا يجوز أن يحمل og:url`);
    }
  } else if (source.includes("NOINDEX_META")) {
    failures.push(`${file}: المسار ${path} صفحة رسمية ولا يجوز أن يمنع فهرسة نفسه`);
  }
}

// كل مسار مُدرج في القائمة يجب أن يوجد له Route فعلي.
const knownPaths = new Set(files.map(urlPathFor));
for (const path of INDEXABLE_PATHS) {
  if (!knownPaths.has(path)) {
    failures.push(`INDEXABLE_PATHS يحتوي ${path} ولا يوجد Route مقابل له في ${ROUTES_DIR}`);
  }
}

if (failures.length > 0) {
  console.error("✖ حوكمة الفهرسة — فشل الفحص:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`✔ حوكمة الفهرسة سليمة — ${files.length} Route، ${INDEXABLE_PATHS.length} صفحة رسمية.`);
