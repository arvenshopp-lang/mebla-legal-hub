/**
 * حرّاس الأمان الآليون — طبقة قاعدة البيانات (مِهلة)
 *
 * التشغيل: bun run security:db
 * يقرأ scripts/security-guardrails.sql وينفّذه كاستعلام قراءة فقط عبر psql.
 * أي صف يرجع = مخالفة تُفشل الفحص (exit 1).
 *
 * الاتصال: يُستخدم أول متغيّر متاح من DATABASE_URL أو SUPABASE_DB_URL،
 * وإن لم يوجد أيّ منهما تُستخدم متغيّرات PG* القياسية.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL_PATH = join(process.cwd(), "scripts/security-guardrails.sql");
const CONNECTION = process.env["DATABASE_URL"] ?? process.env["SUPABASE_DB_URL"] ?? "";
const hasPgEnv = Boolean(process.env["PGHOST"] && process.env["PGUSER"]);

if (!CONNECTION && !hasPgEnv) {
  console.error(
    "❌ حرّاس الأمان (قاعدة البيانات): لا يوجد اتصال. اضبط DATABASE_URL أو متغيّرات PG* قبل التشغيل.",
  );
  process.exit(1);
}

let sql: string;
try {
  sql = readFileSync(SQL_PATH, "utf8");
} catch {
  console.error("❌ حرّاس الأمان (قاعدة البيانات): ملف scripts/security-guardrails.sql غير موجود.");
  process.exit(1);
}

const args = [
  ...(CONNECTION ? [CONNECTION] : []),
  "--no-psqlrc",
  "--tuples-only",
  "--no-align",
  "--field-separator=|",
  "--variable=ON_ERROR_STOP=1",
  "--command",
  sql,
];

const result = spawnSync("psql", args, { encoding: "utf8" });

if (result.error) {
  console.error(`❌ حرّاس الأمان (قاعدة البيانات): تعذّر تشغيل psql — ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("❌ حرّاس الأمان (قاعدة البيانات): فشل تنفيذ الاستعلام.");
  if (result.stderr.trim()) console.error(result.stderr.trim());
  process.exit(1);
}

const rows = result.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => {
    const [checkId = "", objectName = "", detail = ""] = line.split("|");
    return { checkId, objectName, detail };
  });

if (rows.length === 0) {
  console.log("✅ حرّاس الأمان (قاعدة البيانات): لا مخالفات.");
  process.exit(0);
}

console.error(`❌ حرّاس الأمان (قاعدة البيانات): ${rows.length} مخالفة\n`);
for (const row of rows) {
  console.error(`  [${row.checkId}] ${row.objectName} — ${row.detail}`);
}
console.error("\nراجع docs/security-guardrails.md لتفصيل كل معرّف فحص وطريقة الإصلاح المعتمدة.");
process.exit(1);
