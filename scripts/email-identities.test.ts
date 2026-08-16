/**
 * فحوص هويات المُرسل — سياسة الهويات المعتمدة لمِهلة.
 * قراءة مصدر فقط: بلا اتصال SMTP وبلا أي إرسال بريد.
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
}
const read = (path: string): string => readFileSync(path, "utf8");

const identityOf = (path: string, identity: string): boolean =>
  new RegExp(`identity:\\s*"${identity}"`).test(read(path));

console.log("1) هويات مسارات الأعمال");
check("INVITATION_IDENTITY = system", identityOf("src/lib/invitations.server.ts", "system"));
check(
  "دعوة الفريق لا تستخدم هوية أخرى",
  !/identity:\s*"(?!system")/.test(read("src/lib/invitations.server.ts")),
);
check("BILLING_IDENTITY = billing", identityOf("src/lib/billing/billing.server.ts", "billing"));
check("SALES_IDENTITY = sales", identityOf("src/lib/sales-docs.server.ts", "sales"));
check("OFFICE_LEAD_IDENTITY = info", identityOf("src/lib/office-lead-email.server.ts", "info"));
check(
  "طلب الاستشارة لا يستخدم هوية المبيعات",
  !identityOf("src/lib/office-lead-email.server.ts", "sales"),
);

console.log("\n2) هويات تنبيهات البريد");
const { identityForNotificationEvent } =
  await import("../src/lib/notifications/email-channel.shared");
check(
  "GENERIC_NOTIFICATION_IDENTITY = system",
  identityForNotificationEvent("team_member_joined") === "system",
);
check(
  "تنبيه إنشاء التذكرة = system",
  identityForNotificationEvent("support_ticket_created") === "system",
);
check(
  "SUPPORT_REPLY_IDENTITY = support",
  identityForNotificationEvent("support_reply") === "support",
);
check(
  "support_new_reply = support",
  identityForNotificationEvent("support_new_reply") === "support",
);
check("حدث غير معروف يعود للنظام", identityForNotificationEvent("unknown_event") === "system");
const WORKER = read("src/lib/notifications/email-worker.server.ts");
check(
  "العامل يمرّر الهوية المحسوبة للحدث",
  WORKER.includes("identity: identityForNotificationEvent(notification.type)"),
);

console.log("\n3) المصادقة بالصندوق الكنسي");
const MAILER = read("src/lib/email/transport/mehla-mailer.server.ts");
check("الصندوق الكنسي noreply@mehlalex.com", MAILER.includes("`noreply@${MEHLA_MAIL_DOMAIN}`"));
check(
  "كل إرسال يصادق بالصندوق الكنسي",
  MAILER.includes("smtpSend(message, CANONICAL_SMTP_MAILBOX)"),
);
check("لا مصادقة بأي اسم مستعار", !/smtpSend\(message,\s*identityAddress/.test(MAILER));
check("المظروف بالصندوق الكنسي", MAILER.includes("result.envelopeFrom ?? CANONICAL_SMTP_MAILBOX"));

console.log(
  failures === 0 ? "\nالنتيجة: نجحت جميع الفحوص ✅\n" : `\nالنتيجة: ${failures} فحص فاشل ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);
