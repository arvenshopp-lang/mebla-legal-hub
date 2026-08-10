/**
 * ميزانية أداء الخطوط — مصدر واحد للحقيقة.
 *
 * تُستخدم في ثلاثة مواضع:
 *  1. حاجز البناء `bun run fonts:budget` (أحجام الملفات في public/fonts).
 *  2. مراقب بيئة التطوير (تحذير في الطرفية عند تجاوز الميزانية أثناء التصفح).
 *  3. اختبار الشبكة E2E.
 */

export const FONT_BUDGET = {
  /** أقصى عدد ملفات خطوط تُحمَّل فعلياً عبر الشبكة في عرض صفحة واحد */
  maxFilesPerPage: 5,
  /** أقصى حجم نقل تراكمي لملفات الخطوط في عرض صفحة واحد (بايت) */
  maxTransferBytesPerPage: 120 * 1024,
  /** أقصى حجم لملف خط واحد (بايت) */
  maxFileBytes: 40 * 1024,
  /** أقصى حجم تراكمي لكل ملفات الخطوط المستضافة محلياً (بايت) */
  maxTotalAssetBytes: 200 * 1024,
} as const;

export type FontResourceSample = {
  name: string;
  transferSize: number;
};

export type FontBudgetViolation =
  | { kind: "files"; actual: number; limit: number }
  | { kind: "transfer"; actual: number; limit: number }
  | { kind: "file"; file: string; actual: number; limit: number };

export type FontBudgetReport = {
  files: string[];
  fileCount: number;
  transferBytes: number;
  violations: FontBudgetViolation[];
  withinBudget: boolean;
};

const FONT_FILE_PATTERN = /\.(woff2?|ttf|otf)(\?|$)/i;

export function isFontResource(name: string): boolean {
  return FONT_FILE_PATTERN.test(name);
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** تقييم عيّنة من موارد الخطوط مقابل الميزانية. دالة نقية قابلة للاختبار. */
export function evaluateFontBudget(samples: readonly FontResourceSample[]): FontBudgetReport {
  // الملفات المخدومة من الذاكرة/الكاش لها transferSize = 0 ولا تُحسب ضمن ميزانية النقل
  const networkSamples = samples.filter((s) => s.transferSize > 0);
  const files = networkSamples.map((s) => s.name);
  const transferBytes = networkSamples.reduce((sum, s) => sum + s.transferSize, 0);
  const violations: FontBudgetViolation[] = [];

  if (files.length > FONT_BUDGET.maxFilesPerPage) {
    violations.push({ kind: "files", actual: files.length, limit: FONT_BUDGET.maxFilesPerPage });
  }
  if (transferBytes > FONT_BUDGET.maxTransferBytesPerPage) {
    violations.push({
      kind: "transfer",
      actual: transferBytes,
      limit: FONT_BUDGET.maxTransferBytesPerPage,
    });
  }
  for (const sample of networkSamples) {
    if (sample.transferSize > FONT_BUDGET.maxFileBytes) {
      violations.push({
        kind: "file",
        file: sample.name,
        actual: sample.transferSize,
        limit: FONT_BUDGET.maxFileBytes,
      });
    }
  }

  return {
    files,
    fileCount: files.length,
    transferBytes,
    violations,
    withinBudget: violations.length === 0,
  };
}

export function describeViolation(violation: FontBudgetViolation): string {
  switch (violation.kind) {
    case "files":
      return `عدد ملفات الخطوط ${violation.actual} يتجاوز الحد ${violation.limit}`;
    case "transfer":
      return `حجم نقل الخطوط ${formatBytes(violation.actual)} يتجاوز الحد ${formatBytes(violation.limit)}`;
    case "file":
      return `الملف ${violation.file} بحجم ${formatBytes(violation.actual)} يتجاوز حد الملف ${formatBytes(violation.limit)}`;
  }
}