/**
 * اختبارات دفعة ما قبل التطبيق لقناة بريد التنبيهات (المرحلة 1).
 * التشغيل: bun run notif-email:test
 *
 * تغطي: فصل الـ Cron عن هجرة الأساس، قائمة السماح وخرائط القوالب،
 * وسياسة استرجاع الصفوف العالقة كما هي مكتوبة في دالة السحب.
 * لا اتصال بقاعدة بيانات، ولا إرسال بريد، ولا تطبيق هجرة.
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  EMAIL_ENABLED_EVENTS,
  isEmailEnabledEvent,
  isRetryableFailure,
  retryDelayMs,
  templateKeyForEvent,
} from "@/lib/notifications/email-channel.shared";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

const MIGRATIONS_DIR = "supabase/migrations";
const FOUNDATION = `${MIGRATIONS_DIR}/20260815150000_notification_email_queue.sql`;
const ACTIVATION = `${MIGRATIONS_DIR}/20260815181000_notification_emails_cron_activation.sql`;
const foundationSql = readFileSync(FOUNDATION, "utf8");
const activationSql = readFileSync(ACTIVATION, "utf8");

console.log("\n1) هجرة الأساس بلا أي جدولة دورية");
check("لا cron.schedule", !foundationSql.includes("cron.schedule"), "found cron.schedule");
check("لا اسم مهمة", !foundationSql.includes("mehla-notification-emails"));
check("لا net.http_post", !foundationSql.includes("net.http_post"));
check("لا cron.unschedule/alter", !/cron\.(unschedule|alter_job)/.test(foundationSql));

console.log("\n2) هجرة التنشيط منفصلة وتنشئ مهمة واحدة فقط");
const scheduleCount = (activationSql.match(/cron\.schedule\(/g) ?? []).length;
const jobNameCount = (activationSql.match(/mehla-notification-emails/g) ?? []).length;
check("cron.schedule مرة واحدة", scheduleCount === 1, scheduleCount);
check("اسم المهمة مذكور مرتين فقط (إنشاء + حماية التكرار)", jobNameCount === 2, jobNameCount);
check("كل 5 دقائق", activationSql.includes("'*/5 * * * *'"));
check("المسار المحمي الصحيح", activationSql.includes("/api/public/hooks/notification-emails"));
check("سر التشغيل القائم", activationSql.includes("ops.cron_secret()"));
check(
  "لا تعديل هيكلي في هجرة التنشيط",
  !/CREATE TABLE|ALTER TABLE|CREATE POLICY|GRANT |REVOKE /i.test(activationSql),
);

console.log("\n3) هجرة التنشيط أحدث زمنياً من الأساس ولم تُطبَّق");
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const foundationName = FOUNDATION.split("/").pop()!;
const activationName = ACTIVATION.split("/").pop()!;
check(
  "ترتيب زمني صحيح",
  files.indexOf(activationName) > files.indexOf(foundationName),
  files.slice(-3),
);
check(
  "لا مهمة دورية في أي هجرة أخرى",
  files
    .filter((f) => f !== activationName)
    .every(
      (f) => !readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8").includes("mehla-notification-emails"),
    ),
);

console.log("\n4-7) قائمة السماح وخرائط القوالب");
check("support_new_reply مسموح", isEmailEnabledEvent("support_new_reply"));
check("support_reply التاريخي مسموح", isEmailEnabledEvent("support_reply"));
check("support_ticket_created مسموح", isEmailEnabledEvent("support_ticket_created"));
check("team_member_joined مسموح", isEmailEnabledEvent("team_member_joined"));
check(
  "كلا معرّفَي الرد يستخدمان notif-support-reply",
  templateKeyForEvent("support_new_reply") === "notif-support-reply" &&
    templateKeyForEvent("support_reply") === "notif-support-reply",
);
check(
  "أربعة معرّفات فقط وثلاثة قوالب",
  Object.keys(EMAIL_ENABLED_EVENTS).length === 4 &&
    new Set(Object.values(EMAIL_ENABLED_EVENTS)).size === 3,
  EMAIL_ENABLED_EVENTS,
);
for (const excluded of [
  "support_assigned",
  "support_escalated",
  "support_resolved",
  "support_closed",
  "support_csat_requested",
  "platform_broadcast",
  "hearing_reminder",
  "deadline_reminder",
  "task_reminder",
  "case_inactive",
  "office_lead",
]) {
  check(
    `${excluded} غير مؤهل للطابور`,
    !isEmailEnabledEvent(excluded) && templateKeyForEvent(excluded) === null,
  );
}

