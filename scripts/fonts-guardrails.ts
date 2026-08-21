/**
 * حاجز الخطوط — يوحّد عائلات الخطوط في الواجهة والطباعة على
 * IBM Plex Sans Arabic فقط (خط المنصة الرسمي المستضاف محلياً)،
 * ويمنع أي عودة لـ Tajawal أو Cairo أو أي خط من Google Fonts/CDN.
 * الاستثناء الوحيد: قوالب البريد الصادر (تُعرض في عميل بريد خارجي ولا تُحمّل خطوطنا).
 * التشغيل: bun run fonts:check
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "public"];
const EXTS = [".ts", ".tsx", ".css", ".html", ".json"];
/** مسارات معفاة: قوالب ورسائل البريد الصادر فقط */
const EXEMPT = [
  /^src\/lib\/email\//,
  /^src\/lib\/email-templates\//,
  /^src\/routes\/lovable\/email\//,
  // خط مصغّر مدمج (base64) داخل ملفات PDF على الخادم — لا يصدر أي طلب شبكي
  /^src\/lib\/secure-view\/watermark-font\.ts$/,
  // مُنشئات HTML لرسائل بريد صادرة (تُعرض في عميل بريد خارجي بخطوطه)
  /^src\/lib\/support\/csat\.server\.ts$/,
  /^src\/components\/admin\/mail\/compose-modal\.tsx$/,
];
const FORBIDDEN = /Tajawal|tajawal|Cairo(?![a-z])|cairo-|fonts\.googleapis\.com|fonts\.gstatic\.com/;

/**
 * العائلات المسموحة داخل أي تعريف font-family في الواجهة/الطباعة:
 * خط الهوية + الخط الاحتياطي المعايَر + العائلات العامة فقط. أي خط مسمّى آخر
 * (Arial, Segoe UI, Tahoma…) ممنوع لأنه يغيّر الهوية أو يفتح باباً لتحميل خارجي.
 */
const ALLOWED_FAMILIES = new Set([
  "ibm plex sans arabic",
  "mehla fallback",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
  "inherit",
  "initial",
  "unset",
  "revert",
]);
const FONT_FAMILY_DECL = /font-?family\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^;<>{}"'`]+))/gi;

function familyViolations(line: string): string[] {
  const bad: string[] = [];
  for (const match of line.matchAll(FONT_FAMILY_DECL)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value || value.includes("var(") || value.includes("${")) continue;
    for (const raw of value.split(",")) {
      const family = raw.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (!family) continue;
      if (!ALLOWED_FAMILIES.has(family)) bad.push(family);
    }
  }
  return bad;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const violations: string[] = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(".", file).replace(/\\/g, "/");
    if (EXEMPT.some((r) => r.test(rel))) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (FORBIDDEN.test(line)) violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
        const bad = familyViolations(line);
        if (bad.length > 0) {
          violations.push(`${rel}:${i + 1}  خط غير معتمد: ${[...new Set(bad)].join(", ")}`);
        }
      });
  }
}

// الصفحة الأولى تستخدم عنواناً عربياً بوزن 700؛ يجب أن يسبق ملفه الرسم الأول.
const rootRoute = readFileSync("src/routes/__root.tsx", "utf8");
for (const criticalFont of ["plex-arabic-400.woff2", "plex-arabic-700.woff2"]) {
  if (!rootRoute.includes(`rel: "preload"`) || !rootRoute.includes(criticalFont)) {
    violations.push(`src/routes/__root.tsx  ملف الخط الحرج غير محمّل مسبقاً: ${criticalFont}`);
  }
}

const appFonts = readFileSync("src/styles/fonts.css", "utf8");
if (appFonts.includes("font-display: optional") || appFonts.includes("font-display: swap")) {
  violations.push(
    "src/styles/fonts.css  سلوك عرض الخط يسمح بتبديل مرئي بعد الرسم الأول؛ استخدم font-display: block",
  );
}
if (!readFileSync("src/styles.css", "utf8").includes("font-synthesis: none")) {
  violations.push("src/styles.css  يجب تعطيل تصنيع أوزان الخط عبر font-synthesis: none");
}

if (violations.length > 0) {
  console.error(
    "FAIL — مخالفات الخطوط (المعتمد فقط: IBM Plex Sans Arabic أو var(--font-*)):",
  );
  for (const v of violations) console.error("  " + v);
  console.error(`\nإجمالي المخالفات: ${violations.length}`);
  process.exit(1);
}
console.log(
  "PASS — الواجهة والطباعة تعتمد IBM Plex Sans Arabic فقط، ولا أثر لـ Tajawal/Cairo أو خطوط خارجية.",
);
