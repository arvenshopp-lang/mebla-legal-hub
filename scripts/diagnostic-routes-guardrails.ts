/**
 * حراس ثابتة تمنع وجود أي مسار عام تشخيصي (qa / modcheck / debug)
 * أو مسار يعيد أسماء ورسائل أخطاء الاستيراد إلى الإنترنت.
 *
 * التشغيل: bun run routes:guardrails
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const FORBIDDEN_NAME = /(^|[./-])(qa|modcheck|modulecheck|debug|diag|diagnostics?)([./-]|$)/i;

const routeFiles: string[] = [];
const glob = new Bun.Glob("src/routes/**/*.{ts,tsx}");
for await (const rel of glob.scan({ cwd: ROOT })) routeFiles.push(rel);

check("routes: found route files", routeFiles.length > 0);

// 1) لا يوجد ملف مسار باسم تشخيصي
for (const rel of routeFiles) {
  const base = rel.slice("src/routes/".length).replace(/\.(ts|tsx)$/, "");
  check(`name: ${rel}`, !base.split(/[/.]/).some((seg) => FORBIDDEN_NAME.test(seg)));
}

// 2) لا يوجد مسار qa-modcheck في شجرة المسارات المولّدة
const tree = readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8");
check("routeTree: no qa-modcheck", !/qa-?modcheck/i.test(tree));
check("routeTree: no diagnostic public route", !/\/api\/public\/(qa|debug|diag)/i.test(tree));

// 3) لا يوجد مسار عام يعيد رسائل أخطاء الاستيراد
const publicGlob = new Bun.Glob("src/routes/api/public/**/*.ts");
for await (const rel of publicGlob.scan({ cwd: ROOT })) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  // أسماء/آثار الأخطاء الخادمية لا تُعاد أبداً لعميل عام
  check(`public: ${rel} hides error name/stack`, !/error\s*\.\s*(name|stack)/.test(src));
  // ولا خرائط تشخيصية لنتائج استيراد الوحدات
  const diagnosticPayload =
    /import\(\s*["'`]@\//.test(src) &&
    /Response\.json\(\s*(results|diagnostics|modules|status|report)\s*\)/.test(src);
  check(`public: ${rel} exposes no module diagnostics`, !diagnosticPayload);
}

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
