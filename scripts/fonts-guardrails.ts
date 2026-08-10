/**
 * حاجز الخطوط — يمنع أي عودة لخط IBM Plex في واجهة المنصة وملفات الطباعة.
 * الاستثناء الوحيد: قوالب البريد الصادر (تُعرض في عميل بريد خارجي ولا تُحمّل خطوطنا).
 * التشغيل: bun run fonts:check
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "public"];
const EXTS = [".ts", ".tsx", ".css", ".html", ".json"];
/** مسارات معفاة: قوالب ورسائل البريد الصادر فقط */
const EXEMPT = [/^src\/lib\/email\//, /^src\/lib\/email-templates\//, /^src\/routes\/lovable\/email\//];
const FORBIDDEN = /IBM\s*Plex|ibm-plex/i;

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
      });
  }
}

if (violations.length > 0) {
  console.error("FAIL — استخدام خط IBM Plex ممنوع (الخطوط المعتمدة: Tajawal + Cairo):");
  for (const v of violations) console.error("  " + v);
  console.error(`\nإجمالي المخالفات: ${violations.length}`);
  process.exit(1);
}
console.log("PASS — لا أثر لخط IBM Plex في الواجهة أو ملفات الطباعة (Tajawal + Cairo فقط).");
