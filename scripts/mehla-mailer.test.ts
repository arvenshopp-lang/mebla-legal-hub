/**
 * اختبارات أساس النقل الكنسي (BATCH A) — Hostinger SMTP فقط.
 * التشغيل: bun run mail:transport:test
 *
 * بلا شبكة، بلا إرسال بريد، بلا قاعدة بيانات، بلا هجرة.
 */
import { readFileSync } from "node:fs";

process.env["MAIL_USER"] = "noreply@mehlalex.com";
process.env["MAIL_PASSWORD"] = "test-password-not-real";
delete process.env["MAIL_SYSTEM_REPLY_TO"];

const {
  MEHLA_IDENTITIES,
  MEHLA_ALIAS_IDENTITIES,
  CANONICAL_SMTP_MAILBOX,
  DEFAULT_FROM_NAME,
  identityAddress,
  identityReplyTo,
  isAliasIdentity,
  systemReplyToConfigured,
  canonicalAccountStatus,
  classifyTransportFailure,
  notificationMessageId,
  buildMehlaOutgoingMessage,
  sendMehlaEmail,
} = await import("@/lib/email/transport/mehla-mailer.server");
const { mailboxHasOwnCredentials } = await import("@/lib/email/transport/config.server");
const { buildMimeMessage } = await import("@/lib/email/transport/mime.server");

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

const MAILER_SRC = readFileSync("src/lib/email/transport/mehla-mailer.server.ts", "utf8");
const SMTP_SRC = readFileSync("src/lib/email/transport/smtp.server.ts", "utf8");
const WORKSPACE_SRC = readFileSync("src/lib/email/workspace.server.ts", "utf8");
const HOSTINGER_SRC = readFileSync("src/lib/email/transport/hostinger.server.ts", "utf8");

