/**
 * FEATURE 02 — مؤشر الأداء التشغيلي: التعريفات المركزية.
 * كل الأوزان والنطاقات وحدود العيّنة وحساب الفترات تُعرَّف هنا فقط.
 * ممنوع تكرار أي عتبة داخل المكوّنات.
 */

export type WorkItemType = "task" | "deadline";

export type KpiDimensionKey = "deadline_compliance" | "task_on_time" | "task_completion";

/** الأوزان الرسمية للنسخة الأولى — ثلاثة أبعاد فقط لمنع تكرار العقوبة. */
export const KPI_WEIGHTS: Record<KpiDimensionKey, number> = {
  deadline_compliance: 0.4,
  task_on_time: 0.35,
  task_completion: 0.25,
};

export const KPI_DIMENSION_LABELS: Record<KpiDimensionKey, string> = {
  deadline_compliance: "الالتزام بالمهل",
  task_on_time: "الإنجاز في الوقت",
  task_completion: "معدل الإنجاز",
};

export const KPI_DIMENSION_HINTS: Record<KpiDimensionKey, string> = {
  deadline_compliance: "المهل التي أُنجزت في موعدها من إجمالي المهل المستحقة في الفترة.",
  task_on_time: "المهام المنجزة في موعدها من إجمالي المهام المنجزة ذات موعد استحقاق.",
  task_completion: "المهام المنجزة من إجمالي المهام المستحقة في الفترة.",
};

/** نطاقات التقييم — مصدر واحد لا يُكرَّر في الواجهة. */
export const SCORE_BANDS = [
  { min: 90, label: "ممتاز", tone: "excellent" },
  { min: 80, label: "جيد جداً", tone: "good" },
  { min: 70, label: "جيد", tone: "fair" },
  { min: 60, label: "يحتاج متابعة", tone: "watch" },
  { min: 0, label: "يحتاج تحسين", tone: "low" },
] as const;

export type ScoreTone = (typeof SCORE_BANDS)[number]["tone"];

export function scoreBand(score: number): { label: string; tone: ScoreTone } {
  const band = SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
  return { label: band.label, tone: band.tone };
}

/** أهلية الترتيب: عناصر مؤهلة فريدة + أيام عضوية نشطة داخل النطاق المتتبَّع. */
export const MIN_SAMPLE_ITEMS = 8;
export const MIN_TRACKED_DAYS = 14;

/** نافذة انتقال المسؤولية: إعادة إسناد خلال 72 ساعة لا تُحمّل الملتزم الجديد تأخيراً سابقاً. */
export const REASSIGN_GRACE_HOURS = 72;

/** الحد الأقصى للفترة المخصصة (حساب لحظي بلا لقطات). */
export const MAX_CUSTOM_RANGE_DAYS = 366;

export const UPCOMING_DEADLINE_WINDOW_DAYS = 14;

export const INSUFFICIENT_DATA_MESSAGE =
  "يلزم توفر 8 أعمال مؤهلة و14 يوماً من بيانات التتبع لإظهار ترتيب موثوق.";

/* ------------------------------- الفترات ------------------------------- */

export const PERIOD_PRESETS = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "this_year",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  last_3_months: "آخر 3 أشهر",
  last_6_months: "آخر 6 أشهر",
  this_year: "هذه السنة",
  custom: "فترة مخصصة",
};

export type PeriodRange = { from: string; to: string };

export type ResolvedPeriod = {
  preset: PeriodPreset;
  current: PeriodRange;
  previous: PeriodRange;
  /** حد التقييم: نهاية الفترة للفترات المنتهية، والآن للفترة الجارية. */
  boundary: string;
  previousBoundary: string;
  days: number;
};

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** أجزاء التاريخ بتوقيت الرياض (UTC+3 ثابتة، لا توقيت صيفي في السعودية). */
export function riyadhParts(at: Date): { year: number; month: number; day: number } {
  const shifted = new Date(at.getTime() + RIYADH_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** بداية يوم بتوقيت الرياض معبَّراً عنها بـ ISO (UTC). */
export function riyadhDayStart(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - RIYADH_OFFSET_MS).toISOString();
}

/** بداية اليوم التالي — تُستخدم كحد أعلى مفتوح. */
export function riyadhDayEnd(year: number, month: number, day: number): string {
  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) + DAY_MS - RIYADH_OFFSET_MS,
  ).toISOString();
}

function dayStartFromIsoDate(value: string): string {
  const [y, m, d] = value.split("-").map((n) => Number(n));
  return riyadhDayStart(y ?? 1970, m ?? 1, d ?? 1);
}

function dayEndFromIsoDate(value: string): string {
  const [y, m, d] = value.split("-").map((n) => Number(n));
  return riyadhDayEnd(y ?? 1970, m ?? 1, d ?? 1);
}

export class KpiPeriodError extends Error {}

