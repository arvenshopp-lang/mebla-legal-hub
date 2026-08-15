/**
 * مؤشر الإنجاز التشغيلي — التعريفات المركزية (v1).
 * كل وزن وعتبة وثابت زمني يُعرَّف هنا فقط، وممنوع تكراره في المحرك أو الواجهة.
 * الأوزان مثبّتة في الكود: لا تعديل إداري ولا تجاوز يدوي للنتيجة.
 */

export const OPERATIONAL_SCORE_FORMULA_VERSION = "v1" as const;

import { DAY_MS, RIYADH_TZ, riyadhDayStart, riyadhDaysBetween } from "@/lib/format";

export type ScoreDimensionKey = "deadlines" | "tasks" | "hearings";

/** الأوزان الرسمية المعتمدة: المهل 45% — المهام 35% — الجلسات 20%. */
export const SCORE_WEIGHTS: Record<ScoreDimensionKey, number> = {
  deadlines: 0.45,
  tasks: 0.35,
  hearings: 0.2,
};

export const SCORE_DIMENSION_LABELS: Record<ScoreDimensionKey, string> = {
  deadlines: "الالتزام بالمهل",
  tasks: "المهام في موعدها",
  hearings: "متابعة الجلسات",
};

export const SCORE_DIMENSION_HINTS: Record<ScoreDimensionKey, string> = {
  deadlines: "المهل المستحقة داخل نافذة القياس التي أُنجزت في موعدها المعتمد.",
  tasks: "المهام المستحقة داخل نافذة القياس التي أُنجزت في موعدها المعتمد.",
  hearings: "يُحتسب هذا المؤشر بناءً على حالة الجلسات المنقضية المسجلة في مِهلة.",
};

/** جودة المصدر: `audited` مدعوم بسجل أحداث مغلق، و`self_reported` بلا سجل أحداث مكافئ. */
export type MetricQuality = "audited" | "self_reported";

export const SCORE_DIMENSION_QUALITY: Record<ScoreDimensionKey, MetricQuality> = {
  deadlines: "audited",
  tasks: "audited",
  hearings: "self_reported",
};

/** نافذة القياس الرسمية لـ v1. */
export const SCORE_WINDOW_DAYS = 90;

/** شروط الأهلية المعتمدة. */
export const MIN_ORGANIZATION_AGE_DAYS = 45;
export const MIN_TRACKING_DAYS = 30;
export const MIN_ELIGIBLE_ITEMS = 25;
export const MIN_DEADLINES_OR_HEARINGS = 5;

/** شروط الترتيب العام (غير مُنفَّذة في v1 — مرجعية فقط). */
export const PUBLIC_MINIMUM_SCORE = 78;
export const PUBLIC_RESULTS_COUNT = 5;
export const PUBLIC_SECTION_TITLE = "الأكثر إنجازاً على مِهلة";

/** مهمة أُنشئت وأُنجزت خلال أقل من ساعة تُستبعد من البسط والمقام (منع المهام الصورية). */
export const SHORT_LIVED_TASK_MS = 60 * 60 * 1000;

/**
 * معامل النزاهة في v1 = 1.00 محايد.
 * لا تُخصم أي إشارة انعكس أثرها أصلاً داخل البسط/المقام (تمديد متأخر، إعادة فتح)،
 * ولا تُقبل إشارة جديدة قبل أن تكون: مثبتة + مستقلة + غير منعكسة في المقياس.
 */
export const INTEGRITY_FACTOR_NEUTRAL = 1;

/** سياسة الوقت المركزية: حدود يوم الرياض تُشتق من `src/lib/format.ts` فقط. */
export { DAY_MS, RIYADH_TZ, riyadhDayStart, riyadhDaysBetween };

export type EligibilityReason =
  | "eligible"
  | "organization_too_new"
  | "tracking_period_too_short"
  | "insufficient_items"
  | "insufficient_deadlines_or_hearings"
  | "no_measurable_dimension";

export const ELIGIBILITY_MESSAGES: Record<EligibilityReason, string> = {
  eligible: "المؤشر محتسب على آخر 90 يوماً.",
  organization_too_new:
    "يتطلب احتساب المؤشر مرور 45 يوماً على إنشاء المكتب وتوفر نشاط تشغيلي كافٍ.",
  tracking_period_too_short: "يلزم 30 يوماً من بيانات التتبع لاحتساب المؤشر.",
  insufficient_items: "يلزم 25 عملاً مؤهلاً داخل آخر 90 يوماً لاحتساب المؤشر.",
  insufficient_deadlines_or_hearings: "يلزم 5 مهل أو جلسات مستحقة داخل آخر 90 يوماً.",
  no_measurable_dimension: "لا توجد أعمال مستحقة قابلة للقياس داخل آخر 90 يوماً.",
};

export const INSUFFICIENT_DATA_LABEL = "بيانات غير كافية";

/** نافذة القياس: 90 يوماً رياضياً كاملة تنتهي عند لحظة الحساب. */
export function resolveScoreWindow(now: Date | string | number = new Date()): {
  windowStart: string;
  windowEnd: string;
} {
  const end = new Date(now);
  const start = riyadhDayStart(end.getTime() - (SCORE_WINDOW_DAYS - 1) * DAY_MS);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

export type ScoreDimension = {
  key: ScoreDimensionKey;
  label: string;
  /** 0–1 أو null عند غياب عيّنة صالحة. */
  value: number | null;
  weight: number;
  applied: boolean;
  quality: MetricQuality;
  sampleSize: number;
};

export type OperationalScoreResult = {
  score: number | null;
  formulaVersion: typeof OPERATIONAL_SCORE_FORMULA_VERSION;
  windowStart: string;
  windowEnd: string;
  computedAt: string;
  eligible: boolean;
  eligibilityReason: EligibilityReason;
  eligibilityMessage: string;
  eligibleItems: number;
  deadlinesAndHearings: number;
  trackingDays: number;
  integrityFactor: number;
  dimensions: Record<ScoreDimensionKey, ScoreDimension>;
};
