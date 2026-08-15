/**
 * اختبارات وحدة لمحرك مؤشر الإنجاز التشغيلي (v1) — دوال نقية، بلا قاعدة بيانات.
 * التشغيل: bun run score:test
 */

import {
  assessHearing,
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
  INTEGRITY_FACTOR_NEUTRAL,
  MIN_TRACKING_DAYS,
  SCORE_DIMENSION_HINTS,
  SCORE_WEIGHTS,
  RIYADH_TZ,
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
const HOUR = 60 * 60 * 1000;

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

function hearing(id: string, dueDaysAgo: number, status: string): HearingMetric {
  const date = daysAgo(dueDaysAgo);
  return { id, hearingDate: iso(date), status, createdAt: iso(date - 20 * DAY_MS) };
}

// عيّنة أساسية مؤهلة: 20 مهمة + 5 مهل، كلها في موعدها.
const onTimeTasks = Array.from({ length: 20 }, (_, i) =>
  task(`t${i}`, { dueDaysAgo: 10 + i, completedOffsetMs: -1 * HOUR }),
);
const onTimeDeadlines = Array.from({ length: 5 }, (_, i) =>
  deadline(`d${i}`, { dueDaysAgo: 20 + i, completedOffsetMs: -2 * HOUR }),
);
const ORG_OLD = iso(daysAgo(400));

const perfect = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check("1. Perfect score = 100", perfect.score === 100 && perfect.eligible, String(perfect.score));

// 2 — نافذة الرياض عبر السياسة المركزية (لا إزاحة ثابتة داخل المحرك)
const win = resolveScoreWindow(NOW);
const riyadhHourOf = (v: string): number =>
  Number(
    new Intl.DateTimeFormat("en-CA", { hour: "2-digit", hour12: false, timeZone: RIYADH_TZ }).format(
      new Date(v),
    ),
  ) % 24;
check(
  "2. Riyadh window via central timezone policy",
  riyadhHourOf(win.windowStart) === 0 &&
    riyadhDayStart("2026-08-15T00:30:00.000Z").toISOString() === "2026-08-14T21:00:00.000Z",
  `${win.windowStart}`,
);

// 3 — تمديد متأخر مثبت: يُستخدم الموعد السابق المثبت
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
  "3. Late due extension uses original proven due",
  effective.lateExtension === true && effective.effectiveDueMs === daysAgo(20),
);

// 4 — التمديد المتأخر لا يُنقذ عنصراً فائتاً، ولا يُخصم مرة ثانية من النزاهة
const lateExt = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [...onTimeDeadlines.slice(0, 4), lateExtensionItem],
  hearings: [],
  now: NOW,
});
const lateExtExpected = Math.round(((0.8 * 0.45 + 1 * 0.35) / 0.8) * 100);
check(
  "4. Late extension does not rescue an overdue item",
  lateExt.dimensions.deadlines.value === 0.8 && lateExt.score === lateExtExpected,
  `${lateExt.dimensions.deadlines.value} / ${lateExt.score}`,
);
check(
  "5. Late extension has NO double penalty",
  lateExt.integrityFactor === INTEGRITY_FACTOR_NEUTRAL,
  `${lateExt.integrityFactor}`,
);

// 6 — تعديل الموعد قبل استحقاقه أو تقديمه: لا عقوبة إطلاقاً
const earlyChange = deadline("early", {
  dueDaysAgo: 21,
  completedOffsetMs: -1 * HOUR,
  events: [
    {
      event: "due_changed",
      occurredAt: iso(daysAgo(40)),
      fromDueDate: iso(daysAgo(30)),
      toDueDate: iso(daysAgo(21)),
    },
    {
      event: "due_changed",
      occurredAt: iso(daysAgo(35)),
      fromDueDate: iso(daysAgo(25)),
      toDueDate: iso(daysAgo(28)),
    },
  ],
});
const early = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [...onTimeDeadlines.slice(0, 4), earlyChange],
  hearings: [],
  now: NOW,
});
check(
  "6. Early / bring-forward due change does not penalize",
  resolveEffectiveDue(earlyChange).lateExtension === false &&
    early.score === 100 &&
    early.integrityFactor === INTEGRITY_FACTOR_NEUTRAL,
  `${early.score}`,
);

// 7 — إعادة الفتح وحدها بلا عقوبة نزاهة: الحالة الرسمية فقط تحدد المقياس
const reopenedNotCompleted = task("re-open", {
  dueDaysAgo: 8,
  completedOffsetMs: null,
  status: "in_progress",
});
const reopenedStillCompleted = task("re-done", { dueDaysAgo: 7, completedOffsetMs: -1 * HOUR });
const reopenedRun = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: [...onTimeTasks.slice(0, 19), reopenedNotCompleted, reopenedStillCompleted],
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "7. Reopened alone has NO integrity penalty (metric-only effect)",
  reopenedRun.integrityFactor === INTEGRITY_FACTOR_NEUTRAL &&
    reopenedRun.dimensions.tasks.value === 20 / 21,
  `${reopenedRun.integrityFactor} / ${reopenedRun.dimensions.tasks.value}`,
);

// 8 — الحذف بعد الاستحقاق مؤجَّل من v1
const deletedDeferred = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "8. Deleted-after-due deferred in v1 (no signal consumed)",
  deletedDeferred.integrityFactor === INTEGRITY_FACTOR_NEUTRAL && deletedDeferred.score === 100,
);

// 9 — معامل النزاهة محايد
check(
  "9. integrityFactor = 1.00 in v1",
  computeIntegrityFactor() === 1 && perfect.integrityFactor === 1,
);

