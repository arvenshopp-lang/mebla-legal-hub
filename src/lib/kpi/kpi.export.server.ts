/** بناء تقرير أداء الفريق بصيغة CSV — خادم فقط، بلا أي بيانات عملاء أو مستندات. */
import { buildCsv } from "@/lib/csv";
import {
  KPI_DIMENSION_LABELS,
  PERIOD_LABELS,
  partialHistoryMessage,
  type TeamKpiResult,
} from "./kpi.shared";

const fmt = (value: number | null, suffix = "") =>
  value === null ? "غير قابل للتطبيق" : `${value}${suffix}`;

export function buildPerformanceCsv(result: TeamKpiResult): string {
  const preamble: unknown[][] = [
    ["تقرير أداء الفريق — منصة مِهلة"],
    ["الفترة", PERIOD_LABELS[result.period.preset]],
    ["من", result.period.current.from],
    ["إلى", result.period.current.to],
    ["المنطقة الزمنية", "Asia/Riyadh"],
    ["حدود الترتيب", "8 أعمال مؤهلة و14 يوم تتبع كحد أدنى"],
    ["ملاحظة التتبع", partialHistoryMessage(result.trackingStartedAt)],
  ];

  const headers = [
    "الترتيب",
    "العضو",
    "المسمى الوظيفي",
    "الدور",
    "الحالة",
    "الدرجة",
    "التقييم",
    "التغير عن الفترة السابقة",
    ...Object.values(KPI_DIMENSION_LABELS),
    "عدد الأعمال المؤهلة",
    "أيام التتبع",
    "منجزة في الفترة",
    "منجزة متأخرة",
    "مهام متأخرة",
    "مهل فائتة",
    "أعمال مفتوحة",
    "قضايا نشطة",
    "متوسط التأخير (أيام)",
  ];

  const rows = [...result.ranked, ...result.insufficient].map((m) => [
    m.eligible ? m.rank : "غير مؤهل للترتيب",
    m.fullName,
    m.jobTitle ?? "",
    m.role,
    m.isFormerMember ? "عضو سابق" : "عضو نشط",
    fmt(m.score),
    m.band?.label ?? "غير متوفر",
    m.trendPoints === null ? "لا مقارنة" : `${m.trendPoints > 0 ? "+" : ""}${m.trendPoints}`,
    ...m.dimensions.map((d) =>
      d.value === null
        ? "غير قابل للتطبيق"
        : `${Math.round(d.value * 10) / 10}% (${d.numerator}/${d.denominator})`,
    ),
    m.sampleItems,
    m.trackedDays,
    m.context.completed,
    m.context.completedLate,
    m.context.overdueTasks,
    m.context.overdueDeadlines,
    m.context.totalOpenWork,
    m.context.activeCases,
    fmt(m.context.averageDelayDays),
  ]);

  return buildCsv(headers, rows, preamble);
}