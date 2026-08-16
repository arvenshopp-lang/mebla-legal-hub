/**
 * اختبارات مستهدفة للمرحلة 2 — منطق التذكيرات فقط.
 * لا إرسال بريد، ولا إعادة اختبار لأي مسار سبق التحقق منه.
 */
import { riyadhDaysBetween } from "../src/lib/format";
import {
  isEmailEnabledEvent,
  identityForNotificationEvent,
  templateKeyForEvent,
} from "../src/lib/notifications/email-channel.shared";
import { templateDefinition } from "../src/lib/notifications/email-worker.server";
import {
  anyChannelEnabled,
  preferenceEnabled,
} from "../src/lib/notifications/reminder-generator.server";
import {
  DEADLINE_REMINDER_EVENTS,
  HEARING_REMINDER_EVENTS,
  REMINDER_COPY,
  TASK_OVERDUE_EVENT,
  reminderDedupKey,
  thresholdForDaysAhead,
} from "../src/lib/notifications/reminders.shared";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean) => {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.error("FAIL:", name);
  }
};

/* ---------------------------------------------- حساب العتبات بحدود الرياض */
// 2026-08-16T21:30Z = 2026-08-17 00:30 بتوقيت الرياض → «اليوم» رياضياً هو 17
const now = new Date("2026-08-16T21:30:00Z");
check("same-day: بعد منتصف ليل الرياض", riyadhDaysBetween(now, "2026-08-17T09:00:00Z") === 0);
check("1d بتوقيت الرياض", riyadhDaysBetween(now, "2026-08-18T09:00:00Z") === 1);
check("3d بتوقيت الرياض", riyadhDaysBetween(now, "2026-08-20T09:00:00Z") === 3);
check("7d بتوقيت الرياض", riyadhDaysBetween(now, "2026-08-24T09:00:00Z") === 7);
// حدود UTC ستعطي فارقاً مختلفاً لهذه اللحظة، وهو ما يثبت اعتماد الرياض
check(
  "حدود الرياض لا حدود UTC",
  riyadhDaysBetween(now, "2026-08-17T02:00:00Z") === 0 &&
    Math.round(
      (Date.UTC(2026, 7, 17) - Date.UTC(2026, 7, 16)) / 86_400_000,
    ) === 1,
);
check("عتبة 2 يوم غير مدعومة", thresholdForDaysAhead(2) === null);
check("تاريخ ماضٍ لا يُنتج عتبة", thresholdForDaysAhead(-1) === null);
check("العتب الأربع مدعومة", [7, 3, 1, 0].every((d) => thresholdForDaysAhead(d) === d));

/* ---------------------------------------------------------- منع التكرار */
const k1 = reminderDedupKey({
  organizationId: "org-1",
  entity: "hearing",
  entityId: "h-1",
  suffix: "3d",
});
check("مفتاح حتمي متطابق", k1 === reminderDedupKey({ organizationId: "org-1", entity: "hearing", entityId: "h-1", suffix: "3d" }));
check("العتبة تُغيّر المفتاح", k1 !== reminderDedupKey({ organizationId: "org-1", entity: "hearing", entityId: "h-1", suffix: "1d" }));
check("المكتب يُغيّر المفتاح", k1 !== reminderDedupKey({ organizationId: "org-2", entity: "hearing", entityId: "h-1", suffix: "3d" }));
check("نوع الكيان يُغيّر المفتاح", k1 !== reminderDedupKey({ organizationId: "org-1", entity: "deadline", entityId: "h-1", suffix: "3d" }));
check("المهمة المتأخرة مفتاح واحد لا يتغير", reminderDedupKey({ organizationId: "o", entity: "task", entityId: "t", suffix: "overdue" }) === "rem:o:task:t:overdue");

/* --------------------------------------------------------- التفضيلات OFF */
const prefs = new Map<string, Record<string, boolean> & { organization_id: string; user_id: string }>();
prefs.set("org-1:u-1", {
  organization_id: "org-1",
  user_id: "u-1",
  hearing_3_days: false,
  hearing_7_days: true,
  task_overdue: false,
  deadline_same_day: true,
  in_app_enabled: true,
  email_enabled: true,
});
prefs.set("org-1:u-2", {
  organization_id: "org-1",
  user_id: "u-2",
  in_app_enabled: false,
  email_enabled: false,
});
check("تفضيل 3d مُوقف يمنع الحدث", !preferenceEnabled(prefs, "org-1", "u-1", "hearing_reminder_3d"));
check("تفضيل 7d مفعّل يسمح", preferenceEnabled(prefs, "org-1", "u-1", "hearing_reminder_7d"));
check("تفضيل المهام المتأخرة مُوقف", !preferenceEnabled(prefs, "org-1", "u-1", "task_overdue"));
check("غياب الصف = مفعّل", preferenceEnabled(prefs, "org-9", "u-9", "deadline_reminder_1d"));
check("إيقاف القناتين يمنع الإشعار", !anyChannelEnabled(prefs, "org-1", "u-2"));
check("قناة واحدة تكفي", anyChannelEnabled(prefs, "org-1", "u-1"));

/* --------------------------------------------- الأحداث والقوالب والهويات */
const events = [
  ...Object.values(HEARING_REMINDER_EVENTS),
  ...Object.values(DEADLINE_REMINDER_EVENTS),
  TASK_OVERDUE_EVENT,
];
check("عشرة أحداث تذكير (٩ ببريد + خامل غير منفّذ)", events.length === 9);
for (const event of events) {
  check(`${event}: مسموح بالبريد`, isEmailEnabledEvent(event));
  const key = templateKeyForEvent(event);
  check(`${event}: قالب موجود`, Boolean(key && templateDefinition(key)));
  check(`${event}: هوية النظام`, identityForNotificationEvent(event) === "system");
  const copy = REMINDER_COPY[event];
  check(`${event}: نص آمن`, copy.title.length > 0 && !/عميل|رقم القضية|مبلغ/.test(copy.message));
}
check("القضايا الخاملة بلا بريد لعدم وجود عتبة", !isEmailEnabledEvent("case_inactive"));

console.log(`\nنتيجة: ${passed} ناجح / ${failed} فاشل`);
if (failed > 0) process.exit(1);
