/**
 * فحوص دفعة ما قبل التطبيق لحجب البريد — قراءة مصدر ومنطق مشترك فقط.
 * لا اتصال بقاعدة بيانات، ولا إرسال بريد، ولا تطبيق هجرة.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  blocksCategory,
  qualifiesAsHardBounce,
  SUPPRESSION_REASONS,
} from "../src/lib/email/suppression.shared";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
}
const read = (path: string): string => readFileSync(path, "utf8");

console.log("1) الهجرة المعتمدة للتطبيق (Fix A)");
const SQL_RAW = read("docs/migrations/email-suppressions-apply.sql");
// التعليقات تُستثنى: الفحص يخص SQL التنفيذي فقط.
const SQL = SQL_RAW.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
check("created_by بلا مرجع أجنبي", /created_by uuid,/.test(SQL));
check("lifted_by بلا مرجع أجنبي", /lifted_by uuid,/.test(SQL));
check("لا أي مرجع إلى auth.users", !SQL.includes("auth.users"));
check("لا ON DELETE على حقول الفاعل", !/ON DELETE/i.test(SQL));
check("لا CASCADE يمس تاريخ الحجب", !/CASCADE/i.test(SQL));
check("الحذف الصلب ممنوع بمشغّل", /TG_OP = 'DELETE'[\s\S]*RAISE EXCEPTION/.test(SQL));
check(
  "created_by غير قابل للتعديل",
  /COALESCE\(NEW\.created_by::text[\s\S]*RAISE EXCEPTION 'لا يمكن تعديل بيانات حدث الحجب الأصلي\./.test(
    SQL,
  ),
);
check(
  "الحقائق الأصلية غير قابلة للتعديل",
  ["normalized_address", "address", "reason", "source", "created_at"].every((field) =>
    new RegExp(`NEW\\.${field} <> OLD\\.${field}`).test(SQL),
  ),
);
check("مسار الرفع مسموح (lifted_at/lifted_by ليست في قائمة المنع)", !/NEW\.lifted_by <> OLD\.lifted_by/.test(SQL));
check("لا يُلغى رفع مُسجَّل", /OLD\.lifted_at IS NOT NULL AND NEW\.lifted_at IS NULL/.test(SQL));
check(
  "تفرّد الحجب الفعّال قائم",
  /email_suppressions_active_unique[\s\S]*WHERE lifted_at IS NULL/.test(SQL),
);
check("RLS مفعّل وبلا صلاحيات للمتصفح", SQL.includes("ENABLE ROW LEVEL SECURITY") && !/GRANT[^;]*TO\s+(anon|authenticated)/i.test(SQL));

console.log("\n2) سياسة الفئات (المصدر المشترك الوحيد)");
check("إلغاء الاشتراك لا يمنع دعوة الفريق", !blocksCategory("unsubscribe", "team_invitation"));
check("الارتداد الصلب يمنع دعوة الفريق", blocksCategory("bounce_hard", "team_invitation"));
check("الشكوى تمنع دعوة الفريق", blocksCategory("complaint", "team_invitation"));
check("الحجب اليدوي يمنع دعوة الفريق", blocksCategory("manual", "team_invitation"));
check("إلغاء الاشتراك لا يمنع الفوترة", !blocksCategory("unsubscribe", "billing"));
check("الارتداد الصلب يمنع الفوترة", blocksCategory("bounce_hard", "billing"));
check("إلغاء الاشتراك يمنع المبيعات", blocksCategory("unsubscribe", "sales"));
check("إلغاء الاشتراك يمنع تنبيهات النظام", blocksCategory("unsubscribe", "notification"));
check("أسباب الحجب أربعة فقط", SUPPRESSION_REASONS.length === 4);

console.log("\n3) مواضع الفحص قبل الإرسال");
const INVITES = read("src/lib/invitations.server.ts");
check('الدعوات تستخدم فئة team_invitation', INVITES.includes('recipientStates([email], "team_invitation")'));
const BILLING = read("src/lib/billing/billing.server.ts");
check(
  "الفوترة تفحص فئة billing قبل الإرسال",
  /isRecipientBlocked\([^)]*"billing"\)\) return false;[\s\S]{0,400}sendAppEmail\(/.test(BILLING),
);
const SALES = read("src/lib/sales-docs.server.ts");
check(
  "المبيعات تفحص فئة sales قبل الإرسال",
  /isRecipientBlocked\(toEmail, "sales"\)[\s\S]{0,300}sendAppEmail\(/.test(SALES),
);
const WORKER = read("src/lib/notifications/email-worker.server.ts");
check(
  "التنبيهات تفحص فئة notification قبل الإرسال",
  /isRecipientBlocked\(recipient\.email, "notification"\)[\s\S]{0,500}sendAppEmail\(/.test(WORKER),
);
check("التفضيل ما زال شرطاً مستقلاً", WORKER.includes("isEmailPreferenceEnabled("));
check(
  "تفضيل معطّل يمنع الإرسال قبل فحص الحجب",
  WORKER.indexOf("isEmailPreferenceEnabled(") < WORKER.indexOf('isRecipientBlocked(recipient.email'),
);
check(
  "المستلم المحجوب يُنهى بسبب دائم بلا إعادة محاولة",
  WORKER.includes('"recipient_suppressed"'),
);
check("الهوية لا تتغير في هذه الدفعة", WORKER.includes("identityForNotificationEvent(notification.type)"));

console.log("\n4) الارتداد الصلب بلا انحراف");
check(
  "رفض نهائي 5xx للمستلم يُنتج bounce_hard",
  qualifiesAsHardBounce({ errorCode: "smtp_rejected_recipient", smtpCode: 550 }),
);
check(
  "4xx لا يُنتج حجباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_rejected_recipient", smtpCode: 451 }),
);
check("المهلة لا تُنتج حجباً", !qualifiesAsHardBounce({ errorCode: "smtp_timeout", smtpCode: null }));
check(
  "عطل الاتصال لا يُنتج حجباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_connect_failed", smtpCode: null }),
);
check(
  "عطل المصادقة لا يُنتج حجباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_auth_failed", smtpCode: 535 }),
);
check(
  "رفض المُرسل لا يُنتج حجباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_rejected_sender", smtpCode: 550 }),
);
check(
  "عطل الإعداد لا يُنتج حجباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_not_configured", smtpCode: null }),
);

console.log("\n5) بريد المصادقة بلا تغيير");
// بريد المصادقة يُدار خارج المستودع (قوالب مُدارة)، فالفحص أن لا مسار مصادقة
// في الكود يستهلك نموذج الحجب إطلاقاً.
const AUTH_CONSUMERS = execSync(
  "rg -l 'suppression.server|isRecipientBlocked|recipientStates' src || true",
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
check(
  "لا مسار مصادقة يستخدم نموذج الحجب",
  AUTH_CONSUMERS.every((file) => !/auth|signup|password|magic|reauth/i.test(file)),
);
check(
  "مستهلكو الحجب هم المسارات المعتمدة فقط",
  AUTH_CONSUMERS.every((file) =>
    [
      "src/lib/email/suppression.server.ts",
      "src/lib/email/email.functions.ts",
      "src/lib/email/app-email.server.ts",
      "src/lib/email/workspace.server.ts",
      "src/lib/invitations.server.ts",
      "src/lib/billing/billing.server.ts",
      "src/lib/sales-docs.server.ts",
      "src/lib/notifications/email-worker.server.ts",
    ].includes(file),
  ),
);

console.log(
  failures === 0 ? "\nالنتيجة: نجحت جميع الفحوص ✅\n" : `\nالنتيجة: ${failures} فحص فاشل ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);