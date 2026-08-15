/**
 * اختبارات وحدة لمحرك مؤشر الإنجاز التشغيلي (v1) — دوال نقية، بلا قاعدة بيانات.
 * التشغيل: bun run score:test
 */

import {
  computeIntegrityFactor,
  computeOperationalScore,
  evaluateEligibility,
  resolveEffectiveDue,
  type HearingMetric,
  type ScoreEvent,
  type WorkItemMetric,
} from "../src/lib/operational-score/score.engine";
import {
  DAY_MS,
  INTEGRITY_FACTOR_FLOOR,
  SCORE_WEIGHTS,
  riyadhDayStart,
  resolveScoreWindow,
} from "../src/lib/operational-score/score.shared";

const NOW = "2026-08-15T09:00:00.000Z";
const nowMs = new Date(NOW).getTime();
let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name} ${detail}`);
  }
}

const iso = (msValue: number): string => new Date(msValue).toISOString();
const daysAgo = (d: number): number => nowMs - d * DAY_MS;

function task(
  id: string,
  opts: {
    dueDaysAgo: number;
    completedOffsetMs?: number | null;
    createdOffsetMs?: number;
    status?: string;
    events?: ScoreEvent[];
  },
): WorkItemMetric {
  const due = daysAgo(opts.dueDaysAgo);
  return {
    id,
    itemType: "task",
    createdAt: iso(due - (opts.createdOffsetMs ?? 10 * DAY_MS)),
    dueDate: iso(due),
    completedAt:
      opts.completedOffsetMs === null || opts.completedOffsetMs === undefined
        ? null
        : iso(due + opts.completedOffsetMs),
    status: opts.status ?? (opts.completedOffsetMs != null ? "completed" : "pending"),
    events: opts.events ?? [],
  };
}

function deadline(id: string, opts: Parameters<typeof task>[1]): WorkItemMetric {
  return { ...task(id, opts), itemType: "deadline" };
}

function hearing(id: string, dueDaysAgo: number, status: string, updatedOffsetMs: number | null) {
  const date = daysAgo(dueDaysAgo);
  const h: HearingMetric = {
    id,
    hearingDate: iso(date),
    status,
    updatedAt: updatedOffsetMs === null ? null : iso(date + updatedOffsetMs),
  };
  return h;
}

const HOUR = 60 * 60 * 1000;

// عيّنة أساسية مؤهلة: 20 مهمة + 5 مهل، كلها في موعدها.
const onTimeTasks = Array.from({ length: 20 }, (_, i) =>
  task(`t${i}`, { dueDaysAgo: 10 + i, completedOffsetMs: -1 * HOUR }),
);
const onTimeDeadlines = Array.from({ length: 5 }, (_, i) =>
  deadline(`d${i}`, { dueDaysAgo: 20 + i, completedOffsetMs: -2 * HOUR }),
);
const ORG_OLD = iso(daysAgo(400));

// 1 — نتيجة كاملة
const perfect = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check("1. Perfect score = 100", perfect.score === 100 && perfect.eligible, String(perfect.score));

// 2 — نتيجة مختلطة: 5 مهل (3 في الموعد) + 20 مهمة في الموعد ⇒ 45%*0.6 + 35%*1
const mixed = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [
    ...onTimeDeadlines.slice(0, 3),
    deadline("dl1", { dueDaysAgo: 30, completedOffsetMs: 3 * DAY_MS }),
    deadline("dl2", { dueDaysAgo: 31, completedOffsetMs: null }),
  ],
  hearings: [],
  now: NOW,
});
const mixedExpected = Math.round(((0.6 * 0.45 + 1 * 0.35) / 0.8) * 100);
check(
  "2. Mixed score calculation",
  mixed.score === mixedExpected,
  `${mixed.score} vs ${mixedExpected}`,
);

// 3 — إعادة توزيع الأوزان عند N/A
check(
  "3. N/A dimension reweighting",
  perfect.dimensions.hearings.applied === false &&
    perfect.dimensions.hearings.value === null &&
    perfect.score === 100,
);

// 4 — نشاط غير كافٍ
const sparse = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks.slice(0, 3),
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "4. Insufficient activity",
  sparse.eligible === false &&
    sparse.score === null &&
    sparse.eligibilityReason === "insufficient_items",
  sparse.eligibilityReason,
);

// 5 — عتبة 25 عملاً
const at24 = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks.slice(0, 19),
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "5. Minimum 25 threshold",
  at24.eligibleItems === 24 && at24.eligible === false && perfect.eligibleItems === 25,
  `${at24.eligibleItems}`,
);

// 6 — عتبة المهل/الجلسات = 5
const noDeadlines = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: Array.from({ length: 26 }, (_, i) =>
    task(`x${i}`, { dueDaysAgo: 5 + i, completedOffsetMs: -1 * HOUR }),
  ),
  deadlines: [],
  hearings: [],
  now: NOW,
});
check(
  "6. Minimum deadlines/hearings threshold",
  noDeadlines.eligible === false &&
    noDeadlines.eligibilityReason === "insufficient_deadlines_or_hearings",
  noDeadlines.eligibilityReason,
);

// 7 — استبعاد المهام قصيرة العمر
const shortLived = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: [
    ...onTimeTasks,
    task("short", {
      dueDaysAgo: 9,
      completedOffsetMs: -30 * 60 * 1000,
      createdOffsetMs: 15 * 60 * 1000,
    }),
  ],
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "7. Short-lived task exclusion",
  shortLived.dimensions.tasks.sampleSize === 20,
  String(shortLived.dimensions.tasks.sampleSize),
);

// 8 — تمديد متأخر مثبت: الموعد المعتمد هو السابق ⇒ يُحتسب فوتاً
const lateExtensionItem = deadline("ext", {
  dueDaysAgo: 5,
  completedOffsetMs: -1 * HOUR,
  events: [
    {
      event: "due_changed",
      occurredAt: iso(daysAgo(19)),
      fromDueDate: iso(daysAgo(20)),
      toDueDate: iso(daysAgo(5)),
    },
  ],
});
const effective = resolveEffectiveDue(lateExtensionItem);
check(
  "8. Proven late due-date extension",
  effective.lateExtension === true && effective.effectiveDueMs === daysAgo(20),
);

// 9 — غياب الحدث لا يعاقب
const withoutEvents = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "9. Missing event does NOT penalize",
  withoutEvents.integrityFactor === 1 && withoutEvents.score === 100,
);

// 10 — إعادة فتح مثبتة بعد الإنجاز
const reopened = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: [
    ...onTimeTasks.slice(0, 19),
    task("re", {
      dueDaysAgo: 8,
      completedOffsetMs: -2 * HOUR,
      events: [
        {
          event: "reopened",
          occurredAt: iso(daysAgo(7)),
          fromDueDate: null,
          toDueDate: null,
        },
      ],
    }),
  ],
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "10. Reopened confirmed event handling",
  reopened.integrityFactor < 1 && reopened.score !== null && reopened.score < 100,
  `${reopened.integrityFactor}`,
);

// 11 — حذف مثبت بعد الاستحقاق
const deletedAfterDue = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [
    ...onTimeDeadlines.slice(0, 4),
    deadline("del", {
      dueDaysAgo: 25,
      completedOffsetMs: null,
      status: "active",
      events: [
        { event: "deleted", occurredAt: iso(daysAgo(20)), fromDueDate: null, toDueDate: null },
      ],
    }),
  ],
  hearings: [],
  now: NOW,
});
check(
  "11. Deleted-after-due confirmed handling",
  deletedAfterDue.integrityFactor < 1,
  `${deletedAfterDue.integrityFactor}`,
);

// 12 — أرضية معامل النزاهة
check(
  "12. Integrity factor floor = 0.85",
  computeIntegrityFactor(30, 30) === INTEGRITY_FACTOR_FLOOR && computeIntegrityFactor(0, 30) === 1,
  `${computeIntegrityFactor(30, 30)}`,
);

// 13 — حصر النتيجة 0–100
const worst = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: Array.from({ length: 20 }, (_, i) =>
    task(`w${i}`, { dueDaysAgo: 10 + i, completedOffsetMs: null, status: "pending" }),
  ),
  deadlines: Array.from({ length: 5 }, (_, i) =>
    deadline(`wd${i}`, { dueDaysAgo: 20 + i, completedOffsetMs: null, status: "active" }),
  ),
  hearings: [],
  now: NOW,
});
check(
  "13. Score clamp 0–100",
  worst.score === 0 && perfect.score === 100,
  `${worst.score}/${perfect.score}`,
);

// 14 — جلسة أُنجزت خلال 7 أيام
const hearingsOk = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [],
  hearings: [
    hearing("h1", 30, "completed", 2 * DAY_MS),
    hearing("h2", 29, "postponed", 6 * DAY_MS),
    hearing("h3", 28, "completed", 1 * DAY_MS),
    hearing("h4", 27, "completed", 3 * DAY_MS),
    hearing("h5", 26, "completed", 4 * DAY_MS),
  ],
  now: NOW,
});
check(
  "14. Hearing completed within 7 days",
  hearingsOk.dimensions.hearings.value === 1 && hearingsOk.score === 100,
  `${hearingsOk.dimensions.hearings.value}`,
);

// 15 — جلسة فائتة
const hearingMissed = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [],
  hearings: [
    hearing("h1", 30, "missed", 1 * DAY_MS),
    hearing("h2", 29, "completed", 2 * DAY_MS),
    hearing("h3", 28, "completed", 1 * DAY_MS),
    hearing("h4", 27, "completed", 3 * DAY_MS),
    hearing("h5", 26, "completed", 4 * DAY_MS),
  ],
  now: NOW,
});
check(
  "15. Hearing missed",
  hearingMissed.dimensions.hearings.value === 0.8,
  `${hearingMissed.dimensions.hearings.value}`,
);

// 16 — جلسة بقيت scheduled بعد موعدها
const hearingStale = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [],
  hearings: [
    hearing("h1", 30, "scheduled", null),
    hearing("h2", 29, "completed", 2 * DAY_MS),
    hearing("h3", 28, "completed", 1 * DAY_MS),
    hearing("h4", 27, "completed", 3 * DAY_MS),
    hearing("h5", 26, "completed", 4 * DAY_MS),
  ],
  now: NOW,
});
check(
  "16. Hearing still scheduled after date",
  hearingStale.dimensions.hearings.value === 0.8 &&
    hearingStale.dimensions.hearings.quality === "self_reported",
  `${hearingStale.dimensions.hearings.value}`,
);

// 17 — لا جلسات ⇒ البعد N/A
check(
  "17. No hearings => hearing N/A",
  perfect.dimensions.hearings.applied === false && perfect.dimensions.hearings.sampleSize === 0,
);

// 18 — حدود اليوم بتوقيت الرياض
const win = resolveScoreWindow(NOW);
const startLocalHour = new Date(new Date(win.windowStart).getTime() + 3 * HOUR).getUTCHours();
check(
  "18. Riyadh date boundary",
  startLocalHour === 0 &&
    riyadhDayStart("2026-08-15T00:30:00.000Z").toISOString() === "2026-08-14T21:00:00.000Z",
  `${win.windowStart} / ${startLocalHour}`,
);

// 19 — سجل baseline التاريخي ليس دليلاً سلبياً
const baselineOnly = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks.map((t) => ({
    ...t,
    events: [
      // حدث تغيير موعد بلا موعد سابق مثبت (بيانات تاريخية ناقصة) — يُتجاهل.
      { event: "due_changed", occurredAt: iso(daysAgo(40)), fromDueDate: null, toDueDate: null },
    ] as ScoreEvent[],
  })),
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "19. Historical baseline does not become negative evidence",
  baselineOnly.integrityFactor === 1 && baselineOnly.score === 100,
);

// 20 — ثبات الأوزان
check(
  "20. Formula weights remain 45/35/20",
  SCORE_WEIGHTS.deadlines === 0.45 &&
    SCORE_WEIGHTS.tasks === 0.35 &&
    SCORE_WEIGHTS.hearings === 0.2 &&
    perfect.formulaVersion === "v1",
);

// فحص إضافي: محرك الأهلية مستقل
check(
  "21. Eligibility engine independence",
  evaluateEligibility({
    organizationAgeDays: 40,
    trackingDays: 40,
    eligibleItems: 100,
    deadlinesAndHearings: 50,
    hasMeasurableDimension: true,
  }).reason === "organization_too_new",
);

console.log(`\n${pass} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
