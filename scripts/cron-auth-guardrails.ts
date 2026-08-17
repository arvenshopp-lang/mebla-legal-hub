/**
 * حراس ثابتة + وظيفية لبوابة توثيق المهام المجدولة.
 * لا تتصل بالشبكة ولا بقاعدة البيانات ولا تنشئ أي بيانات.
 *
 * التشغيل: bun run cron:guardrails
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CRON_SECRET_HEADER,
  cronUnauthorizedResponse,
  isAuthorizedCronRequest,
} from "../src/lib/security/cron-auth.server";

const ROOT = join(import.meta.dirname, "..");
const HOOKS = [
  "email-dispatch",
  "mail-sync",
  "notifications-dispatch",
  "cleanup-secure-artifacts",
] as const;

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

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// 1) المسارات الأربعة: لا مفاتيح عامة ولا ترويسة apikey، وتستخدم البوابة الموحّدة
for (const hook of HOOKS) {
  const rel = `src/routes/api/public/hooks/${hook}.ts`;
  const src = read(rel);
  check(`${hook}: no SUPABASE_ANON_KEY`, !src.includes("SUPABASE_ANON_KEY"));
  check(`${hook}: no SUPABASE_PUBLISHABLE_KEY`, !src.includes("SUPABASE_PUBLISHABLE_KEY"));
  check(`${hook}: no apikey header auth`, !/headers\.get\(\s*["']apikey["']\s*\)/.test(src));
  check(
    `${hook}: no authorization bearer auth`,
    !/headers\.get\(\s*["']authorization["']/i.test(src),
  );
  check(`${hook}: no SERVICE_ROLE literal`, !src.includes("SERVICE_ROLE_KEY"));
  check(`${hook}: uses cron-auth guard`, src.includes("guardCronRequest"));
  check(
    `${hook}: guard runs before work`,
    src.indexOf("guardCronRequest") < src.indexOf("await import("),
  );
}

// 2) الهيلبر: ترويسة مخصصة + تحقق داخل قاعدة البيانات + لا أسرار في المصدر
const helper = read("src/lib/security/cron-auth.server.ts");
check("helper: custom header name", CRON_SECRET_HEADER === "x-mehla-cron-secret");
check("helper: verifies via restricted rpc", helper.includes('rpc("verify_cron_secret"'));
check("helper: no publishable/anon fallback", !/ANON_KEY|PUBLISHABLE_KEY/.test(helper));
// أنماط المفاتيح تُبنى ديناميكياً حتى لا يوجد أي literal يشبه مفتاح مشروع في المصدر.
const PUBLISHABLE_PREFIX = ["sb", "publishable"].join("_") + "_";
const SECRET_PREFIX = ["sb", "secret"].join("_") + "_";
const keyLikePattern = new RegExp(`${PUBLISHABLE_PREFIX}|${SECRET_PREFIX}|eyJ[A-Za-z0-9]`);
check("helper: no hardcoded secret", !keyLikePattern.test(helper));

// 3) رفض المفاتيح العامة والترويسات الناقصة (بدون أي نداء شبكي)
const url = "https://mehlalex.com/api/public/hooks/email-dispatch";
// قيمة اختبار محايدة: لا تشبه ولا تنسخ أي مفتاح مشروع حقيقي.
const publishable = "test-public-key-not-a-real-project-key";

const cases: Array<[string, Request]> = [
  ["no headers", new Request(url, { method: "POST" })],
  ["apikey publishable", new Request(url, { method: "POST", headers: { apikey: publishable } })],
  [
    "authorization bearer publishable",
    new Request(url, { method: "POST", headers: { authorization: `Bearer ${publishable}` } }),
  ],
  [
    "empty secret header",
    new Request(url, { method: "POST", headers: { [CRON_SECRET_HEADER]: "   " } }),
  ],
  [
    "oversized secret header",
    new Request(url, { method: "POST", headers: { [CRON_SECRET_HEADER]: "a".repeat(4096) } }),
  ],
];

for (const [label, request] of cases) {
  const allowed = await isAuthorizedCronRequest(request);
  check(`reject: ${label}`, allowed === false);
}

// 4) رسالة رفض موحّدة لا تكشف السبب
const denied = cronUnauthorizedResponse();
const body = await denied.clone().text();
check("denial: status 401", denied.status === 401);
check("denial: opaque body", body === JSON.stringify({ error: "unauthorized" }));

// 5) لا يوجد أي توثيق بمفتاح عام في أي مسار تحت /api/public/hooks
const publicHooks = new Bun.Glob("src/routes/api/public/hooks/*.ts");
for await (const rel of publicHooks.scan({ cwd: ROOT })) {
  const src = read(rel);
  check(`scan: ${rel} free of public-key auth`, !/SUPABASE_(ANON|PUBLISHABLE)_KEY/.test(src));
}

// 6) الميجريشن الأحدث لدالة verify_cron_secret: مقارنة ثابتة عدد الخطوات على 32 بايت
const migrationsDir = "supabase/migrations";
const migrationFiles = readdirSync(join(ROOT, migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const verifyMigrations = migrationFiles.filter((name) =>
  read(`${migrationsDir}/${name}`).includes("FUNCTION public.verify_cron_secret"),
);
check("migration: verify_cron_secret defined", verifyMigrations.length > 0);

const latestVerifySql = verifyMigrations.length
  ? read(`${migrationsDir}/${verifyMigrations[verifyMigrations.length - 1]!}`)
  : "";

check("migration: plpgsql implementation", /LANGUAGE\s+plpgsql/i.test(latestVerifySql));
check("migration: fixed 32-byte loop", /FOR\s+i\s+IN\s+0\.\.31\s+LOOP/i.test(latestVerifySql));
check(
  "migration: accumulates every byte without early exit",
  /diff\s*:=\s*diff\s*\|\s*\(\s*get_byte\(\s*stored_digest\s*,\s*i\s*\)\s*#\s*get_byte\(\s*candidate_digest\s*,\s*i\s*\)\s*\)/i.test(
    latestVerifySql,
  ),
);
check("migration: result derived from accumulator", /RETURN\s+diff\s*=\s*0/i.test(latestVerifySql));
check(
  "migration: no direct digest equality",
  !/digest\s*\([^)]*\)\s*(=|<>|!=)\s*digest\s*\(/i.test(latestVerifySql),
);
check(
  "migration: no direct secret equality",
  !/\b(stored|stored_digest)\b\s*(=|<>|!=)\s*\b(candidate|candidate_digest)\b/i.test(
    latestVerifySql,
  ),
);
check(
  "migration: no loop early exit",
  !/LOOP[\s\S]*?(EXIT|RETURN)[\s\S]*?END\s+LOOP/i.test(latestVerifySql),
);
check(
  "migration: execute restricted to service_role",
  /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.verify_cron_secret\(text\)\s+TO\s+service_role/i.test(
    latestVerifySql,
  ) &&
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.verify_cron_secret\(text\)\s+FROM\s+anon,\s*authenticated/i.test(
      latestVerifySql,
    ),
);
check(
  "migration: does not return the secret",
  !/RETURN\s+(stored|secret)\s*;/i.test(latestVerifySql),
);

// 7) لا يوجد literal يشبه مفتاح مشروع داخل أي حارس
const guardScripts = new Bun.Glob("scripts/*guardrails*.ts");
for await (const rel of guardScripts.scan({ cwd: ROOT })) {
  check(`guardrail: ${rel} free of project-key literals`, !keyLikePattern.test(read(rel)));
}

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
