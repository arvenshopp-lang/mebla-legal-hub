/**
 * تهيئة خلايا CSV بشكل آمن.
 * تمنع «حقن صِيَغ الجداول» (Formula Injection) حين يفتح الموظف الملف في Excel أو Google Sheets،
 * لأن أي قيمة تبدأ بـ = أو + أو - أو @ أو محرف تحكّم تُنفَّذ كصيغة.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** يُحيّد الصيغ ثم يقتبس القيمة لتكون خلية CSV صالحة. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // إزالة محارف التحكّم التي تُستغل لتقسيم الخلايا أو إخفاء الحمولة.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** يبني ملف CSV كاملاً من رؤوس وصفوف مع علامة BOM لدعم العربية. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const body = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
  return `\uFEFF${body}`;
}
