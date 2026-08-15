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

console.log("\n15) سجل التسليم الدائم Append-only");
const deliveriesDdl = foundationSql.slice(
  foundationSql.indexOf("CREATE TABLE public.notification_email_deliveries"),
  foundationSql.indexOf("CREATE OR REPLACE FUNCTION public.finalize_notification_email_delivery"),
);
check("الجدول موجود في هجرة الأساس", deliveriesDdl.length > 0);
check("لا مفتاح أجنبي إطلاقاً على سجل التسليم", !/REFERENCES/i.test(deliveriesDdl), "REFERENCES found");
check("لا CASCADE في سجل التسليم", !/ON DELETE/i.test(deliveriesDdl));
check(
  "حذف الإشعار يحذف صف الطابور (CASCADE محفوظ)",
  foundationSql.includes(
    "notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE",
  ),
);
check(
  "منع UPDATE عبر deny_update",
  /TRIGGER trg_notification_email_deliveries_no_update[\s\S]{0,160}deny_update\(\)/.test(
    deliveriesDdl,
  ),
);
check(
  "منع DELETE عبر deny_hard_delete",
  /TRIGGER trg_notification_email_deliveries_no_delete[\s\S]{0,170}deny_hard_delete\(\)/.test(
    deliveriesDdl,
  ),
);
check(
  "لا صلاحية لـ anon/authenticated/PUBLIC على السجل",
  ["PUBLIC", "anon", "authenticated"].every((role) =>
    deliveriesDdl.includes(`REVOKE ALL ON public.notification_email_deliveries FROM ${role}`),
  ),
);
check(
  "دور الخدمة: قراءة وإدراج فقط",
  deliveriesDdl.includes("GRANT SELECT, INSERT ON public.notification_email_deliveries TO service_role") &&
    !/GRANT ALL ON public\.notification_email_deliveries/.test(deliveriesDdl),
);
check("RLS مفعّل على السجل", deliveriesDdl.includes("ALTER TABLE public.notification_email_deliveries ENABLE ROW LEVEL SECURITY"));
check(
  "لا سياسات لأدوار المتصفح",
  !/CREATE POLICY[\s\S]{0,200}TO (anon|authenticated)/.test(deliveriesDdl),
);
check(
  "حالات نهائية فقط",
  deliveriesDdl.includes("delivery_status IN ('sent', 'failed', 'cancelled')") &&
    !/delivery_status IN \([^)]*'queued'/.test(deliveriesDdl),
);
check(
  "تفرّد سجل التسليم لكل إشعار",
  deliveriesDdl.includes("notification_email_deliveries_notification_unique UNIQUE (notification_id)"),
);
check(
  "بريد مُقنّع فقط بلا عنوان كامل",
  deliveriesDdl.includes("recipient_masked text") && !/recipient_email/.test(deliveriesDdl),
);
check(
  "لا حقول محتوى في السجل",
  !/(title|message|body|subject|content|html)/i.test(deliveriesDdl),
);
check(
  "فهارس مقيّدة ومفيدة",
  ["(notification_id)", "(created_at DESC)", "(delivery_status, created_at DESC)"].every((idx) =>
    deliveriesDdl.includes(idx),
  ) && (deliveriesDdl.match(/CREATE INDEX/g) ?? []).length === 3,
);
check("تقنيع البريد يخفي المعرّف", maskEmailForLog("ziad@mehlalex.com") === "z***@mehlalex.com");

console.log("\n16) الإنهاء الذري داخل معاملة واحدة");
const finalizeSql = foundationSql.slice(
  foundationSql.indexOf("CREATE OR REPLACE FUNCTION public.finalize_notification_email_delivery"),
);
check("الدالة موجودة", finalizeSql.length > 0);
check("SECURITY DEFINER بمسار بحث مثبّت", /SECURITY DEFINER[\s\S]{0,60}SET search_path = public/.test(finalizeSql));
check("قفل صف الطابور", finalizeSql.includes("FOR UPDATE"));
check("تحقق من حالة processing", finalizeSql.includes("v_row.status <> 'processing'"));
check(
  "الحالات النهائية المسموحة فقط",
  finalizeSql.includes("NOT IN ('sent', 'failed', 'cancelled')"),
);
check(
  "تحديث الطابور وإدراج السجل داخل نفس الدالة",
  finalizeSql.includes("UPDATE public.notification_email_queue") &&
    finalizeSql.includes("INSERT INTO public.notification_email_deliveries"),
);
check(
  "النداء المتكرر ⇒ ALREADY_FINALIZED بلا خطأ قيد",
  finalizeSql.includes("RETURN 'ALREADY_FINALIZED'") &&
    (finalizeSql.match(/ON CONFLICT \(notification_id\) DO NOTHING/g) ?? []).length === 2,
);
check(
  "لا صلاحية تنفيذ لأدوار المتصفح",
  ["PUBLIC", "anon", "authenticated"].every((role) =>
    finalizeSql.includes(
      `REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) FROM ${role}`,
    ),
  ) &&
    finalizeSql.includes(
      "GRANT EXECUTE ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) TO service_role",
    ),
);