console.log("\n8-13) سياسة استرجاع الصفوف العالقة كما في دالة السحب");
const STALE = "interval '15 minutes'";
check("مهلة العلوق 15 دقيقة", foundationSql.includes(STALE));
check(
  "إنهاء العالق المستنفد إلى failed",
  /SET status = 'failed',[\s\S]*last_error_code = 'STALE_MAX_ATTEMPTS'[\s\S]*attempts >= q\.max_attempts;/.test(
    foundationSql,
  ),
);
check(
  "تصفير processing_started_at للعالق المستنفد",
  /last_error_code = 'STALE_MAX_ATTEMPTS',[\s\S]{0,120}processing_started_at = NULL/.test(
    foundationSql,
  ),
);
check(
  "إنهاء العالق يسبق السحب",
  foundationSql.indexOf("STALE_MAX_ATTEMPTS") < foundationSql.indexOf("RETURN QUERY"),
);
check(
  "الإنهاء لا يزيد المحاولات ولا يعيدها queued",
  !/last_error_code = 'STALE_MAX_ATTEMPTS',[\s\S]{0,200}(attempts = |status = 'queued')/.test(
    foundationSql,
  ),
);
check("قفل آمن للسحب", foundationSql.includes("FOR UPDATE SKIP LOCKED"));
check(
  "السحب مقصور على المحاولات المتاحة",
  foundationSql.includes("AND q.attempts < q.max_attempts"),
);
check(
  "السحب يزيد المحاولة مرة واحدة",
  (foundationSql.match(/attempts = q\.attempts \+ 1/g) ?? []).length === 1,
);

/** محاكاة سياسة الدالة على صف واحد: ماذا يحدث في تشغيل واحد؟ */
type Row = {
  status: "queued" | "processing" | "sent" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  staleMinutes: number;
};
type Outcome = {
  status: Row["status"];
  attempts: number;
  errorCode: string | null;
  claimed: boolean;
};
function claimRun(row: Row): Outcome {
  let { status, attempts } = row;
  const errorCode: string | null = null;
  const stale = status === "processing" && row.staleMinutes > 15;
  if (stale && attempts >= row.maxAttempts) {
    return { status: "failed", attempts, errorCode: "STALE_MAX_ATTEMPTS", claimed: false };
  }
  const eligible =
    (status === "queued" || (status === "processing" && stale)) && attempts < row.maxAttempts;
  if (!eligible) return { status, attempts, errorCode, claimed: false };
  status = "processing";
  attempts += 1;
  return { status, attempts, errorCode, claimed: true };
}

const retryable = claimRun({ status: "processing", attempts: 1, maxAttempts: 4, staleMinutes: 30 });
check(
  "عالق ومحاولات متاحة ⇒ يُستأنف بزيادة محاولة واحدة",
  retryable.claimed && retryable.status === "processing" && retryable.attempts === 2,
  retryable,
);
const exhausted = claimRun({ status: "processing", attempts: 4, maxAttempts: 4, staleMinutes: 30 });
check(
  "عالق ومحاولات مستنفدة ⇒ failed بلا استئناف",
  !exhausted.claimed && exhausted.status === "failed" && exhausted.attempts === 4,
  exhausted,
);
const overshoot = claimRun({ status: "processing", attempts: 7, maxAttempts: 4, staleMinutes: 90 });
check(
  "عالق بمحاولات أكثر من الحد ⇒ failed دفاعياً",
  !overshoot.claimed && overshoot.status === "failed",
  overshoot,
);
check("رمز الخطأ STALE_MAX_ATTEMPTS", exhausted.errorCode === "STALE_MAX_ATTEMPTS");
const afterFail = claimRun({
  status: exhausted.status,
  attempts: exhausted.attempts,
  maxAttempts: 4,
  staleMinutes: 120,
});
check("الصف الفاشل لا يُسحب مرة أخرى", !afterFail.claimed && afterFail.status === "failed");
const fresh = claimRun({ status: "processing", attempts: 1, maxAttempts: 4, staleMinutes: 2 });
check("صف قيد المعالجة غير عالق لا يُسحب (لا سحب مزدوج)", !fresh.claimed, fresh);
const cancelled = claimRun({ status: "cancelled", attempts: 1, maxAttempts: 4, staleMinutes: 999 });
check("الملغى لا يُسحب", !cancelled.claimed && cancelled.status === "cancelled");
const sent = claimRun({ status: "sent", attempts: 1, maxAttempts: 4, staleMinutes: 999 });
check("المُرسل لا يُسحب", !sent.claimed && sent.status === "sent");

console.log("\n14) اختبارات المرحلة 1 القائمة");
check(
  "تراجع أُسّي 2د/10د/60د",
  retryDelayMs(1) === 120_000 && retryDelayMs(2) === 600_000 && retryDelayMs(3) === 3_600_000,
);
check("التراجع لا يتجاوز 60د", retryDelayMs(9) === 3_600_000);
check("العنوان الموقوف نهائي", !isRetryableFailure("recipient_suppressed"));
check("خطأ الشبكة قابل للإعادة", isRetryableFailure("http_502"));
check("تفرّد الإشعار في القاعدة", foundationSql.includes("UNIQUE (notification_id)"));
check("RLS مفعّل", foundationSql.includes("ENABLE ROW LEVEL SECURITY"));
check(
  "لا صلاحيات لأدوار المتصفح",
  foundationSql.includes("REVOKE ALL ON public.notification_email_queue FROM anon") &&
    foundationSql.includes("REVOKE ALL ON public.notification_email_queue FROM authenticated"),
);

if (failures > 0) {
  console.error(`\n❌ فشل ${failures} تحقق`);
  process.exit(1);
}
console.log("\n✅ كل اختبارات دفعة ما قبل التطبيق ناجحة");