console.log("\n1) استقلال المُرسل الكنسي عن أي مزوّد مُدار");
check("لا استيراد @lovable.dev/email-js", !MAILER_SRC.includes("@lovable.dev"));
check("لا استخدام LOVABLE_API_KEY", !MAILER_SRC.includes("LOVABLE_API_KEY"));
check(
  "لا استدعاء sendLovableEmail أو sendAppEmail",
  !/sendLovableEmail|sendAppEmail/.test(MAILER_SRC),
);
check("لا fetch شبكي داخل طبقة النقل", !/\bfetch\(/.test(MAILER_SRC));

console.log("\n2) إعادة استخدام مكدّس Hostinger SMTP القائم");
check("يستورد smtpSend", MAILER_SRC.includes('from "./smtp.server"'));
check("يستورد نوع الرسالة من باني MIME القائم", MAILER_SRC.includes('from "./mime.server"'));
check("لا عميل SMTP ثانٍ", !/connectMailSocket|AUTH LOGIN|MAIL FROM/.test(MAILER_SRC));

console.log("\n3) الهويات الست وخريطة العناوين");
check("system = noreply", MEHLA_IDENTITIES.system === "noreply@mehlalex.com");
check("info", identityAddress("info") === "info@mehlalex.com");
check("support", identityAddress("support") === "support@mehlalex.com");
check("legal", identityAddress("legal") === "legal@mehlalex.com");
check("sales", identityAddress("sales") === "sales@mehlalex.com");
check("billing", identityAddress("billing") === "billing@mehlalex.com");
check("عدد الهويات ستة", Object.keys(MEHLA_IDENTITIES).length === 6);

console.log("\n4) noreply ليس اسماً مستعاراً والبقية أسماء مستعارة");
check("noreply صندوق حقيقي", isAliasIdentity("system") === false);
check(
  "قائمة الأسماء المستعارة خمسة بلا noreply",
  MEHLA_ALIAS_IDENTITIES.length === 5 && !MEHLA_ALIAS_IDENTITIES.includes("system" as never),
);
check(
  "الأسماء المستعارة بلا بيانات دخول",
  MEHLA_ALIAS_IDENTITIES.every((id) => !mailboxHasOwnCredentials(identityAddress(id))),
);
check("الصندوق الكنسي يملك بيانات دخول", mailboxHasOwnCredentials(CANONICAL_SMTP_MAILBOX));

console.log("\n5) مطابقة حساب المصادقة للصندوق الكنسي");
check("match عند noreply", canonicalAccountStatus() === "match");
process.env["MAIL_USER"] = "other@mehlalex.com";
check("mismatch عند صندوق آخر", canonicalAccountStatus() === "mismatch");
process.env["MAIL_USER"] = "";
process.env["MAIL_FROM"] = "";
check("unverified عند غياب الإعداد", canonicalAccountStatus() === "unverified");
process.env["MAIL_USER"] = "noreply@mehlalex.com";
delete process.env["MAIL_FROM"];

console.log("\n6) MAIL_SYSTEM_REPLY_TO — بلا رجوع خفي");
const missing = identityReplyTo("system");
check(
  "فشل مُصنّف عند غيابه",
  !missing.ok && missing.errorCode === "mail_system_reply_to_not_configured",
);
check("systemReplyToConfigured = false", systemReplyToConfigured() === false);
process.env["MAIL_SYSTEM_REPLY_TO"] = "support@mehlalex.com";
const present = identityReplyTo("system");
check("يُستخدم عند تهيئته", present.ok && present.replyTo === "support@mehlalex.com");
process.env["MAIL_SYSTEM_REPLY_TO"] = "not-an-email";
check("قيمة غير صالحة تُرفض ولا تُختلق بديلة", identityReplyTo("system").ok === false);
delete process.env["MAIL_SYSTEM_REPLY_TO"];

const systemSend = await sendMehlaEmail({
  to: "user@example.com",
  identity: "system",
  subject: "اختبار",
  html: "<p>x</p>",
  text: "x",
  messageId: notificationMessageId("11111111-1111-1111-1111-111111111111"),
});
check(
  "الإرسال يتوقف قبل أي اتصال عند غياب عنوان الرد",
  !systemSend.ok &&
    systemSend.errorCode === "mail_system_reply_to_not_configured" &&
    systemSend.errorClass === "SYSTEM_CONFIGURATION_FAILURE" &&
    systemSend.smtpCode === null,
  systemSend,
);
check(
  "معرّف الرسالة محفوظ في نتيجة الفشل",
  systemSend.messageId === "<notif-11111111-1111-1111-1111-111111111111@mehlalex.com>",
);

console.log("\n7) Reply-To لهويات الأقسام");
for (const id of MEHLA_ALIAS_IDENTITIES) {
  const resolved = identityReplyTo(id);
  check(`${id} يرد على نفسه`, resolved.ok && resolved.replyTo === identityAddress(id));
}

console.log("\n8) Auto-Submitted لرسائل النظام فقط");
const sysMsg = buildMehlaOutgoingMessage(
  { to: "u@example.com", identity: "system", subject: "س", html: "<p>س</p>", text: "س" },
  "support@mehlalex.com",
  "<a@mehlalex.com>",
);
const supMsg = buildMehlaOutgoingMessage(
  { to: "u@example.com", identity: "support", subject: "س", html: "<p>س</p>", text: "س" },
  "support@mehlalex.com",
  "<b@mehlalex.com>",
);
check("system يحمل الترويسة", buildMimeMessage(sysMsg).includes("Auto-Submitted: auto-generated"));
check("هوية القسم لا تحملها", !buildMimeMessage(supMsg).includes("Auto-Submitted"));
check("الاسم الظاهر الافتراضي", sysMsg.fromName === DEFAULT_FROM_NAME);
check("لا مرفقات في هذه الطبقة", sysMsg.attachments === undefined);
check("ترويسة From بهوية القسم", supMsg.from === "support@mehlalex.com");

console.log("\n9) تصنيف الأخطاء");
check(
  "رفض مستلم 5xx نهائي",
  classifyTransportFailure("smtp_rejected_recipient", 550) === "PERMANENT",
);
check(
  "رفض مستلم 4xx قابل للإعادة",
  classifyTransportFailure("smtp_rejected_recipient", 451) === "RETRYABLE",
);
check("رفض محتوى 5xx نهائي", classifyTransportFailure("smtp_rejected_data", 552) === "PERMANENT");
check(
  "رفض محتوى 4xx قابل للإعادة",
  classifyTransportFailure("smtp_rejected_data", 421) === "RETRYABLE",
);
check(
  "رمز غير معروف قابل للإعادة",
  classifyTransportFailure("smtp_protocol_error", null) === "RETRYABLE",
);
check("مهلة قابلة للإعادة", classifyTransportFailure("smtp_timeout", null) === "RETRYABLE");
check(
  "فشل اتصال قابل للإعادة",
  classifyTransportFailure("smtp_connect_failed", null, "ECONNRESET") === "RETRYABLE",
);
check(
  "فشل TLS عطل إعداد",
  classifyTransportFailure("smtp_connect_failed", null, "certificate verify failed") ===
    "SYSTEM_CONFIGURATION_FAILURE",
);
check(
  "مصادقة فاشلة عطل إعداد",
  classifyTransportFailure("smtp_auth_failed", null) === "SYSTEM_CONFIGURATION_FAILURE",
);
check(
  "رفض المُرسل عطل إعداد",
  classifyTransportFailure("smtp_rejected_sender", 553) === "SYSTEM_CONFIGURATION_FAILURE",
);
check(
  "أسرار ناقصة عطل إعداد",
  classifyTransportFailure("smtp_not_configured", null) === "SYSTEM_CONFIGURATION_FAILURE",
);

console.log("\n10) حفظ رمز SMTP في مسارات الرفض");
const rcptBlock = SMTP_SRC.slice(
  SMTP_SRC.indexOf('code: "smtp_rejected_recipient",\n          message'),
);
check("رفض RCPT يعيد الرمز", rcptBlock.includes("smtpCode: rcpt.code"));
check("رفض DATA يعيد الرمز", SMTP_SRC.includes("smtpCode: dataReply.code"));
check("رفض المُرسل يعيد الرمز", SMTP_SRC.includes("smtpCode: mailFrom.code"));
check("رفض المحتوى يعيد الرمز", SMTP_SRC.includes("smtpCode: accepted.code"));

console.log("\n11) معرّف الرسالة");
check("معرّف حتمي للتنبيه", notificationMessageId("abc") === "<notif-abc@mehlalex.com>");
check("ثبات المعرّف عبر النداءات", notificationMessageId("abc") === notificationMessageId("abc"));
const passthrough = buildMehlaOutgoingMessage(
  { to: "u@example.com", identity: "system", subject: "س", html: "", text: "" },
  "support@mehlalex.com",
  "<kept-exactly@mehlalex.com>",
);
check("المعرّف المُمرَّر يُستخدم حرفياً", passthrough.messageId === "<kept-exactly@mehlalex.com>");
check(
  "لا ادّعاء تفرّد من المزوّد",
  !/idempotenc/i.test(MAILER_SRC.replace(/التفرّد يبقى على طبقة مِهلة/g, "")),
);

console.log("\n12) عنوان مستلم غير صالح يُرفض نهائياً قبل الاتصال");
process.env["MAIL_SYSTEM_REPLY_TO"] = "support@mehlalex.com";
const badTo = await sendMehlaEmail({
  to: "not-an-email",
  identity: "system",
  subject: "س",
  html: "",
  text: "",
});
check(
  "رفض نهائي",
  !badTo.ok && badTo.errorClass === "PERMANENT" && badTo.errorCode === "smtp_rejected_recipient",
);
delete process.env["MAIL_SYSTEM_REPLY_TO"];

console.log("\n13) خلو النتائج من الأسرار");
const secret = "test-password-not-real";
const serialized = JSON.stringify([systemSend, badTo]);
check("لا كلمة مرور في النتائج", !serialized.includes(secret));
check("لا اسم مستخدم مع كلمة مرور خام في النصوص", !serialized.includes("AUTH"));
check("التعقيم مُستخدم في المُرسل", MAILER_SRC.includes("redactTransportError"));

console.log("\n14) انحدار البريد البشري وعدم تحويل sendAppEmail");
check("مسار Hostinger البشري كما هو", WORKSPACE_SRC.includes("sendViaHostinger"));
check(
  "المرفقات البشرية كما هي",
  HOSTINGER_SRC.includes("attachments") || WORKSPACE_SRC.includes("buildAttachmentSection"),
);
check("لا استخدام للمُرسل الكنسي في مسار email_outbox", !WORKSPACE_SRC.includes("mehla-mailer"));
check(
  "sendAppEmail لم يُحوَّل بعد",
  readFileSync("src/lib/email/app-email.server.ts", "utf8").includes("@lovable.dev"),
);

console.log(
  failures === 0 ? "\nالنتيجة: نجحت جميع الفحوص ✅\n" : `\nالنتيجة: ${failures} فحص فاشل ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);
