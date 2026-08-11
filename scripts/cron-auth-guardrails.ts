/**
 * حراس ثابتة + وظيفية لبوابة توثيق المهام المجدولة.
 * لا تتصل بالشبكة ولا بقاعدة البيانات ولا تنشئ أي بيانات.
 *
 * التشغيل: bun run cron:guardrails
 */
import { readFileSync } from "node:fs";
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
check("helper: no hardcoded secret", !/sb_publishable_|sb_secret_|eyJ[A-Za-z0-9]/.test(helper));

// 3) رفض المفاتيح العامة والترويسات الناقصة (بدون أي نداء شبكي)
const url = "https://app.mehlalex.com/api/public/hooks/email-dispatch";
const publishable = "sb_publishable_DdaWa67SEQa2mSUOmmjCvg_HMlsuwbg";

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

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