// 10..13 — دلالات الجلسات على الحالة الحالية فقط
const winStartMs = new Date(win.windowStart).getTime();
const winEndMs = new Date(win.windowEnd).getTime();
const hs = (status: string) => assessHearing(hearing(`h-${status}`, 30, status), winStartMs, winEndMs);
check("10. Hearing completed = followed up", hs("completed").counted && hs("completed").followedUp);
check("11. Hearing postponed = followed up", hs("postponed").counted && hs("postponed").followedUp);
check(
  "12. Hearing scheduled after date = not followed up",
  hs("scheduled").counted && hs("scheduled").followedUp === false,
);
check(
  "13. Hearing missed = not followed up",
  hs("missed").counted && hs("missed").followedUp === false,
);
check(
  "14. Hearing cancelled = excluded from numerator and denominator",
  hs("cancelled").counted === false && hs("cancelled").followedUp === false,
);

// 15 — لا افتراض زمني 7 أيام: حالة نهائية بعد شهور تُعدّ متابعة
const veryLateUpdate = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks,
  deadlines: [],
  hearings: [
    hearing("h1", 85, "completed"),
    hearing("h2", 84, "postponed"),
    hearing("h3", 83, "completed"),
    hearing("h4", 82, "completed"),
    hearing("h5", 81, "cancelled"),
  ],
  now: NOW,
});
check(
  "15. No 7-day status-change assumption",
  veryLateUpdate.dimensions.hearings.value === 1 &&
    veryLateUpdate.dimensions.hearings.sampleSize === 4 &&
    veryLateUpdate.dimensions.hearings.quality === "self_reported" &&
    !SCORE_DIMENSION_HINTS.hearings.includes("7"),
  `${veryLateUpdate.dimensions.hearings.value}`,
);

// 16 — فترة التتبع من النشاط المؤهل الفعلي، لا من عمر المكتب
const recentActivity = Array.from({ length: 26 }, (_, i) =>
  task(`r${i}`, { dueDaysAgo: 1 + (i % 5), completedOffsetMs: -1 * HOUR, createdOffsetMs: DAY_MS }),
);
const shortTracking = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: recentActivity,
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "16. Tracking period derived from eligible activity",
  shortTracking.trackingDays === 26,
  `${shortTracking.trackingDays}`,
);
check(
  "17. Tracking period floor blocks ineligible short history",
  evaluateEligibility({
    organizationAgeDays: 400,
    trackingDays: MIN_TRACKING_DAYS - 1,
    eligibleItems: 100,
    deadlinesAndHearings: 50,
    hasMeasurableDimension: true,
  }).reason === "tracking_period_too_short",
);
check(
  "18. Organization age and tracking period remain separate",
  evaluateEligibility({
    organizationAgeDays: 40,
    trackingDays: 90,
    eligibleItems: 100,
    deadlinesAndHearings: 50,
    hasMeasurableDimension: true,
  }).reason === "organization_too_new" && perfect.trackingDays <= 90,
);

// 19 — إعادة توزيع الأوزان عند N/A
check(
  "19. N/A dimension reweighting",
  perfect.dimensions.hearings.applied === false &&
    perfect.dimensions.hearings.value === null &&
    perfect.dimensions.hearings.sampleSize === 0 &&
    perfect.score === 100,
);

// 20 — ثبات الأوزان
check(
  "20. Formula weights remain 45/35/20",
  SCORE_WEIGHTS.deadlines === 0.45 &&
    SCORE_WEIGHTS.tasks === 0.35 &&
    SCORE_WEIGHTS.hearings === 0.2 &&
    perfect.formulaVersion === "v1",
);

// 21 — حصر النتيجة 0–100
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
check("21. Score clamp 0–100", worst.score === 0 && perfect.score === 100, `${worst.score}`);

// 22 — عقد الواجهة عند عدم الأهلية: لا نتيجة إجمالية
const sparse = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks.slice(0, 3),
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "22. Ineligible UI contract does not produce total score",
  sparse.eligible === false &&
    sparse.score === null &&
    sparse.eligibilityReason === "insufficient_items" &&
    sparse.eligibilityMessage.length > 0,
  sparse.eligibilityReason,
);

// 23 — عتبة المهل/الجلسات = 5
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
  "23. Minimum deadlines/hearings threshold",
  noDeadlines.eligible === false &&
    noDeadlines.eligibilityReason === "insufficient_deadlines_or_hearings",
  noDeadlines.eligibilityReason,
);

// 24 — استبعاد المهام قصيرة العمر
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
  "24. Short-lived task exclusion",
  shortLived.dimensions.tasks.sampleSize === 20,
  String(shortLived.dimensions.tasks.sampleSize),
);

// 25 — بيانات تاريخية ناقصة ليست دليلاً سلبياً
const baselineOnly = computeOperationalScore({
  organizationCreatedAt: ORG_OLD,
  tasks: onTimeTasks.map((t) => ({
    ...t,
    events: [
      { event: "due_changed", occurredAt: iso(daysAgo(40)), fromDueDate: null, toDueDate: null },
    ] as ScoreEvent[],
  })),
  deadlines: onTimeDeadlines,
  hearings: [],
  now: NOW,
});
check(
  "25. Missing/partial event history is not negative evidence",
  baselineOnly.integrityFactor === 1 && baselineOnly.score === 100,
);

// 26 — نتيجة مختلطة
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
  "26. Mixed score calculation",
  mixed.score === mixedExpected,
  `${mixed.score} vs ${mixedExpected}`,
);

console.log(`\n${pass} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}