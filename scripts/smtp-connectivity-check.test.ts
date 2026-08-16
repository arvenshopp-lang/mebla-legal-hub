/**
 * اختبار مُوجَّه لمسار فحص اتصال SMTP المؤقت: التوثيق، غياب أي تجاوز من المتصل،
 * غياب أوامر الإرسال في مسار المُتحقق، وغياب أي كتابة في قاعدة التطبيق.
 *
 * التشغيل: bun scripts/smtp-connectivity-check.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const route = readFileSync(join(ROOT, "src/routes/api/public/hooks/smtp-connectivity-check.ts"), "utf8");
const smtp = readFileSync(join(ROOT, "src/lib/email/transport/smtp.server.ts"), "utf8");

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

check("route: guarded by cron secret", route.includes("guardCronRequest(request)") && route.includes("if (denied) return denied;"));
check("route: POST only", /handlers:\s*\{\s*POST:/.test(route) && !/\bGET:|\bPUT:|\bDELETE:/.test(route));
check("route: reads no request body/query", !/request\.(json|text|formData)\(/.test(route) && !/new URL\(request\.url\)/.test(route));
check("route: no caller host/port/credential override", !/host|port|secure|user|password/i.test(route.replace(/^\s*\*.*$/gm, "").replace(/\/\*\*[\s\S]*?\*\//, "")));
check("route: calls smtpVerify with no argument", /smtpVerify\(\)/.test(route));
check("route: no DB client", !/supabaseAdmin|supabase|from\(/.test(route.replace(/\/\*\*[\s\S]*?\*\//, "")));
check("route: no insert/update/delete", !/\.(insert|update|upsert|delete)\(/.test(route));
check("route: leaks no error name/stack/secret", !/error\s*\.\s*(name|stack)/.test(route) && !/CRON_SECRET|password/.test(route));

// مسار smtpVerify نفسه: اتصال ومصادقة فقط
const verifyBody = smtp.slice(smtp.indexOf("export async function smtpVerify"));
const verifySlice = verifyBody.slice(0, verifyBody.indexOf("\n}\n") + 3);
check("smtpVerify: no MAIL FROM", !/MAIL FROM/i.test(verifySlice));
check("smtpVerify: no RCPT TO", !/RCPT TO/i.test(verifySlice));
check("smtpVerify: no DATA command", !/"DATA"|`DATA`|'DATA'/.test(verifySlice));
check("smtpVerify: builds no message", !/buildMimeMessage/.test(verifySlice));
check("smtpVerify: quits and closes", /QUIT/.test(verifySlice) && /socket\.close\(\)/.test(verifySlice));

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
