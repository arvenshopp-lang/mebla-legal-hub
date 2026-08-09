/**
 * تعريفات أعمدة تصدير سجل التدقيق — مشتركة بين واجهة الإدارة ودالة التصدير الخادمية.
 */

export const AUDIT_TIMEZONE = "Asia/Riyadh";
export const AUDIT_TIMEZONE_LABEL = "توقيت الرياض (UTC+03)";

export type AuditExportColumn = {
  key: string;
  label: string;
  /** أعمدة إلزامية لا يمكن استثناؤها من الملف. */
  required?: boolean;
};

export const AUDIT_EXPORT_COLUMNS: AuditExportColumn[] = [
  { key: "created_at", label: "التاريخ", required: true },
  { key: "actor_email", label: "المنفّذ" },
  { key: "action", label: "العملية", required: true },
  { key: "entity_type", label: "النوع" },
  { key: "entity_id", label: "معرّف العنصر" },
  { key: "description", label: "الوصف" },
  { key: "ip", label: "عنوان الشبكة" },
  { key: "device", label: "الجهاز" },
  { key: "browser", label: "المتصفح" },
];

export const AUDIT_EXPORT_COLUMN_KEYS = AUDIT_EXPORT_COLUMNS.map((c) => c.key);

export const AUDIT_EXPORT_REQUIRED_KEYS = AUDIT_EXPORT_COLUMNS.filter((c) => c.required).map(
  (c) => c.key,
);

export const AUDIT_EXPORT_DEFAULT_KEYS = AUDIT_EXPORT_COLUMN_KEYS;

/** يوحّد قائمة الأعمدة المطلوبة: يحافظ على الترتيب الرسمي ويضمن الأعمدة الإلزامية. */
export function normalizeAuditColumns(keys: readonly string[]): string[] {
  const requested = new Set(keys.filter((k) => AUDIT_EXPORT_COLUMN_KEYS.includes(k)));
  for (const k of AUDIT_EXPORT_REQUIRED_KEYS) requested.add(k);
  return AUDIT_EXPORT_COLUMN_KEYS.filter((k) => requested.has(k));
}

/** يصيغ الطابع الزمني بتوقيت الرياض بصيغة ثابتة قابلة للفرز داخل الجداول. */
export function formatAuditTimestamp(value: string, withZone: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUDIT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  return withZone ? `${stamp} (${AUDIT_TIMEZONE} +03:00)` : stamp;
}