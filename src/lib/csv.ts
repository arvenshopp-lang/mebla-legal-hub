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
  // نطاق أحرف التحكم مقصود: تنقية خلايا CSV من محارف التحكم قبل التصدير.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * يبني ملف CSV كاملاً من رؤوس وصفوف مع علامة BOM لدعم العربية.
 * يمكن تمرير أسطر تعريفية (preamble) تُكتب قبل صف الرؤوس، مثل المنطقة الزمنية وعدد النتائج.
 */
export function buildCsv(
  headers: string[],
  rows: unknown[][],
  preamble?: readonly unknown[][],
): string {
  const lines: string[] = [];
  if (preamble?.length) {
    for (const line of preamble) lines.push(line.map(csvCell).join(","));
    lines.push("");
  }
  lines.push(headers.map(csvCell).join(","));
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}
