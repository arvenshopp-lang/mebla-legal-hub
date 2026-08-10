/**
 * FEATURE 02 — اختبار محرك الأداء (دوال نقية، بلا قاعدة بيانات).
 * التشغيل: bun scripts/e2e/f02_kpi_engine.e2e.ts
 */
import { computeMemberKpi, evaluateItem, rankMembers, type WorkEvent, type WorkItemInput } from "../../src/lib/kpi/kpi.engine";
import { resolvePeriod, KpiPeriodError } from "../../src/lib/kpi/kpi.shared";

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL — ${name}`, detail ?? "");
  }
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const iso = (offsetDays: number, base = Date.parse("2026-06-15T09:00:00.000Z")) =>
  new Date(base + offsetDays * 86400000).toISOString();

const period = { from: iso(-30), to: iso(1) };
const boundary = iso(0);

function item(id: string, type: "task" | "deadline", events: WorkEvent[], createdBy: string | null = null): WorkItemInput {
  return { itemType: type, id, title: id, caseId: null, caseTitle: null, createdBy, events };
}

const ev = (partial: Partial<WorkEvent> & { event: WorkEvent["event"]; occurredAt: string }): WorkEvent => ({
  actorId: null,
  actorRole: null,
  fromUserId: null,
  toUserId: null,
  fromDueDate: null,
  toDueDate: null,
  ...partial,
});

/* 1) إنجاز في الموعد وإنجاز متأخر */
const onTime = evaluateItem(
  item("t1", "task", [
    ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "completed", occurredAt: iso(-6), toUserId: A }),
  ]),
  boundary,
);
check("مهمة أُنجزت قبل الموعد = في الموعد", onTime.state === "completed_on_time", onTime.state);

const late = evaluateItem(
  item("t2", "task", [
    ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "completed", occurredAt: iso(-2), toUserId: A }),
  ]),
  boundary,
);
check("مهمة أُنجزت بعد الموعد = متأخرة", late.state === "completed_late", late.state);
check("حساب أيام التأخير", Math.round(late.delayDays ?? 0) === 3, late.delayDays);

/* 2) تمديد الموعد: مشروع من مدير قبل الاستحقاق، مرفوض بعد التأخر */
const legitExtension = evaluateItem(
  item("t3", "task", [
    ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "due_changed", occurredAt: iso(-7), actorRole: "admin", fromDueDate: iso(-5), toDueDate: iso(-1) }),
    ev({ event: "completed", occurredAt: iso(-2), toUserId: A }),
  ]),
  boundary,
);
check("تمديد مشروع قبل الاستحقاق يُعتمد", legitExtension.state === "completed_on_time" && legitExtension.dueExtended);

const illegitExtension = evaluateItem(
  item("t4", "task", [
    ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "due_changed", occurredAt: iso(-3), actorRole: "admin", fromDueDate: iso(-5), toDueDate: iso(2) }),
  ]),
  boundary,
);
check(
  "تمديد بعد فوات الموعد لا يمحو التأخير",
  illegitExtension.state === "overdue" && illegitExtension.extensionRejected,
  illegitExtension,
);

const nonManagerExtension = evaluateItem(
  item("t5", "task", [
    ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "due_changed", occurredAt: iso(-6), actorRole: "lawyer", fromDueDate: iso(-5), toDueDate: iso(5) }),
  ]),
  boundary,
);
check("تمديد من غير مدير لا يُعتمد في التقييم", nonManagerExtension.state === "overdue", nonManagerExtension.state);

/* 3) إعادة الإسناد: خلال 72 ساعة أو بعد التأخر لا تُحمّل العضو الجديد */
const lateReassign = evaluateItem(
  item("t6", "task", [
    ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "assigned", occurredAt: iso(-4), fromUserId: A, toUserId: B }),
  ]),
  boundary,
);
check("إسناد بعد فوات الموعد يُنسب للمسؤول السابق", lateReassign.ownerId === A, lateReassign.ownerId);

const graceReassign = evaluateItem(
  item("t7", "task", [
    ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "assigned", occurredAt: iso(-6), fromUserId: A, toUserId: B }),
  ]),
  boundary,
);
check("إسناد قبل الموعد بأقل من 72 ساعة يُنسب للسابق", graceReassign.ownerId === A, graceReassign.ownerId);

const fairReassign = evaluateItem(
  item("t8", "task", [
    ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-5) }),
    ev({ event: "assigned", occurredAt: iso(-12), fromUserId: A, toUserId: B }),
  ]),
  boundary,
);
check("إسناد مبكر يُنسب للمسؤول الجديد", fairReassign.ownerId === B, fairReassign.ownerId);

/* 4) الإلغاء بعد التأخر يبقى فوتاً، وقبله لا يُعاقب */
const cancelledAfterDue = evaluateItem(
  item("d1", "deadline", [
    ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-6) }),
    ev({ event: "cancelled", occurredAt: iso(-2), toUserId: A }),
  ]),
  boundary,
);
check("إلغاء مهلة فائتة يُحتسب فوتاً", cancelledAfterDue.missedBeforeClosure === true);

const cancelledBeforeDue = evaluateItem(
  item("d2", "deadline", [
    ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-2) }),
    ev({ event: "cancelled", occurredAt: iso(-10), toUserId: A }),
  ]),
  boundary,
);
check("إلغاء قبل الاستحقاق لا يُعاقب", cancelledBeforeDue.missedBeforeClosure === false);

/* 5) الأعمال الذاتية لا تُحسب في الدرجة */
const selfManaged = evaluateItem(
  item("t9", "task", [ev({ event: "created", occurredAt: iso(-10), toUserId: A, toDueDate: iso(-1) })], A),
  boundary,
);
check("عمل ذاتي مُعلَّم", selfManaged.selfManaged === true);

const memberBase = {
  userId: A,
  fullName: "عضو اختبار",
  jobTitle: null,
  role: "lawyer",
  isFormerMember: false,
  trackedDays: 30,
  activeCases: 2,
};

const selfOnly = computeMemberKpi(memberBase, [selfManaged], period, boundary, null);
check("الأعمال الذاتية لا تُنتج درجة", selfOnly.kpi.score === null, selfOnly.kpi.score);
check("الأعمال الذاتية تظهر في السياق", selfOnly.kpi.context.selfManagedItems === 1);

/* 6) البُعد غير القابل للتطبيق يُستبعد ولا يُعتبر صفراً */
const deadlinesOnly = [
  evaluateItem(
    item("d3", "deadline", [
      ev({ event: "created", occurredAt: iso(-20), toUserId: A, toDueDate: iso(-6) }),
      ev({ event: "completed", occurredAt: iso(-7), toUserId: A }),
    ]),
    boundary,
  ),
];
const naResult = computeMemberKpi(memberBase, deadlinesOnly, period, boundary, null);
check("بلا مهام: بُعدان غير قابلين للتطبيق", naResult.kpi.dimensions.filter((d) => d.value === null).length === 2);
check("الدرجة تُحسب من البُعد المتاح فقط", naResult.kpi.score === 100, naResult.kpi.score);
check("عيّنة أقل من الحد الأدنى = غير مؤهل للترتيب", naResult.kpi.eligible === false);

/* 7) القطعية: نفس المدخلات = نفس المخرجات */
const first = computeMemberKpi(memberBase, deadlinesOnly, period, boundary, null);
const second = computeMemberKpi(memberBase, deadlinesOnly, period, boundary, null);
check("الحساب قطعي", JSON.stringify(first.kpi) === JSON.stringify(second.kpi));

/* 8) الترتيب: تعادل الدرجات يمنح نفس الرقم */
const ranked = rankMembers([
  { ...first.kpi, userId: A, score: 90, sampleItems: 10 },
  { ...first.kpi, userId: B, score: 90, sampleItems: 10 },
  { ...first.kpi, userId: "33333333-3333-4333-8333-333333333333", score: 70, sampleItems: 10 },
]);
check("تعادل الدرجات = نفس الترتيب", ranked[0]?.rank === 1 && ranked[1]?.rank === 1 && ranked[2]?.rank === 2, ranked.map((r) => r.rank));

/* 9) الفترات */
const resolved = resolvePeriod("last_month", undefined, new Date("2026-06-15T12:00:00.000Z"));
check("الشهر الماضي يبدأ وينتهي بالشهر الصحيح", resolved.current.from.startsWith("2026-04-30") || resolved.current.from.startsWith("2026-05-01"), resolved.current);
check("فترة المقارنة بنفس الطول", Math.abs(
  new Date(resolved.current.to).getTime() - new Date(resolved.current.from).getTime() -
  (new Date(resolved.previous.to).getTime() - new Date(resolved.previous.from).getTime()),
) < 1000);

let periodRejected = false;
try {
  resolvePeriod("custom", { from: "2020-01-01", to: "2026-01-01" });
} catch (error) {
  periodRejected = error instanceof KpiPeriodError;
}
check("الفترة المخصصة الطويلة مرفوضة", periodRejected);

console.log(`\nالنتيجة: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);