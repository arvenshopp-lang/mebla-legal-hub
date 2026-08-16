/**
 * اختبارات نقل البريد عبر HTTP — بلا شبكة حقيقية (fetch مُموّه)، بلا إرسال بريد،
 * بلا قاعدة بيانات، بلا هجرة. التشغيل: bun run scripts/http-mail.test.ts
 */
import { readFileSync } from "node:fs";

process.env["MAIL_SYSTEM_REPLY_TO"] = "support@mehlalex.com";
process.env["RESEND_API_KEY"] = "re_testkeytestkeytestkey";

const { httpMailSend, stableRequestKey, redactHttpMailError } = await import(
  "@/lib/email/transport/http-mail.server"
);
const { sendMehlaEmail, classifyTransportFailure, notificationMessageId, APP_MAILER_UNUSED } =
  (await import("@/lib/email/transport/mehla-mailer.server")) as never as {
    sendMehlaEmail: typeof import("@/lib/email/transport/mehla-mailer.server").sendMehlaEmail;
    classifyTransportFailure: typeof import("@/lib/email/transport/mehla-mailer.server").classifyTransportFailure;
    notificationMessageId: typeof import("@/lib/email/transport/mehla-mailer.server").notificationMessageId;
    APP_MAILER_UNUSED?: unknown;
  };
void APP_MAILER_UNUSED;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

const realFetch = globalThis.fetch;
type Call = { url: string; init: RequestInit; body: Record<string, unknown> };
let calls: Call[] = [];
function mockFetch(status: number, body: string): void {
  calls = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(body, { status });
  }) as typeof fetch;
}
function mockThrow(error: Error): void {
  calls = [];
  globalThis.fetch = (async () => {
    calls.push({ url: "throw", init: {}, body: {} });
    throw error;
  }) as unknown as typeof fetch;
}

const MAILER_SRC = readFileSync("src/lib/email/transport/mehla-mailer.server.ts", "utf8");
const HTTP_SRC = readFileSync("src/lib/email/transport/http-mail.server.ts", "utf8");
const WORKER_SRC = readFileSync("src/lib/notifications/email-worker.server.ts", "utf8");
const WORKSPACE_SRC = readFileSync("src/lib/email/workspace.server.ts", "utf8");

