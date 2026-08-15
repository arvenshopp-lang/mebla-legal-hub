/**
 * بوابة نزاهة الظهور العام — التعريفات المركزية (Integrity Model v1).
 *
 * قواعد ثابتة:
 * - هذه الطبقة **لا تمس** مؤشر الإنجاز الداخلي: لا الأوزان (45/35/20)، ولا نافذة
 *   الـ90 يوماً، ولا الأهلية الأساسية، ولا `integrityFactor` (يبقى 1.00).
 * - مخرجها الوحيد: `PUBLIC_RANKING_INTEGRITY_STATUS`.
 * - الأنماط الإحصائية في v1 = `review_required` فقط، وليست دليلاً على تلاعب.
 * - `ineligible` مقصور على قواعد أهلية موضوعية قابلة للتفسير.
 * - العتبات أدناه **مبدئية (PROVISIONAL_V1_THRESHOLDS)** وتحتاج معايرة بعد
 *   Dry Run على بيانات حقيقية قبل تفعيل الظهور العام.
 */

export const INTEGRITY_MODEL_VERSION = "v1" as const;

/** الحد الأدنى لأيام النشاط داخل نافذة 90 يوماً (يوم رياض فيه نشاط مؤهل واحد على الأقل). */
export const MIN_ACTIVE_DAYS_IN_90 = 12;

/** عتبات المراجعة المبدئية — قابلة للتعديل بعد المعايرة. */
export const TOP3_DAY_CONCENTRATION_REVIEW = 0.6;
export const LAST7_ACTIVITY_SHARE_REVIEW = 0.5;
export const SHORT_LIVED_DEADLINE_RATIO_REVIEW = 0.4;
export const POST_DUE_DEADLINE_RATIO_REVIEW = 0.4;
export const DEADLINE_DELETE_AFTER_DUE_REVIEW = 0.25;
export const LATE_DUE_EXTENSION_REVIEW_COUNT = 3;
export const SHORT_LIVED_TASK_RATIO_REVIEW = 0.5;
export const SAME_DAY_TASK_RATIO_REVIEW = 0.6;
export const POST_DUE_TASK_CREATION_RATIO_REVIEW = 0.5;
export const HEARING_CREATED_AFTER_DATE_RATIO_REVIEW = 0.5;

/** «قصير العمر» لأغراض المراجعة فقط (لا يمس قاعدة الساعة الواحدة في B1). */
export const SHORT_LIVED_REVIEW_MS = 24 * 60 * 60 * 1000;
/** جلسة أُنشئت قبل موعدها بأقل من هذه المدة = إشارة منخفضة الثقة. */
export const HEARING_LOW_CONFIDENCE_LEAD_MS = 24 * 60 * 60 * 1000;
/** نافذة «بداية الاستخدام» التي يُفترض فيها ترحيل/إدخال بيانات لاحق. */
export const ONBOARDING_WINDOW_DAYS = 14;
/** الحد الأدنى للمهل المؤهلة عند وجود بعد واحد فقط (تنوّع الفئات للظهور العام). */
export const MIN_DEADLINES_FOR_SINGLE_DIMENSION = 8;
/** حجم عيّنة أدنى قبل الاعتداد بأي نسبة (يمنع إشارات من عيّنة صغيرة). */
export const MIN_RATIO_SAMPLE = 5;

export type PublicIntegrityStatus = "pass" | "review_required" | "ineligible";

/** رموز أسباب داخلية فقط — لا تُعرض للمكتب ولا للعامة. */
export type IntegrityReasonCode =
  | "BASE_ELIGIBILITY_NOT_MET"
  | "INSUFFICIENT_ACTIVITY_SPREAD"
  | "HIGH_ACTIVITY_CONCENTRATION"
  | "LAST7_ACTIVITY_BURST"
  | "SHORT_LIVED_DEADLINE_RATIO"
  | "POST_DUE_DEADLINE_CREATION_RATIO"
  | "LATE_DUE_EXTENSION_PATTERN"
  | "DEADLINE_DELETION_AFTER_DUE_RATIO"
  | "SHORT_LIVED_TASK_RATIO"
  | "SAME_DAY_TASK_COMPLETION_RATIO"
  | "POST_DUE_TASK_CREATION_RATIO"
  | "HEARINGS_CREATED_AFTER_DATE"
  | "LOW_CONFIDENCE_HEARING_EVIDENCE"
  | "ONBOARDING_IMPORT_PATTERN"
  | "INSUFFICIENT_CATEGORY_DIVERSITY";

export type IntegritySignals = {
  consideredTasks: number;
  consideredDeadlines: number;
  countedHearings: number;
  shortLivedTaskRatio: number | null;
  sameDayCreateCompleteRatio: number | null;
  postDueCreationRatio: number | null;
  shortLivedDeadlineRatio: number | null;
  postDueDeadlineCreationRatio: number | null;
  lateDueExtensionCount: number;
  deadlineDeletionAfterDueRatio: number | null;
  top3DayConcentration: number | null;
  last7ActivityShare: number | null;
  hearingsCreatedAfterDateRatio: number | null;
  lowConfidenceHearingRatio: number | null;
  appliedDimensions: number;
};

export type PublicIntegrityAssessment = {
  status: PublicIntegrityStatus;
  reasonCodes: IntegrityReasonCode[];
  signals: IntegritySignals;
  activeDays: number;
  evaluatedAt: string;
  modelVersion: typeof INTEGRITY_MODEL_VERSION;
};

/** نصوص محايدة للمكتب — بلا أي إشارة إلى تلاعب أو اشتباه. */
export const INTEGRITY_OFFICE_MESSAGES: Record<PublicIntegrityStatus, string> = {
  pass: "مكتبك مؤهل للظهور العام.",
  review_required: "الظهور العام قيد المراجعة.",
  ineligible:
    "يتطلب التأهل للظهور العام توفر نشاط تشغيلي منتظم وبيانات كافية عبر فترة القياس.",
};

/** المفتاح المخصص داخل `operational_score_snapshots.dimensions` (بلا Migration). */
export const INTEGRITY_SNAPSHOT_KEY = "integrity" as const;

/**
 * قراءة آمنة لحالة النزاهة من لقطة مخزّنة. أي غياب أو تلف أو إصدار مختلف
 * = ليست `pass` (Fail closed) بلا افتراض نية.
 */
export function readSnapshotIntegrityStatus(dimensions: unknown): PublicIntegrityStatus | null {
  if (!dimensions || typeof dimensions !== "object") return null;
  const node = (dimensions as Record<string, unknown>)[INTEGRITY_SNAPSHOT_KEY];
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  if (record["modelVersion"] !== INTEGRITY_MODEL_VERSION) return null;
  const status = record["status"];
  return status === "pass" || status === "review_required" || status === "ineligible"
    ? status
    : null;
}