/**
 * مؤشر الإنجاز التشغيلي — المحرك النقي (v1).
 * دوال قطعية بلا وصول لقاعدة البيانات: مدخلات Metadata تشغيلية صريحة ← نتيجة قابلة للاختبار.
 *
 * مبدأ السلامة: سجل الأحداث `work_item_events` دليل إيجابي فقط.
 * غياب الحدث لا يُعدّ دليلاً سلبياً ولا يخفض النتيجة أبداً.
 *
 * قاعدة v1 لمنع العقوبة المزدوجة: الحدث المثبت يُصحِّح المقياس نفسه فقط
 * (الموعد المعتمد / حالة الإنجاز)، ولا يُخصم مرة ثانية من معامل النزاهة.
 */

import {
  DAY_MS,
  ELIGIBILITY_MESSAGES,
  INTEGRITY_FACTOR_NEUTRAL,
  MIN_DEADLINES_OR_HEARINGS,
  MIN_ELIGIBLE_ITEMS,
  MIN_ORGANIZATION_AGE_DAYS,
  MIN_TRACKING_DAYS,
  OPERATIONAL_SCORE_FORMULA_VERSION,
  SCORE_DIMENSION_LABELS,
  SCORE_DIMENSION_QUALITY,
  SCORE_WEIGHTS,
  SCORE_WINDOW_DAYS,
  SHORT_LIVED_TASK_MS,
  resolveScoreWindow,
  riyadhDaysBetween,
  type EligibilityReason,
  type OperationalScoreResult,
  type ScoreDimension,
  type ScoreDimensionKey,
} from "./score.shared";

/**
 * الحدث الوحيد المستهلَك في v1: `due_changed` كتصحيح للموعد المعتمد.
 * `deleted` مؤجَّل (DEFERRED_ANTI_GAMING_SIGNAL) و`reopened` ينعكس أثره في
 * الحالة الرسمية الحالية للعنصر فلا يُستهلك كإشارة منفصلة.
 */
export type ScoreEventName = "due_changed";

export type ScoreEvent = {
  event: ScoreEventName;
  occurredAt: string;
  fromDueDate: string | null;
  toDueDate: string | null;
};

/** Metadata تشغيلية فقط — لا عنوان ولا وصف ولا أي محتوى قانوني. */
export type WorkItemMetric = {
  id: string;
  itemType: "task" | "deadline";
  createdAt: string;
  dueDate: string | null;
  completedAt: string | null;
  status: string;
  events: ScoreEvent[];
};

export type HearingMetric = {
  id: string;
  hearingDate: string;
  status: string;
  createdAt: string;
};

export type ScoreEngineInput = {
  organizationCreatedAt: string;
  tasks: WorkItemMetric[];
  deadlines: WorkItemMetric[];
  hearings: HearingMetric[];
  now?: string;
};

const ms = (v: string | null): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/** حالات لا تُحتسب لا في البسط ولا في المقام (الإلغاء المشروع لا يُعاقب عليه). */
const EXCLUDED_ITEM_STATUSES = new Set(["cancelled"]);

export type ItemAssessment = {
  id: string;
  counted: boolean;
  onTime: boolean;
  /** الموعد المعتمد للتقييم بعد تطبيق قاعدة التمديد المثبت. */
  effectiveDueMs: number | null;
  createdAtMs: number | null;
};

/**
 * الموعد المعتمد: يبدأ من `due_date` الحالي (Authoritative).
 * يُستبدل بالموعد السابق **المثبت** فقط عند وجود حدث `due_changed`
 * يُظهر تمديداً حدث بعد تجاوز الموعد السابق. غياب الحدث لا يُستنتج منه شيء.
 */
export function resolveEffectiveDue(item: WorkItemMetric): {
  effectiveDueMs: number | null;
  lateExtension: boolean;
} {
  const current = ms(item.dueDate);
  let earliestProven: number | null = null;
  for (const ev of item.events) {
    if (ev.event !== "due_changed") continue;
    const from = ms(ev.fromDueDate);
    const to = ms(ev.toDueDate);
    const at = ms(ev.occurredAt);
    if (from === null || to === null || at === null) continue;
    // تمديد مثبت بعد تجاوز الموعد السابق.
    if (to > from && at > from) {
      earliestProven = earliestProven === null ? from : Math.min(earliestProven, from);
    }
  }
  if (earliestProven === null) return { effectiveDueMs: current, lateExtension: false };
  return { effectiveDueMs: earliestProven, lateExtension: true };
}

