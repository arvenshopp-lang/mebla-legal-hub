/**
 * نموذج مهمة «إصلاح المستندات»: يُستخدم في المتصفح وفي الخادم معاً.
 * لا يحمل أي مسار تخزين ولا رابطاً موقّعاً — فقط نتيجة كل مستند.
 */

export type RepairOutcome = "verified" | "relinked" | "missing" | "invalid";

export type DocumentRepairResult = {
  documentId: string;
  fileName: string;
  outcome: RepairOutcome;
  /** أُعيد ربط سجل المستند بملفه الصحيح داخل المخزن. */
  relinked: boolean;
  /** الملف يُفتح في العارض الآمن بعلامة مائية. */
  viewable: boolean;
  /** الملف يُنزَّل كنسخة مائية. */
  downloadable: boolean;
  /** يحتاج إعادة استخراج نص (يتم في المتصفح بعد انتهاء الفحص). */
  needsReprocess: boolean;
  errorCode: string | null;
  /** معرّف تعرّف آمن لمتابعة العطل داخلياً دون كشف تفاصيل. */
  traceRef: string | null;
};

export type RepairReport = {
  scanned: number;
  verified: number;
  relinked: number;
  missing: number;
  invalid: number;
  requeued: number;
  results: DocumentRepairResult[];
};

export const REPAIR_OUTCOME_LABELS: Record<RepairOutcome, string> = {
  verified: "سليم وقابل للعرض والتنزيل",
  relinked: "أُعيد ربطه وأصبح قابلاً للعرض",
  missing: "الملف مفقود من المخزن — يلزم إعادة رفعه",
  invalid: "محتوى الملف غير صالح للعرض",
};

export const REPAIR_OUTCOME_TONE: Record<RepairOutcome, "green" | "info" | "red" | "warn"> = {
  verified: "green",
  relinked: "info",
  missing: "red",
  invalid: "warn",
};

export type RepairScope = "broken" | "all";

export function summarizeRepair(report: RepairReport): string {
  if (report.scanned === 0) return "لا توجد مستندات تحتاج فحصاً.";
  const parts = [`فُحص ${report.scanned} مستنداً`];
  if (report.relinked) parts.push(`أُعيد ربط ${report.relinked}`);
  if (report.requeued) parts.push(`أُعيدت معالجة ${report.requeued}`);
  if (report.missing) parts.push(`${report.missing} مفقود`);
  if (report.invalid) parts.push(`${report.invalid} غير صالح`);
  if (!report.relinked && !report.missing && !report.invalid) parts.push("جميعها قابلة للعرض والتنزيل");
  return `${parts.join(" · ")}.`;
}