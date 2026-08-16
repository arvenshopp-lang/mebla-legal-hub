/**
 * اختبارات تحويل مزوّد بريد التطبيق (BATCH B) — sendAppEmail عبر Hostinger SMTP.
 * التشغيل: bun run app-email:test
 *
 * بلا شبكة فعلية، بلا إرسال بريد، بلا قاعدة بيانات، بلا هجرة.
 */
import { readFileSync } from "node:fs";
import React from "react";
import { render } from "@react-email/render";

process.env["MAIL_SYSTEM_REPLY_TO"] = "support@mehlalex.com";

const { sendAppEmail, deterministicMessageId, APP_EMAIL_PROVIDER, DEFAULT_APP_EMAIL_IDENTITY } =
  await import("@/lib/email/app-email.server");
const { buildMehlaOutgoingMessage, identityReplyTo, identityAddress, notificationMessageId } =
  await import("@/lib/email/transport/mehla-mailer.server");
const { NotificationTeamMemberJoinedEmail } =
  await import("@/lib/email-templates/notification-team-member-joined");

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

const APP_EMAIL_SRC = readFileSync("src/lib/email/app-email.server.ts", "utf8");
const WORKER_SRC = readFileSync("src/lib/notifications/email-worker.server.ts", "utf8");
const WORKSPACE_SRC = readFileSync("src/lib/email/workspace.server.ts", "utf8");

console.log("\n1) لا اعتماد على المزوّد المُدار داخل sendAppEmail");
check("لا استيراد @lovable.dev", !APP_EMAIL_SRC.includes("@lovable.dev"));
check("لا نداء sendLovableEmail", !APP_EMAIL_SRC.includes("sendLovableEmail"));
check("لا LOVABLE_API_KEY", !APP_EMAIL_SRC.includes("LOVABLE_API_KEY"));
check("لا LOVABLE_SEND_URL", !APP_EMAIL_SRC.includes("LOVABLE_SEND_URL"));
check("لا sender_domain", !APP_EMAIL_SRC.includes("sender_domain"));
check("تفويض للمُرسل الكنسي", APP_EMAIL_SRC.includes("sendMehlaEmail("));
check("المزوّد المعلن Hostinger", APP_EMAIL_PROVIDER === "hostinger_smtp");

console.log("\n2) الهوية الافتراضية والمُرسل وعنوان الرد");
check("الهوية الافتراضية system", DEFAULT_APP_EMAIL_IDENTITY === "system");
check("From الافتراضي", identityAddress(DEFAULT_APP_EMAIL_IDENTITY) === "noreply@mehlalex.com");
const systemReply = identityReplyTo("system");
check(
  "Reply-To الافتراضي",
  systemReply.ok === true && systemReply.replyTo === "support@mehlalex.com",
);
const built = buildMehlaOutgoingMessage(
  { to: "u@example.com", identity: DEFAULT_APP_EMAIL_IDENTITY, subject: "س", html: "", text: "" },
  "support@mehlalex.com",
  "<x@mehlalex.com>",
);
check("ترويسة From للنظام", built.from === "noreply@mehlalex.com");
check("ترويسة Reply-To للنظام", built.replyTo === "support@mehlalex.com");

