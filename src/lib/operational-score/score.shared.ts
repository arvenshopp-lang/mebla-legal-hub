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
export const PUBLIC_SECTION_INTRO =
  "مكاتب تحقق مستويات مرتفعة من الالتزام والإنجاز التشغيلي باستخدام مِهلة.";
export const PUBLIC_RANKING_DISCLAIMER =
  "يعكس المؤشر مستوى الإنجاز التشغيلي داخل مِهلة ولا يمثل تقييماً لجودة الخدمات القانونية أو نتائج القضايا.";

/** رسالة الخصوصية المختصرة المعروضة مع القائمة العامة. */
export const PUBLIC_PRIVACY_NOTE =
  "لا نطّلع على مستندات المكاتب ولا بيانات عملائها — يُحتسب المؤشر من مواعيد الأعمال وحالات إنجازها فقط.";

/** مسار صفحة شرح المنهجية العامة — مصدر واحد للروابط. */
export const METHODOLOGY_PATH = "/operational-score";
export const METHODOLOGY_LINK_LABEL = "كيف يُحسب المؤشر؟";

/** الحقول الوحيدة التي تظهر للعامة عند موافقة المكتب. */
export const PUBLIC_VISIBLE_FIELDS = [
  "اسم المكتب المعتمد",
  "شعار المكتب",
  "نسبة مؤشر الإنجاز التشغيلي",
  "الترتيب داخل القائمة",
] as const;

/** ما لا يدخل الحساب ولا يظهر للعامة إطلاقاً. */
export const PUBLIC_EXCLUDED_DATA = [
  "عناوين القضايا وأرقامها وتفاصيلها",
  "أسماء العملاء أو بياناتهم",
  "محتوى المستندات أو أسماء الملفات",
  "الفواتير والمبالغ وأي بيان مالي",
  "الملاحظات الداخلية والمراسلات",
  "أسماء الموظفين ومؤشرات أدائهم",
] as const;

/** قراءة تشغيلية بلغة واضحة للمشترك — مشتقة من نفس النتيجة بلا معايير جديدة. */
export type OperationalReadingTone = "steady" | "watch" | "delayed";

export const OPERATIONAL_READING_THRESHOLDS = { steady: 85, watch: 70 } as const;

export const OPERATIONAL_READING_LABELS: Record<OperationalReadingTone, string> = {
  steady: "التشغيل منتظم",
  watch: "تأخير محدود",
  delayed: "تأخير يحتاج معالجة",
};

export function operationalReadingTone(score: number): OperationalReadingTone {
  if (score >= OPERATIONAL_READING_THRESHOLDS.steady) return "steady";
  if (score >= OPERATIONAL_READING_THRESHOLDS.watch) return "watch";
  return "delayed";
}

/** أضعف بُعد مُطبَّق — يُستخدم كسبب مفهوم للقراءة التشغيلية. */
export function weakestAppliedDimension(
  dimensions: Record<ScoreDimensionKey, ScoreDimension>,
): ScoreDimension | null {
  const applied = (Object.values(dimensions) as ScoreDimension[]).filter(
    (d) => d.applied && d.value !== null,
  );
  if (applied.length === 0) return null;
  return applied.reduce((worst, current) =>
    (current.value ?? 1) < (worst.value ?? 1) ? current : worst,
  );
}

/** العقد العام للترتيب — لا يحتوي على أي معرّف داخلي أو بيانات حساسة. */
export type PublicOperationalRankingItem = {
  rank: number;
  publicName: string;
  score: number;
  badge?: string | null;
  logoUrl?: string | null;
};

export type PublicOperationalRanking = {
  enabled: boolean;
  computedAt: string | null;
  items: PublicOperationalRankingItem[];
};

/**
 * تطبيع قائمة عامة قبل عرضها:
 * - تُعرض أول 5 عناصر فقط.
 * - يُتجاهر أي عنصر ناقص الاسم أو الترتيب.
 * - تُقصّ الدرجة إلى 0–100.
 */
export function sanitizePublicRankingItems(
  items: PublicOperationalRankingItem[],
): PublicOperationalRankingItem[] {
  return items
    .filter(
      (item): item is PublicOperationalRankingItem & { publicName: string } =>
        typeof item.publicName === "string" &&
        item.publicName.trim().length > 0 &&
        Number.isFinite(item.rank) &&
        item.rank >= 1 &&
        item.rank <= PUBLIC_RESULTS_COUNT,
    )
    .slice(0, PUBLIC_RESULTS_COUNT)
    // انتقاء صريح للحقول العامة: أي Metadata داخلية (نزاهة، معرّفات، أعداد)
    // لا يمكن أن تعبر إلى الاستجابة العامة حتى لو مُررت بالخطأ.
    .map((item) => ({
      rank: item.rank,
      publicName: item.publicName,
      score: Math.max(0, Math.min(100, Number(item.score) || 0)),
      badge: item.badge ?? null,
      logoUrl: item.logoUrl ?? null,
    }));
}

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