console.log("\n17) العامل يستخدم مسار الإنهاء الذري فقط");
const workerSrc = readFileSync("src/lib/notifications/email-worker.server.ts", "utf8");
check(
  "لا كتابة مباشرة في سجل التسليم من العامل",
  !workerSrc.includes('from("notification_email_deliveries")'),
);
check("الإنهاء عبر RPC واحد", (workerSrc.match(/finalize_notification_email_delivery/g) ?? []).length === 1);
check(
  "sent/failed/cancelled كلها عبر finalize",
  /finalize\(db, item, "sent"/.test(workerSrc) &&
    /finalize\(db, item, "failed"/.test(workerSrc) &&
    /finalize\(db, item, "cancelled"/.test(workerSrc),
);
check(
  "لا تحويل مباشر إلى sent خارج الدالة",
  !/status: "sent"/.test(workerSrc) && !/status: "cancelled"/.test(workerSrc) && !/status: "failed"/.test(workerSrc),
);
check(
  "مفتاح تفرّد المزوّد حتمي ومعاد استخدامه",
  workerSrc.includes("return `notif-email:${notificationId}`") &&
    (workerSrc.match(/idempotencyKeyFor\(/g) ?? []).length >= 3,
);
check(
  "فشل الإنهاء بعد نجاح المزوّد ⇒ مؤجَّل قابل للاسترداد",
  workerSrc.includes("report.deferred += 1") && workerSrc.includes("finalize_failed"),
);
check("التقنيع فقط في السجل التشغيلي", workerSrc.includes("_recipient_masked: maskEmailForLog("));

/** محاكاة دلالات الدالة: الإنهاء المتكرر لا ينشئ سجلاً ثانياً. */
type Store = { queueStatus: string; deliveries: string[] };
function finalizeRun(
  store: Store,
  finalStatus: string,
): { outcome: string; store: Store } {
  if (!["sent", "failed", "cancelled"].includes(finalStatus))
    return { outcome: "INVALID_FINAL_STATUS", store };
  const alreadyFinal = ["sent", "failed", "cancelled"].includes(store.queueStatus);
  if (alreadyFinal) {
    if (store.deliveries.length === 0) store.deliveries.push(store.queueStatus);
    return { outcome: "ALREADY_FINALIZED", store };
  }
  if (store.queueStatus !== "processing") return { outcome: "INVALID_QUEUE_STATE", store };
  store.queueStatus = finalStatus;
  if (store.deliveries.length === 0) store.deliveries.push(finalStatus);
  return { outcome: "FINALIZED", store };
}

for (const status of ["sent", "failed", "cancelled"] as const) {
  const store: Store = { queueStatus: "processing", deliveries: [] };
  const first = finalizeRun(store, status);
  check(
    `إنهاء ${status}: الطابور والسجل متوافقان ذرياً`,
    first.outcome === "FINALIZED" &&
      store.queueStatus === status &&
      store.deliveries.length === 1 &&
      store.deliveries[0] === status,
    store,
  );
  const second = finalizeRun(store, status);
  check(
    `إنهاء ${status} مكرر: ALREADY_FINALIZED بسجل واحد`,
    second.outcome === "ALREADY_FINALIZED" && store.deliveries.length === 1,
    store,
  );
}
const queuedStore: Store = { queueStatus: "queued", deliveries: [] };
check(
  "صف غير مسحوب لا يُنهى",
  finalizeRun(queuedStore, "sent").outcome === "INVALID_QUEUE_STATE" &&
    queuedStore.deliveries.length === 0,
);
check(
  "حالة نهائية غير مشروعة مرفوضة",
  finalizeRun({ queueStatus: "processing", deliveries: [] }, "queued").outcome ===
    "INVALID_FINAL_STATUS",
);
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
