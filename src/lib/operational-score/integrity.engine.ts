/**
 * بوابة نزاهة الظهور العام — المحرك النقي (Integrity Model v1).
 *
 * دالة قطعية بلا وصول لقاعدة البيانات، تقرأ **نفس** Metadata التشغيلية التي
 * يقرأها محرك النتيجة (B1) ولا تعدّلها ولا تعيد حسابها:
 * لا عناوين، لا أوصاف، لا عملاء، لا قضايا، لا مستندات، لا محتوى قانوني.
 *
 * مبدأ السلامة: غياب الدليل ليس دليلاً. أي إشارة لا يمكن إثباتها من Metadata
 * تُهمَل ولا تنتج عقوبة ولا مراجعة.
 */

import { resolveEffectiveDue, type HearingMetric, type WorkItemMetric } from "./score.engine";
import {
  DAY_MS,
  SHORT_LIVED_TASK_MS,
  resolveScoreWindow,
  riyadhDayStart,
  type EligibilityReason,
} from "./score.shared";
import {
  DEADLINE_DELETE_AFTER_DUE_REVIEW,
  HEARING_CREATED_AFTER_DATE_RATIO_REVIEW,
  HEARING_LOW_CONFIDENCE_LEAD_MS,
  INTEGRITY_MODEL_VERSION,
  LAST7_ACTIVITY_SHARE_REVIEW,
  LATE_DUE_EXTENSION_REVIEW_COUNT,
  MIN_ACTIVE_DAYS_IN_90,
  MIN_DEADLINES_FOR_SINGLE_DIMENSION,
  MIN_RATIO_SAMPLE,
  ONBOARDING_WINDOW_DAYS,
  POST_DUE_DEADLINE_RATIO_REVIEW,
  POST_DUE_TASK_CREATION_RATIO_REVIEW,
  SAME_DAY_TASK_RATIO_REVIEW,
  SHORT_LIVED_DEADLINE_RATIO_REVIEW,
  SHORT_LIVED_REVIEW_MS,
  SHORT_LIVED_TASK_RATIO_REVIEW,
  TOP3_DAY_CONCENTRATION_REVIEW,
  type IntegrityReasonCode,
  type IntegritySignals,
  type PublicIntegrityAssessment,
  type PublicIntegrityStatus,
} from "./integrity.shared";

/** حدث حذف مثبت من `work_item_events` — الدليل الوحيد على عنصر لم يبق له صف. */
export type DeletionEvent = {
  itemType: "task" | "deadline";
  occurredAt: string;
  /** الموعد المثبت للعنصر المحذوف إن وُجد؛ غيابه = لا دليل ولا إشارة. */
  dueDate: string | null;
};

export type IntegrityEngineInput = {
  organizationCreatedAt: string;
  tasks: WorkItemMetric[];
  deadlines: WorkItemMetric[];
  hearings: HearingMetric[];
  deletionEvents: DeletionEvent[];
  /** نتيجة الأهلية الأساسية كما حسبها B1 — تُستهلك ولا تُعاد حسابها. */
  baseEligible: boolean;
  baseEligibilityReason: EligibilityReason;
  now?: string;
};

const ms = (value: string | null): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

const EXCLUDED_ITEM_STATUSES = new Set(["cancelled"]);

/** نسبة تُحتسب فقط عند عيّنة كافية؛ العيّنة الصغيرة = لا إشارة (null). */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator < MIN_RATIO_SAMPLE) return null;
  return numerator / denominator;
}

const round4 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10000) / 10000;

type ConsideredItem = {
  createdAtMs: number | null;
  completedAtMs: number | null;
  effectiveDueMs: number;
  lateExtension: boolean;
  /** يُحتسب في مقام النتيجة فعلياً (بعد قاعدة الساعة للمهام). */
  countedInScore: boolean;
};

/**
 * العناصر «المعتبرة»: غير ملغاة وموعدها المعتمد داخل النافذة — نفس أساس B1.
 * تُحفظ حالة `countedInScore` كما يراها B1 بلا أي تغيير في المقياس.
 */
