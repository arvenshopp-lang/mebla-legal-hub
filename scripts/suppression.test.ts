/**
 * Batch C1 — فحوص حجب المستلمين المملوك لمِهلة والهويات التجارية.
 * فحوص ثابتة على المصدر ودلالات مشتركة: لا اتصال بقاعدة بيانات ولا إرسال بريد.
 */
import { readFileSync } from "node:fs";
import {
  blocksCategory,
  isLiftableReason,
  isSuppressionReason,
  looksLikeAddress,
  maskAddress,
  normalizeAddress,
  qualifiesAsHardBounce,
} from "../src/lib/email/suppression.shared";

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures += 1;
}
const read = (path: string): string => readFileSync(path, "utf8");

console.log("\n1) تطبيع العناوين وتقنيعها");
check("تطبيع كنسي", normalizeAddress("  Owner@Mehlalex.COM ") === "owner@mehlalex.com");
check("عنوان صالح", looksLikeAddress("a@b.com"));
check("عنوان بمسافة مرفوض", !looksLikeAddress("a b@c.com"));
check("التقنيع لا يكشف الاسم كاملاً", maskAddress("owner@mehlalex.com") === "ow•••@mehlalex.com");

console.log("\n2) أسباب الحجب ورفعه");
check("سبب معروف", isSuppressionReason("bounce_hard"));
check("سبب مجهول مرفوض", !isSuppressionReason("whatever"));
check("الشكوى غير قابلة للرفع", !isLiftableReason("complaint"));
check("الحجب اليدوي قابل للرفع", isLiftableReason("manual"));
check("إلغاء الاشتراك قابل للرفع", isLiftableReason("unsubscribe"));

console.log("\n3) فئات الإرسال");
check("إلغاء الاشتراك يحجب البريد البشري", blocksCategory("unsubscribe", "human_mail"));
check("إلغاء الاشتراك لا يحجب الفوترة", !blocksCategory("unsubscribe", "billing"));
check("إلغاء الاشتراك لا يحجب دعوة الفريق", !blocksCategory("unsubscribe", "team_invitation"));
check("الارتداد الصلب يحجب الفوترة", blocksCategory("bounce_hard", "billing"));
check("الشكوى تحجب كل الفئات", blocksCategory("complaint", "team_invitation"));

console.log("\n4) شرط الارتداد الصلب");
check(
  "رفض 550 للمستلم ارتداد صلب",
  qualifiesAsHardBounce({ errorCode: "smtp_rejected_recipient", smtpCode: 550 }),
);
check(
  "رفض 450 مؤقت ليس ارتداداً صلباً",
  !qualifiesAsHardBounce({ errorCode: "smtp_rejected_recipient", smtpCode: 450 }),
);
check(
  "عطل اتصال ليس ارتداداً",
  !qualifiesAsHardBounce({ errorCode: "smtp_connect_failed", smtpCode: 550 }),
);

console.log("\n5) استقلال طبقة الحجب عن أي مزوّد");
const SUPPRESSION_SRC = read("src/lib/email/suppression.server.ts");
check("لا استيراد مزوّد مُدار", !SUPPRESSION_SRC.includes("@lovable.dev/email-js"));
check("يعتمد جدول مِهلة", SUPPRESSION_SRC.includes("email_suppressions"));
check("الرفع بلا حذف سجل", !/\.delete\(\)/.test(SUPPRESSION_SRC));
check("الرفع يضبط lifted_at", SUPPRESSION_SRC.includes("lifted_at"));

console.log("\n6) البريد البشري بلا مسار احتياطي مُدار");
const WORKSPACE_SRC = read("src/lib/email/workspace.server.ts");
check("لا مزوّد مُدار", !/sendLovableEmail|lovable_managed|LOVABLE_API_KEY/.test(WORKSPACE_SRC));
check("Hostinger هو النقل الوحيد", WORKSPACE_SRC.includes('"smtp_hostinger"'));
check("عطل الإعداد لا يستهلك محاولة", WORKSPACE_SRC.includes("classification.configuration"));
check("التقاط الارتداد الصلب مربوط", WORKSPACE_SRC.includes("captureHardBounce"));

console.log("\n7) فحص الحجب لا يُتخطّى في الواجهة");
const FUNCTIONS_SRC = read("src/lib/email/email.functions.ts");
check(
  "لا تخطي بحجة تهيئة النقل",
  !/transportConfigured\(address\)\)\s*return/.test(FUNCTIONS_SRC) &&
    FUNCTIONS_SRC.includes("recipientStates"),
);

console.log("\n8) هويات المسارات التجارية");
const identityOf = (path: string, identity: string): boolean =>
  new RegExp(`identity:\\s*"${identity}"`).test(read(path));
check("الفوترة تستخدم هوية billing", identityOf("src/lib/billing/billing.server.ts", "billing"));
check("المبيعات تستخدم هوية sales", identityOf("src/lib/sales-docs.server.ts", "sales"));
check("طلبات الاستشارة هوية sales", identityOf("src/lib/office-lead-email.server.ts", "sales"));
check("دعوات الفريق هوية support", identityOf("src/lib/invitations.server.ts", "support"));

console.log("\n9) هجرة الحجب (مصدر فقط)");
const MIGRATION = read("supabase/migrations/20260816021500_email_suppressions.sql");
check("RLS مفعّل", MIGRATION.includes("ENABLE ROW LEVEL SECURITY"));
check("لا صلاحية للمتصفح", !/GRANT[^;]*TO\s+(anon|authenticated)/i.test(MIGRATION));
check(
  "صلاحية دور الخدمة",
  /GRANT ALL ON public\.email_suppressions TO service_role/.test(MIGRATION),
);
check("الحذف ممنوع بمشغّل", MIGRATION.includes("الحذف ممنوع"));
check("حجب فعّال واحد لكل سبب", MIGRATION.includes("email_suppressions_active_unique"));

console.log(
  failures === 0 ? "\nالنتيجة: نجحت جميع الفحوص ✅\n" : `\nالنتيجة: ${failures} فحص فاشل ❌\n`,
);
process.exit(failures === 0 ? 0 : 1);