function assessItem(
  item: WorkItemMetric,
  windowStartMs: number,
  windowEndMs: number,
): ItemAssessment {
  const { effectiveDueMs } = resolveEffectiveDue(item);
  const completedAt = ms(item.completedAt);
  const createdAt = ms(item.createdAt);

  const base: ItemAssessment = {
    id: item.id,
    counted: false,
    onTime: false,
    effectiveDueMs,
    createdAtMs: createdAt,
  };

  if (EXCLUDED_ITEM_STATUSES.has(item.status)) return base;
  if (effectiveDueMs === null) return base;
  // العنصر يُحتسب عندما يكون موعده المعتمد قد استُحق داخل النافذة.
  if (effectiveDueMs < windowStartMs || effectiveDueMs > windowEndMs) return base;

  // قاعدة المهام قصيرة العمر: خارج البسط والمقام معاً.
  if (
    item.itemType === "task" &&
    completedAt !== null &&
    createdAt !== null &&
    completedAt - createdAt < SHORT_LIVED_TASK_MS
  ) {
    return base;
  }

  return {
    ...base,
    counted: true,
    onTime: completedAt !== null && completedAt <= effectiveDueMs,
  };
}

export type HearingAssessment = {
  id: string;
  counted: boolean;
  followedUp: boolean;
  createdAtMs: number | null;
};

/**
 * متابعة الجلسات (Metric v1 محافظة): الجلسات المنقضية داخل النافذة.
 * تُعدّ متابَعة إذا كانت حالتها الحالية `completed` أو `postponed`.
 * `scheduled` بعد الموعد أو `missed` = غير متابَعة. `cancelled` مستبعدة من
 * البسط والمقام. لا ادعاء زمني عن «وقت تغيير الحالة» لأن `hearings` لا يملك
 * أي timestamp موثوق لتغيّر الحالة (`updated_at` يتغير بأي تعديل).
 */
export function assessHearing(
  hearing: HearingMetric,
  windowStartMs: number,
  windowEndMs: number,
): HearingAssessment {
  const createdAtMs = ms(hearing.createdAt);
  const date = ms(hearing.hearingDate);
  if (date === null || date < windowStartMs || date > windowEndMs) {
    return { id: hearing.id, counted: false, followedUp: false, createdAtMs };
  }
  if (hearing.status === "cancelled") {
    return { id: hearing.id, counted: false, followedUp: false, createdAtMs };
  }
  const followedUp = hearing.status === "completed" || hearing.status === "postponed";
  return { id: hearing.id, counted: true, followedUp, createdAtMs };
}

function dimension(key: ScoreDimensionKey, numerator: number, denominator: number): ScoreDimension {
  const applied = denominator > 0;
  return {
    key,
    label: SCORE_DIMENSION_LABELS[key],
    value: applied ? numerator / denominator : null,
    weight: SCORE_WEIGHTS[key],
    applied,
    quality: SCORE_DIMENSION_QUALITY[key],
    sampleSize: denominator,
  };
}

/**
 * معامل النزاهة في v1 = 1.00 دائماً.
 * الإشارات المتاحة حالياً (`due_changed`, `reopened`) ينعكس أثرها بالكامل داخل
 * المقياس نفسه، فخصمها ثانية = عقوبة مزدوجة. و`deleted-after-due` مؤجَّل لأن
 * الصف المحذوف لا يصل إلى الحساب بصورة موثوقة. الحقل محفوظ في العقد للتوسع.
 */
export function computeIntegrityFactor(): number {
  return INTEGRITY_FACTOR_NEUTRAL;
}

export type EligibilityInput = {
  organizationAgeDays: number;
  trackingDays: number;
  eligibleItems: number;
  deadlinesAndHearings: number;
  hasMeasurableDimension: boolean;
};

/** حساب الأهلية مستقل تماماً عن حساب النتيجة. */
export function evaluateEligibility(input: EligibilityInput): {
  eligible: boolean;
  reason: EligibilityReason;
} {
  if (input.organizationAgeDays < MIN_ORGANIZATION_AGE_DAYS) {
    return { eligible: false, reason: "organization_too_new" };
  }
  if (input.trackingDays < MIN_TRACKING_DAYS) {
    return { eligible: false, reason: "tracking_period_too_short" };
  }
  if (input.eligibleItems < MIN_ELIGIBLE_ITEMS) {
    return { eligible: false, reason: "insufficient_items" };
  }
  if (input.deadlinesAndHearings < MIN_DEADLINES_OR_HEARINGS) {
    return { eligible: false, reason: "insufficient_deadlines_or_hearings" };
  }
  if (!input.hasMeasurableDimension) {
    return { eligible: false, reason: "no_measurable_dimension" };
  }
  return { eligible: true, reason: "eligible" };
}