/**
 * يحسب الفترة الحالية وفترة المقارنة (نفس عدد الأيام مباشرة قبلها) بتوقيت الرياض.
 * الفترة المخصصة محدودة بـ 366 يوماً ويُتحقق منها على الخادم.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  custom?: { from?: string | null; to?: string | null },
  now: Date = new Date(),
): ResolvedPeriod {
  const today = riyadhParts(now);
  let from: string;
  let to: string;

  if (preset === "custom") {
    const rawFrom = custom?.from;
    const rawTo = custom?.to;
    if (
      !rawFrom ||
      !rawTo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawTo)
    ) {
      throw new KpiPeriodError("يرجى تحديد تاريخ بداية ونهاية صحيحين للفترة المخصصة.");
    }
    from = dayStartFromIsoDate(rawFrom);
    to = dayEndFromIsoDate(rawTo);
    if (new Date(to).getTime() <= new Date(from).getTime()) {
      throw new KpiPeriodError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية.");
    }
    if (new Date(to).getTime() - new Date(from).getTime() > MAX_CUSTOM_RANGE_DAYS * DAY_MS) {
      throw new KpiPeriodError("الحد الأقصى للفترة المخصصة 366 يوماً.");
    }
  } else if (preset === "this_month") {
    from = riyadhDayStart(today.year, today.month, 1);
    to = riyadhDayEnd(today.year, today.month, today.day);
  } else if (preset === "last_month") {
    const prevMonth = today.month === 1 ? 12 : today.month - 1;
    const prevYear = today.month === 1 ? today.year - 1 : today.year;
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    from = riyadhDayStart(prevYear, prevMonth, 1);
    to = riyadhDayEnd(prevYear, prevMonth, lastDay);
  } else if (preset === "this_year") {
    from = riyadhDayStart(today.year, 1, 1);
    to = riyadhDayEnd(today.year, today.month, today.day);
  } else {
    const months = preset === "last_3_months" ? 3 : 6;
    const start = new Date(Date.UTC(today.year, today.month - 1 - (months - 1), 1));
    from = riyadhDayStart(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    to = riyadhDayEnd(today.year, today.month, today.day);
  }

  const span = new Date(to).getTime() - new Date(from).getTime();
  const previous: PeriodRange = {
    from: new Date(new Date(from).getTime() - span).toISOString(),
    to: from,
  };
  const nowIso = now.toISOString();
  const boundary = new Date(to).getTime() > now.getTime() ? nowIso : to;

  return {
    preset,
    current: { from, to },
    previous,
    boundary,
    previousBoundary: previous.to,
    days: Math.round(span / DAY_MS),
  };
}

/* ------------------------------- الأنواع ------------------------------- */

export type KpiDimension = {
  key: KpiDimensionKey;
  weight: number;
  /** null = غير قابل للتطبيق (N/A) ولا يُحسب صفراً. */
  value: number | null;
  numerator: number;
  denominator: number;
};

export type KpiContext = {
  completed: number;
  completedLate: number;
  overdueTasks: number;
  overdueDeadlines: number;
  openTasks: number;
  activeCases: number;
  upcomingDeadlines: number;
  selfManagedItems: number;
  reassignedItems: number;
  averageDelayDays: number | null;
  totalOpenWork: number;
};

export type MemberKpi = {
  userId: string;
  fullName: string;
  jobTitle: string | null;
  role: string;
  isFormerMember: boolean;
  score: number | null;
  band: { label: string; tone: ScoreTone } | null;
  previousScore: number | null;
  trendPoints: number | null;
  dimensions: KpiDimension[];
  context: KpiContext;
  sampleItems: number;
  trackedDays: number;
  eligible: boolean;
  rank: number | null;
};

export type TeamKpiSummary = {
  averageScore: number | null;
  previousAverageScore: number | null;
  deadlineCompliance: number | null;
  onTimeCompletion: number | null;
  overdueTasks: number;
  overdueDeadlines: number;
  totalOpenWork: number;
  rankedMembers: number;
  distribution: { tone: ScoreTone; label: string; count: number }[];
};

export type TeamKpiResult = {
  period: ResolvedPeriod;
  trackingStartedAt: string | null;
  partialHistory: boolean;
  summary: TeamKpiSummary;
  ranked: MemberKpi[];
  insufficient: MemberKpi[];
};

export function partialHistoryMessage(trackingStartedAt: string | null): string {
  if (!trackingStartedAt) return "لم يبدأ التتبع الدقيق لمؤشرات الأداء بعد.";
  const p = riyadhParts(new Date(trackingStartedAt));
  const date = `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
  return `بدأ التتبع الدقيق لمؤشرات الأداء من ${date}. البيانات السابقة قد لا تتضمن سجل الإسناد وتغييرات المواعيد بالكامل.`;
}

export const DRILLDOWN_KINDS = [
  "overdue_tasks",
  "overdue_deadlines",
  "completed_late",
  "open_tasks",
  "upcoming_deadlines",
  "active_cases",
] as const;

export type DrilldownKind = (typeof DRILLDOWN_KINDS)[number];

export const DRILLDOWN_LABELS: Record<DrilldownKind, string> = {
  overdue_tasks: "المهام المتأخرة",
  overdue_deadlines: "المهل الفائتة",
  completed_late: "أُنجزت متأخرة",
  open_tasks: "الأعمال المفتوحة",
  upcoming_deadlines: "مهل قادمة (14 يوماً)",
  active_cases: "القضايا النشطة",
};

export const DRILLDOWN_PAGE_SIZE = 20;