function considerItems(
  items: WorkItemMetric[],
  windowStartMs: number,
  windowEndMs: number,
): ConsideredItem[] {
  const result: ConsideredItem[] = [];
  for (const item of items) {
    if (EXCLUDED_ITEM_STATUSES.has(item.status)) continue;
    const { effectiveDueMs, lateExtension } = resolveEffectiveDue(item);
    if (effectiveDueMs === null) continue;
    if (effectiveDueMs < windowStartMs || effectiveDueMs > windowEndMs) continue;
    const createdAtMs = ms(item.createdAt);
    const completedAtMs = ms(item.completedAt);
    const shortLivedForScore =
      item.itemType === "task" &&
      createdAtMs !== null &&
      completedAtMs !== null &&
      completedAtMs - createdAtMs < SHORT_LIVED_TASK_MS;
    result.push({
      createdAtMs,
      completedAtMs,
      effectiveDueMs,
      lateExtension,
      countedInScore: !shortLivedForScore,
    });
  }
  return result;
}

const dayKey = (value: number): number => riyadhDayStart(value).getTime();

/** بوابة النزاهة: تُقيّم الأهلية للظهور العام فقط ولا تُرجع أي نتيجة أو وزن. */
export function assessPublicIntegrity(input: IntegrityEngineInput): PublicIntegrityAssessment {
  const nowIso = input.now ?? new Date().toISOString();
  const { windowStart, windowEnd } = resolveScoreWindow(nowIso);
  const windowStartMs = new Date(windowStart).getTime();
  const windowEndMs = new Date(windowEnd).getTime();

  const tasks = considerItems(input.tasks, windowStartMs, windowEndMs);
  const deadlines = considerItems(input.deadlines, windowStartMs, windowEndMs);

  const hearings = input.hearings
    .filter((h) => h.status !== "cancelled")
    .map((h) => ({
      dateMs: ms(h.hearingDate),
      createdAtMs: ms(h.createdAt),
    }))
    .filter(
      (h): h is { dateMs: number; createdAtMs: number | null } =>
        h.dateMs !== null && h.dateMs >= windowStartMs && h.dateMs <= windowEndMs,
    );

  // ——— أيام النشاط (يوم رياض فيه نشاط تشغيلي مؤهل واحد على الأقل) ———
  const activityDays = new Set<number>();
  const activityTimestamps: number[] = [];
  const pushActivity = (value: number | null) => {
    if (value === null) return;
    const clamped = Math.min(Math.max(value, windowStartMs), windowEndMs);
    if (value < windowStartMs || value > windowEndMs) return;
    activityDays.add(dayKey(clamped));
    activityTimestamps.push(clamped);
  };
  for (const item of [...tasks, ...deadlines]) {
    if (!item.countedInScore) continue;
    pushActivity(item.createdAtMs);
    pushActivity(item.completedAtMs);
  }
  for (const hearing of hearings) {
    pushActivity(hearing.createdAtMs);
    pushActivity(hearing.dateMs);
  }
  const activeDays = activityDays.size;

  // ——— التركيز الزمني ———
  const perDayCounts = new Map<number, number>();
  for (const at of activityTimestamps) {
    const key = dayKey(at);
    perDayCounts.set(key, (perDayCounts.get(key) ?? 0) + 1);
  }
  const totalActivity = activityTimestamps.length;
  const top3 = [...perDayCounts.values()].sort((a, b) => b - a).slice(0, 3);
  const top3Sum = top3.reduce((sum, value) => sum + value, 0);
  const top3DayConcentration =
    totalActivity >= MIN_RATIO_SAMPLE && perDayCounts.size > 3 ? top3Sum / totalActivity : null;

  const last7StartMs = riyadhDayStart(windowEndMs - 6 * DAY_MS).getTime();
  const last7Count = activityTimestamps.filter((at) => at >= last7StartMs).length;
  const last7ActivityShare = ratio(last7Count, totalActivity);

  // ——— إشارات المهام ———
  const consideredTasks = tasks.length;
  const shortLivedTasks = tasks.filter(
    (t) =>
      t.createdAtMs !== null &&
      t.completedAtMs !== null &&
      t.completedAtMs - t.createdAtMs < SHORT_LIVED_REVIEW_MS,
  ).length;
  const sameDayTasks = tasks.filter(
    (t) =>
      t.createdAtMs !== null &&
      t.completedAtMs !== null &&
      dayKey(t.createdAtMs) === dayKey(t.completedAtMs),
  ).length;
  const postDueTasks = tasks.filter(
    (t) => t.createdAtMs !== null && t.createdAtMs > t.effectiveDueMs,
  ).length;

  // ——— إشارات المهل ———
  const consideredDeadlines = deadlines.length;
  const shortLivedDeadlines = deadlines.filter(
    (d) =>
      d.createdAtMs !== null &&
      d.completedAtMs !== null &&
      d.completedAtMs - d.createdAtMs < SHORT_LIVED_REVIEW_MS,
  ).length;
  const postDueDeadlines = deadlines.filter(
    (d) => d.createdAtMs !== null && d.createdAtMs > d.effectiveDueMs,
  ).length;
  const lateDueExtensionCount = [...tasks, ...deadlines].filter((i) => i.lateExtension).length;

  // حذف بعد الاستحقاق: دليل مثبت فقط (حدث حذف + موعد معروف + الحذف بعده).
  const deletedDeadlinesAfterDue = input.deletionEvents.filter((event) => {
    if (event.itemType !== "deadline") return false;
    const due = ms(event.dueDate);
    const at = ms(event.occurredAt);
    if (due === null || at === null) return false;
    if (due < windowStartMs || due > windowEndMs) return false;
    return at > due;
  }).length;
  const deadlineDeletionAfterDueRatio = ratio(
    deletedDeadlinesAfterDue,
    consideredDeadlines + deletedDeadlinesAfterDue,
  );

  // ——— إشارات الجلسات (ثقة أدنى: لا سجل أحداث ولا طابع لتغيّر الحالة) ———
  const countedHearings = hearings.length;
  const hearingsAfterDate = hearings.filter(
    (h) => h.createdAtMs !== null && h.createdAtMs > h.dateMs,
  ).length;
  const lowConfidenceHearings = hearings.filter(
    (h) =>
      h.createdAtMs !== null &&
      h.createdAtMs <= h.dateMs &&
      h.dateMs - h.createdAtMs < HEARING_LOW_CONFIDENCE_LEAD_MS,
  ).length;

  // ——— تنوّع الفئات (لا إلزام بالجلسات) ———
  const countedTasksInScore = tasks.filter((t) => t.countedInScore).length;
  const countedDeadlinesInScore = deadlines.filter((d) => d.countedInScore).length;
  const appliedDimensions = [countedTasksInScore, countedDeadlinesInScore, countedHearings].filter(
    (value) => value > 0,
  ).length;

  const signals: IntegritySignals = {
    consideredTasks,
    consideredDeadlines,
    countedHearings,
    shortLivedTaskRatio: round4(ratio(shortLivedTasks, consideredTasks)),
    sameDayCreateCompleteRatio: round4(ratio(sameDayTasks, consideredTasks)),
    postDueCreationRatio: round4(ratio(postDueTasks, consideredTasks)),
    shortLivedDeadlineRatio: round4(ratio(shortLivedDeadlines, consideredDeadlines)),
    postDueDeadlineCreationRatio: round4(ratio(postDueDeadlines, consideredDeadlines)),
    lateDueExtensionCount,
    deadlineDeletionAfterDueRatio: round4(deadlineDeletionAfterDueRatio),
    top3DayConcentration: round4(top3DayConcentration),
    last7ActivityShare: round4(last7ActivityShare),
    hearingsCreatedAfterDateRatio: round4(ratio(hearingsAfterDate, countedHearings)),
    lowConfidenceHearingRatio: round4(ratio(lowConfidenceHearings, countedHearings)),
    appliedDimensions,
  };

  // ——— إشارات المراجعة (لا اتهام، ولا Hard Block) ———
  const reviewCodes: IntegrityReasonCode[] = [];
  const over = (value: number | null, threshold: number) => value !== null && value > threshold;

  if (over(signals.top3DayConcentration, TOP3_DAY_CONCENTRATION_REVIEW))
    reviewCodes.push("HIGH_ACTIVITY_CONCENTRATION");
  if (over(signals.last7ActivityShare, LAST7_ACTIVITY_SHARE_REVIEW))
    reviewCodes.push("LAST7_ACTIVITY_BURST");
  if (over(signals.shortLivedDeadlineRatio, SHORT_LIVED_DEADLINE_RATIO_REVIEW))
    reviewCodes.push("SHORT_LIVED_DEADLINE_RATIO");
  if (over(signals.postDueDeadlineCreationRatio, POST_DUE_DEADLINE_RATIO_REVIEW))
    reviewCodes.push("POST_DUE_DEADLINE_CREATION_RATIO");
  if (lateDueExtensionCount >= LATE_DUE_EXTENSION_REVIEW_COUNT)
    reviewCodes.push("LATE_DUE_EXTENSION_PATTERN");
  if (over(signals.deadlineDeletionAfterDueRatio, DEADLINE_DELETE_AFTER_DUE_REVIEW))
    reviewCodes.push("DEADLINE_DELETION_AFTER_DUE_RATIO");
  if (over(signals.shortLivedTaskRatio, SHORT_LIVED_TASK_RATIO_REVIEW))
    reviewCodes.push("SHORT_LIVED_TASK_RATIO");
  if (over(signals.sameDayCreateCompleteRatio, SAME_DAY_TASK_RATIO_REVIEW))
    reviewCodes.push("SAME_DAY_TASK_COMPLETION_RATIO");
  if (over(signals.postDueCreationRatio, POST_DUE_TASK_CREATION_RATIO_REVIEW))
    reviewCodes.push("POST_DUE_TASK_CREATION_RATIO");
  if (over(signals.hearingsCreatedAfterDateRatio, HEARING_CREATED_AFTER_DATE_RATIO_REVIEW))
    reviewCodes.push("HEARINGS_CREATED_AFTER_DATE");
  if (over(signals.lowConfidenceHearingRatio, HEARING_CREATED_AFTER_DATE_RATIO_REVIEW))
    reviewCodes.push("LOW_CONFIDENCE_HEARING_EVIDENCE");

  // نمط ترحيل/إدخال بيانات في بداية الاستخدام: مراجعة لا حجب نهائي.
  const orgCreatedMs = ms(input.organizationCreatedAt);
  const earliestActivityMs =
    activityTimestamps.length > 0 ? Math.min(...activityTimestamps) : null;
  const onboardingPattern =
    orgCreatedMs !== null &&
    earliestActivityMs !== null &&
    earliestActivityMs - orgCreatedMs <= ONBOARDING_WINDOW_DAYS * DAY_MS &&
    (over(signals.top3DayConcentration, TOP3_DAY_CONCENTRATION_REVIEW) ||
      activeDays < MIN_ACTIVE_DAYS_IN_90);
  if (onboardingPattern) reviewCodes.push("ONBOARDING_IMPORT_PATTERN");

  // تنوّع الفئات للظهور العام: مراجعة لا حجب (قد يكون نمط مكتب مشروعاً).
  if (appliedDimensions < 2 && countedDeadlinesInScore < MIN_DEADLINES_FOR_SINGLE_DIMENSION) {
    reviewCodes.push("INSUFFICIENT_CATEGORY_DIVERSITY");
  }

  // ——— القرار ———
  let status: PublicIntegrityStatus;
  const reasonCodes: IntegrityReasonCode[] = [];
  if (!input.baseEligible) {
    status = "ineligible";
    reasonCodes.push("BASE_ELIGIBILITY_NOT_MET");
  } else if (activeDays < MIN_ACTIVE_DAYS_IN_90) {
    status = "ineligible";
    reasonCodes.push("INSUFFICIENT_ACTIVITY_SPREAD");
  } else if (reviewCodes.length > 0) {
    status = "review_required";
  } else {
    status = "pass";
  }
  // الإشارات الإحصائية تُسجَّل دائماً للمعايرة، ولا تُحوّل قراراً إلى حجب.
  reasonCodes.push(...reviewCodes);

  return {
    status,
    reasonCodes,
    signals,
    activeDays,
    evaluatedAt: nowIso,
    modelVersion: INTEGRITY_MODEL_VERSION,
  };
}