/**
 * فحوص ثابتة موجّهة لمسار اختبار نقل Resend المؤقت — بلا شبكة وبلا قاعدة بيانات.
 * التشغيل: bun run scripts/resend-system-test-route.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_SECRET_HEADER, isAuthorizedCronRequest } from "../src/lib/security/cron-auth.server";

const ROOT = join(import.meta.dirname, "..");
const REL = "src/routes/api/public/hooks/resend-system-test.ts";
const src = readFileSync(join(ROOT, REL), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL  ${name}`);
  }
}

check("guarded by cron secret", src.includes("guardCronRequest"));
check("guard before transport import", src.indexOf("guardCronRequest") < src.indexOf("await import("));
check("POST only handler", /handlers:\s*\{\s*POST:/.test(src) && !/\b(GET|PUT|PATCH|DELETE):/.test(src));
check("recipient hardcoded", src.includes('FIXED_RECIPIENT = "ziad.emb@gmail.com"'));
check("recipient not from request", !/request\.(json|text|formData|url)/.test(src));
check("no query parsing", !/searchParams|URLSearchParams/.test(src));
check("sender fixed via system identity", /identity:\s*"system"/.test(src) && !/from:/.test(src));
check("reply-to not settable by caller", !/replyTo/.test(src));
check("subject/body fixed constants", src.includes("subject: FIXED_SUBJECT") && src.includes("text: FIXED_TEXT"));
check("uses mail abstraction", src.includes("sendMehlaEmail"));
check("no direct provider api call", !/api\.resend\.com|httpMailSend|fetch\(/.test(src));
check("no raw smtp", !/smtpSend|smtp\.server/.test(src));
check("exactly one send call", (src.match(/sendMehlaEmail\(/g) ?? []).length === 1);
check("no retry loop", !/\bfor\s*\(|\bwhile\s*\(|retry/i.test(src));
check("no cron/schedule", !/cron\.schedule|setInterval/.test(src));
check("no db client", !/supabaseAdmin|client\.server|logFailure|from\(/.test(src));
check("no secret usage", !/process\.env/.test(src));
check("safe response fields only", !/authorization|api_?key/i.test(src));

const url = "https://app.mehlalex.com/api/public/hooks/resend-system-test";
for (const [label, request] of [
  ["no headers", new Request(url, { method: "POST" })],
  ["empty secret", new Request(url, { method: "POST", headers: { [CRON_SECRET_HEADER]: "  " } })],
] as Array<[string, Request]>) {
  check(`reject: ${label}`, (await isAuthorizedCronRequest(request)) === false);
}

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);