/**
 * Repo hygiene guardrail.
 *
 * يفشل إذا:
 *  - أصبح ".env" أو ".env.*" (باستثناء .env.example) متتبعاً في Git.
 *  - أصبح أي مسار داخل "tmp-repro/" متتبعاً أو موجوداً على القرص.
 *  - لم يغطِّ .gitignore الأنماط المطلوبة.
 *  - احتوى .env.example قيمة تشبه مفتاحاً/توكناً.
 *
 * لا يقرأ أو يطبع قيم أي أسرار: يتعامل مع .env.example فقط، ويكتفي بأسماء المتغيرات.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
let pass = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1;
    return;
  }
  failures.push(detail ? `${name} — ${detail}` : name);
}

function trackedFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

const tracked = trackedFiles();
check("git ls-files قابل للتشغيل", tracked.length > 0, "تعذّر قراءة قائمة الملفات المتتبعة");

const trackedEnv = tracked.filter(
  (file) => /(^|\/)\.env($|\.)/.test(file) && !/(^|\/)\.env\.example$/.test(file),
);
check(".env غير متتبع في HEAD", trackedEnv.length === 0, `ملفات متتبعة: ${trackedEnv.join(", ")}`);

const trackedRepro = tracked.filter((file) => file.startsWith("tmp-repro/") || file === "tmp-repro");
check("tmp-repro غير متتبع في HEAD", trackedRepro.length === 0, `ملفات متتبعة: ${trackedRepro.join(", ")}`);
check("tmp-repro غير موجود على القرص", !existsSync(resolve(ROOT, "tmp-repro")));

const gitignorePath = resolve(ROOT, ".gitignore");
check(".gitignore موجود", existsSync(gitignorePath));
const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
const gitignoreLines = gitignore
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));
for (const pattern of [".env", ".env.*", "!.env.example", "tmp-repro/"]) {
  check(`.gitignore يغطي ${pattern}`, gitignoreLines.includes(pattern));
}

const examplePath = resolve(ROOT, ".env.example");
check(".env.example موجود", existsSync(examplePath));

if (existsSync(examplePath)) {
  const example = readFileSync(examplePath, "utf8");
  const entries = example
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  check(
    ".env.example يحتوي أسطر KEY=VALUE فقط",
    entries.every((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)),
  );

  const values = entries.map((line) => line.slice(line.indexOf("=") + 1).trim());
  check(
    ".env.example بلا قيم فعلية",
    values.every((value) => value.length === 0 || /^<[^>]*>$/.test(value)),
    "استخدم قيماً فارغة أو <placeholder>",
  );

  // أنماط تُبنى ديناميكياً حتى لا يحتوي الحارس نفسه نصوصاً تشبه مفاتيح حقيقية.
  const secretLike: RegExp[] = [
    new RegExp(`${["sb", "publishable"].join("_")}_`, "i"),
    new RegExp(`${["sb", "secret"].join("_")}_`, "i"),
    new RegExp(`${["ey", "J"].join("")}[A-Za-z0-9_-]{10,}`),
    new RegExp(`${["sk", "live"].join("-")}`, "i"),
    new RegExp(`${["ph", "c"].join("")}_[A-Za-z0-9]{10,}`),
    /https?:\/\//i,
    /[A-Za-z0-9_-]{24,}/,
  ];
  for (const [index, pattern] of secretLike.entries()) {
    check(
      `.env.example خالٍ من قيمة تشبه مفتاحاً (نمط ${index + 1})`,
      values.every((value) => !pattern.test(value)),
    );
  }

  check(
    ".env.example لا يفصح عن معرّف مشروع أو نطاق",
    !/\.supabase\.(co|in)|lovable\.app|mehlalex\.com/i.test(example.replace(/^#.*$/gm, "")),
  );
}

const total = pass + failures.length;
console.log(`repo-hygiene guardrails: ${pass} PASS / ${failures.length} FAIL (total ${total})`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