/** الحساب الكامل: أبعاد + أهلية + نتيجة 0–100. */
export function computeOperationalScore(input: ScoreEngineInput): OperationalScoreResult {
  const nowIso = input.now ?? new Date().toISOString();
  const { windowStart, windowEnd } = resolveScoreWindow(nowIso);
  const windowStartMs = new Date(windowStart).getTime();
  const windowEndMs = new Date(windowEnd).getTime();

  const deadlineAssessments = input.deadlines.map((d) => assessItem(d, windowStartMs, windowEndMs));
  const taskAssessments = input.tasks.map((t) => assessItem(t, windowStartMs, windowEndMs));
  const hearingAssessments = input.hearings.map((h) =>
    assessHearing(h, windowStartMs, windowEndMs),
  );

  const countedDeadlines = deadlineAssessments.filter((a) => a.counted);
  const countedTasks = taskAssessments.filter((a) => a.counted);
  const countedHearings = hearingAssessments.filter((a) => a.counted);

  const dimensions: Record<ScoreDimensionKey, ScoreDimension> = {
    deadlines: dimension(
      "deadlines",
      countedDeadlines.filter((a) => a.onTime).length,
      countedDeadlines.length,
    ),
    tasks: dimension("tasks", countedTasks.filter((a) => a.onTime).length, countedTasks.length),
    hearings: dimension(
      "hearings",
      countedHearings.filter((a) => a.followedUp).length,
      countedHearings.length,
    ),
  };

  const countedItems = countedDeadlines.length + countedTasks.length + countedHearings.length;
  const integrityFactor = computeIntegrityFactor();

  // عمر المكتب: شرط مستقل تماماً عن فترة التتبع، بحدود يوم الرياض.
  const orgCreatedMs = new Date(input.organizationCreatedAt).getTime();
  const organizationAgeDays = Number.isFinite(orgCreatedMs)
    ? Math.max(0, riyadhDaysBetween(orgCreatedMs, windowEndMs))
    : 0;

  // فترة التتبع: من أقدم نشاط تشغيلي مؤهل فعلاً (مقيّداً ببداية النافذة) حتى نهايتها.
  const activityStarts = [...countedDeadlines, ...countedTasks, ...countedHearings]
    .map((a) => a.createdAtMs)
    .filter((v): v is number => v !== null);
  const earliestActivityMs = activityStarts.length > 0 ? Math.min(...activityStarts) : null;
  const trackingDays =
    earliestActivityMs === null
      ? 0
      : Math.max(
          0,
          Math.min(
            SCORE_WINDOW_DAYS,
            riyadhDaysBetween(Math.max(windowStartMs, earliestActivityMs), windowEndMs) + 1,
          ),
        );
  const deadlinesAndHearings = countedDeadlines.length + countedHearings.length;
  const appliedDimensions = Object.values(dimensions).filter((d) => d.applied);

  const { eligible, reason } = evaluateEligibility({
    organizationAgeDays,
    trackingDays,
    eligibleItems: countedItems,
    deadlinesAndHearings,
    hasMeasurableDimension: appliedDimensions.length > 0,
  });

  let score: number | null = null;
  if (appliedDimensions.length > 0) {
    const weightSum = appliedDimensions.reduce((sum, d) => sum + d.weight, 0);
    const raw =
      appliedDimensions.reduce((sum, d) => sum + (d.value ?? 0) * d.weight, 0) / weightSum;
    score = Math.min(100, Math.max(0, Math.round(raw * 100 * integrityFactor)));
  }

  return {
    score: eligible ? score : null,
    formulaVersion: OPERATIONAL_SCORE_FORMULA_VERSION,
    windowStart,
    windowEnd,
    computedAt: nowIso,
    eligible,
    eligibilityReason: reason,
    eligibilityMessage: ELIGIBILITY_MESSAGES[reason],
    eligibleItems: countedItems,
    deadlinesAndHearings,
    trackingDays,
    integrityFactor,
    dimensions,
  };
}
