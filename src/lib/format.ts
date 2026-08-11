/**
 * وحدة التنسيق الموحّدة لمنصة مِهلة — المصدر الوحيد للحقيقة.
 *
 * قواعد ثابتة على مستوى المنصة:
 * - كل الأرقام بالأرقام الإنجليزية (0-9) عبر `nu-latn`.
 * - كل التواريخ ميلادية (Gregorian) بتوقيت الرياض.
 * - صيغة واحدة للتاريخ وواحدة للتاريخ والوقت في كل الشاشات والتصدير.
 */

export const RIYADH_TZ = "Asia/Riyadh";

/** عربية سعودية + تقويم ميلادي + أرقام لاتينية. */
export const AR_LOCALE = "ar-SA-u-ca-gregory-nu-latn";

const numberFmt = new Intl.NumberFormat(AR_LOCALE, { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat(AR_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: RIYADH_TZ,
});
const timeFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: RIYADH_TZ,
});
const numericDateFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: RIYADH_TZ,
});

const DASH = "—";

const toDate = (v: string | number | Date | null | undefined): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

/** عدد صحيح بفواصل آلاف وأرقام إنجليزية. */
export const fmtNumber = (n: number | null | undefined): string => numberFmt.format(Number(n ?? 0));

/** عدد بمنزلتين عشريتين — للمبالغ والنِسب الدقيقة. */
export const fmtDecimal = (n: number | null | undefined): string =>
  decimalFmt.format(Number(n ?? 0));

/** مبلغ مالي مع العملة (الافتراضي الريال السعودي). */
export const fmtMoney = (n: number | null | undefined, currency = "ر.س"): string =>
  `${fmtDecimal(n)} ${currency}`;

/** نسبة مئوية بأرقام إنجليزية. */
export const fmtPercent = (n: number | null | undefined, fractionDigits = 1): string =>
  `${new Intl.NumberFormat(AR_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(n ?? 0))}%`;

/** تاريخ ميلادي موحّد: 11 أغسطس 2026. */
export const fmtDate = (v: string | number | Date | null | undefined): string => {
  const d = toDate(v);
  return d ? dateFmt.format(d) : DASH;
};

/** تاريخ ووقت موحّد: 11 أغسطس 2026 · 17:45 (توقيت الرياض). */
export const fmtDateTime = (v: string | number | Date | null | undefined): string => {
  const d = toDate(v);
  return d ? `${dateFmt.format(d)} · ${timeFmt.format(d)}` : DASH;
};

/** وقت فقط بنظام 24 ساعة بتوقيت الرياض. */
export const fmtTime = (v: string | number | Date | null | undefined): string => {
  const d = toDate(v);
  return d ? timeFmt.format(d) : DASH;
};

/** تاريخ رقمي للجداول والتصدير والفرز: YYYY-MM-DD. */
export const fmtDateNumeric = (v: string | number | Date | null | undefined): string => {
  const d = toDate(v);
  return d ? numericDateFmt.format(d) : DASH;
};

/** فرق زمني مقروء بأرقام إنجليزية. */
export const fmtRelative = (v: string | number | Date | null | undefined): string => {
  const d = toDate(v);
  if (!d) return DASH;
  const diff = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 3600],
    ["hour", 86400],
    ["day", 2592000],
    ["month", 31536000],
  ];
  const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  for (let i = 1; i < units.length; i += 1) {
    const [unit, limit] = units[i]!;
    if (abs < limit) return rtf.format(Math.round(diff / (units[i - 1]![1] || 1)), unit);
  }
  return rtf.format(Math.round(diff / 31536000), "year");
};

/** حجم ملف بأرقام إنجليزية. */
export const fmtSize = (bytes?: number | null): string => {
  const v = Number(bytes ?? 0);
  if (!v) return DASH;
  if (v >= 1024 ** 3) return `${fmtDecimal(v / 1024 ** 3)} ج.ب`;
  if (v >= 1024 ** 2) return `${fmtDecimal(v / 1024 ** 2)} م.ب`;
  if (v >= 1024) return `${fmtNumber(v / 1024)} ك.ب`;
  return `${fmtNumber(v)} بايت`;
};