console.log("\n3) عرض قوالب React Email ما زال يعمل بلا تكرار منطق");
const html = await render(
  React.createElement(NotificationTeamMemberJoinedEmail, {
    actionUrl: "https://app.mehlalex.com/team",
  }),
);
const text = await render(
  React.createElement(NotificationTeamMemberJoinedEmail, {
    actionUrl: "https://app.mehlalex.com/team",
  }),
  { plainText: true },
);
check("HTML مُولّد", html.includes("<html") || html.includes("<!DOCTYPE"));
check("نص بديل مُولّد", text.trim().length > 0);
check(
  "العرض مرة واحدة فقط داخل sendAppEmail",
  (APP_EMAIL_SRC.match(/render\(/g) ?? []).length === 2,
);

console.log("\n4) معرّف الرسالة");
const idA = await deterministicMessageId("notif-email:abc");
const idB = await deterministicMessageId("notif-email:abc");
check("حتمي لنفس المفتاح", idA === idB);
check("مختلف لمفتاح آخر", idA !== (await deterministicMessageId("notif-email:xyz")));
check("مطابق لـ RFC ونطاق مِهلة", /^<app-[0-9a-f]{40}@mehlalex\.com>$/.test(idA));
check("لا كشف للمفتاح الخام", !idA.includes("abc"));
check(
  "العامل يستخدم المعرّف الحتمي للتنبيه",
  WORKER_SRC.includes("messageId: notificationMessageId(item.notification_id)"),
);
check("صيغة معرّف التنبيه محفوظة", notificationMessageId("n1") === "<notif-n1@mehlalex.com>");

console.log("\n5) تصنيف الأعطال عبر sendAppEmail (بلا شبكة)");
const element = React.createElement(NotificationTeamMemberJoinedEmail, {
  actionUrl: "https://app.mehlalex.com/team",
});
const badRecipient = await sendAppEmail({
  to: "not-an-email",
  subject: "س",
  element,
  idempotencyKey: "k-bad",
});
check(
  "رفض المستلم نهائي",
  !badRecipient.sent &&
    badRecipient.errorClass === "PERMANENT" &&
    badRecipient.reason === "smtp_rejected_recipient",
  badRecipient,
);
check("رفض المستلم لا يُسجَّل كعطل نظام", badRecipient.ref === undefined);

delete process.env["MAIL_SYSTEM_REPLY_TO"];
const misconfigured = await sendAppEmail({
  to: "user@example.com",
  subject: "س",
  element,
  idempotencyKey: "k-config",
});
process.env["MAIL_SYSTEM_REPLY_TO"] = "support@mehlalex.com";
check(
  "عطل الإعداد مُصنّف نظاماً",
  !misconfigured.sent &&
    misconfigured.errorClass === "SYSTEM_CONFIGURATION_FAILURE" &&
    misconfigured.reason === "mail_system_reply_to_not_configured",
  misconfigured,
);
check("عطل الإعداد ليس رفض مستلم", misconfigured.reason !== "smtp_rejected_recipient");
check(
  "العامل يؤجّل عطل الإعداد بلا استهلاك محاولة",
  WORKER_SRC.includes('result.errorClass === "SYSTEM_CONFIGURATION_FAILURE"') &&
    WORKER_SRC.includes("reschedule(db, item, code, 300_000)"),
);
check("العامل يقرر الإعادة من صنف العطل", WORKER_SRC.includes('result.errorClass === "RETRYABLE"'));
check(
  "لا رموز مزوّد مُختلقة في مسار التطبيق",
  !APP_EMAIL_SRC.includes("recipient_suppressed") && !APP_EMAIL_SRC.includes("emails_disabled"),
);

console.log("\n6) خلو النتائج من الأسرار وعدم تغيّر البريد البشري");
const serialized = JSON.stringify([badRecipient, misconfigured]);
check("لا كلمة مرور", !/MAIL_PASSWORD|password/i.test(serialized));
check("لا بيانات مصادقة", !serialized.includes("AUTH"));
check("مسار email_outbox البشري كما هو", WORKSPACE_SRC.includes("sendViaHostinger"));
check("رجوع Lovable البشري لم يُحذف بعد", WORKSPACE_SRC.includes("sendLovableEmail"));

console.log("\n7) مستدعو sendAppEmail بلا تغيير في عقدهم");
for (const file of [
  "src/lib/invitations.server.ts",
  "src/lib/billing/billing.server.ts",
  "src/lib/sales-docs.server.ts",
  "src/lib/office-lead-email.server.ts",
]) {
  const src = readFileSync(file, "utf8");
  check(`${file} يمرّر idempotencyKey`, /idempotencyKey/.test(src));
  check(`${file} بلا استيراد مزوّد مُدار`, !src.includes("@lovable.dev"));
}

console.log(
  failures === 0 ? "\nالنتيجة: نجحت جميع الفحوص ✅\n" : `\nالنتيجة: ${failures} فحص فاشل ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);