console.log("\n1) النقل عبر fetch فقط بلا مقابس");
check("لا node:tls", !HTTP_SRC.includes("node:tls"));
check("لا node:net", !HTTP_SRC.includes("node:net"));
check("لا cloudflare:sockets", !HTTP_SRC.includes("cloudflare:sockets"));
check("لا نداء smtpSend", !HTTP_SRC.includes("smtpSend"));
check("المُرسل الكنسي لا يستدعي smtpSend", !/await smtpSend\(/.test(MAILER_SRC));
check("المُرسل الكنسي يستدعي httpMailSend", MAILER_SRC.includes("await httpMailSend(message)"));

console.log("\n2) نجاح الإرسال");
mockFetch(200, JSON.stringify({ id: "prov-1" }));
const ok = await sendMehlaEmail({
  to: "user@example.com",
  identity: "system",
  subject: "اختبار",
  html: "<p>x</p>",
  text: "x",
  messageId: notificationMessageId("row-1"),
});
check("النتيجة ناجحة", ok.ok === true, ok);
check("طلب واحد فقط", calls.length === 1, calls.length);
check("وسم المزوّد", ok.provider === "resend_http");
check("رمز المزوّد = حالة HTTP", ok.ok && ok.smtpCode === 200);
check("From يحمل هوية النظام", calls[0]!.body["from"] === "مِهلة | MEHLA <noreply@mehlalex.com>", calls[0]!.body["from"]);
check("Reply-To محفوظ", calls[0]!.body["reply_to"] === "support@mehlalex.com");
check(
  "ترويسة Message-ID الحتمية",
  (calls[0]!.body["headers"] as Record<string, string>)["Message-ID"] ===
    "<notif-row-1@mehlalex.com>",
);
check(
  "مفتاح تفرّد حتمي في الترويسات",
  (calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"] ===
    "notif-row-1@mehlalex.com",
);
check("ثبات مفتاح التفرّد", stableRequestKey("<a@b>") === stableRequestKey("<a@b>"));
check("معرّف مِهلة هو المعاد لا معرّف المزوّد", ok.messageId === "<notif-row-1@mehlalex.com>");

console.log("\n3) تصنيف الأعطال متوافق مع نموذج الطابور");
mockFetch(429, "rate limited");
const rate = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("429 قابل للإعادة", !rate.ok && rate.errorClass === "RETRYABLE" && rate.errorCode === "mail_http_rate_limited", rate);
mockFetch(503, "upstream down");
const down = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("5xx قابل للإعادة لا نهائي", !down.ok && down.errorClass === "RETRYABLE", down);
mockFetch(401, "invalid api key");
const auth = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("401 عطل إعداد", !auth.ok && auth.errorClass === "SYSTEM_CONFIGURATION_FAILURE", auth);
mockFetch(422, JSON.stringify({ message: "invalid `to` field" }));
const rcpt = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("رفض مستلم نهائي", !rcpt.ok && rcpt.errorClass === "PERMANENT" && rcpt.errorCode === "mail_http_rejected_recipient", rcpt);
mockFetch(422, JSON.stringify({ message: "domain is not verified" }));
const cfg = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("خطأ طلب غير متعلق بالمستلم = إعداد", !cfg.ok && cfg.errorClass === "SYSTEM_CONFIGURATION_FAILURE", cfg);
mockThrow(new Error("network unreachable"));
const net = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("فشل شبكي قابل للإعادة", !net.ok && net.errorClass === "RETRYABLE" && net.errorCode === "mail_http_network_failed", net);
const abort = new Error("The operation was aborted");
abort.name = "TimeoutError";
mockThrow(abort);
const timeout = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("مهلة قابلة للإعادة", !timeout.ok && timeout.errorCode === "mail_http_timeout", timeout);
check("تصنيف مباشر لعدم التهيئة", classifyTransportFailure("mail_http_not_configured", null) === "SYSTEM_CONFIGURATION_FAILURE");

console.log("\n4) غياب المفتاح يوقف الإرسال قبل أي طلب");
delete process.env["RESEND_API_KEY"];
calls = [];
const noKey = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "س", html: "", text: "" });
check("لا طلب شبكي", calls.length === 0);
check("عطل إعداد واضح", !noKey.ok && noKey.errorCode === "mail_http_not_configured" && noKey.errorClass === "SYSTEM_CONFIGURATION_FAILURE", noKey);
process.env["RESEND_API_KEY"] = "re_testkeytestkeytestkey";

console.log("\n5) لا انكشاف أسرار ولا محتوى رسالة في الأخطاء");
mockFetch(400, "Authorization: Bearer re_testkeytestkeytestkey rejected");
const leak = await sendMehlaEmail({ to: "u@example.com", identity: "system", subject: "سري-جدا", html: "<p>محتوى-سري</p>", text: "محتوى-سري" });
const serialized = JSON.stringify(leak);
check("لا مفتاح في النتيجة", !serialized.includes("re_testkeytestkeytestkey"));
check("لا محتوى الرسالة في النتيجة", !serialized.includes("محتوى-سري"));
check("تعقيم مباشر", !redactHttpMailError("re_abcdefghijkl").includes("abcdefghijkl"));

console.log("\n6) لا تغيير في الطابور والعامل والقوالب والبريد البشري");
check("العامل لا يعرف المزوّد", !WORKER_SRC.includes("resend") && !WORKER_SRC.includes("http-mail"));
check("العامل ما زال على sendAppEmail/sendMehlaEmail", WORKER_SRC.includes("sendAppEmail") || WORKER_SRC.includes("sendMehlaEmail"));
check("البريد البشري ما زال على Hostinger", WORKSPACE_SRC.includes("sendViaHostinger"));
check("مسار SMTP لم يُحذف", readFileSync("src/lib/email/transport/smtp.server.ts", "utf8").includes("export async function smtpSend"));

globalThis.fetch = realFetch;
console.log(failures === 0 ? "\nPASS — جميع الفحوص ناجحة" : `\nFAIL — ${failures} فحص فاشل`);
if (failures > 0) process.exit(1);
