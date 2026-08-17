/**
 * أنواع ونصوص وحدة فوترة المكتب — آمنة للمتصفح.
 * الحسابات المعروضة هنا للعرض الفوري فقط؛ المصدر الوحيد للحقيقة هو ما تحسبه قاعدة البيانات.
 */

export const OFFICE_INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
] as const;
export type OfficeInvoiceStatus = (typeof OFFICE_INVOICE_STATUSES)[number];

export const OFFICE_INVOICE_STATUS_LABELS: Record<OfficeInvoiceStatus, string> = {
  draft: "مسودة",
  issued: "مُصدرة",
  partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

/** حالة العرض تشمل «متأخرة»، وهي مشتقة من تاريخ الاستحقاق ولا تُخزَّن. */
export type OfficeInvoiceDisplayStatus = OfficeInvoiceStatus | "overdue";

export const OFFICE_INVOICE_DISPLAY_LABELS: Record<OfficeInvoiceDisplayStatus, string> = {
  ...OFFICE_INVOICE_STATUS_LABELS,
  overdue: "متأخرة",
};

export const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  card: "شبكة/بطاقة",
  cheque: "شيك",
  other: "أخرى",
};

export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  amount: "مبلغ ثابت (ر.س)",
  percent: "نسبة مئوية (%)",
};

/** نسبة ضريبة القيمة المضافة الافتراضية في المملكة. */
export const DEFAULT_TAX_RATE = 15;

export type InvoiceTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
};

const money = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** حساب الإجماليات بنفس منطق قاعدة البيانات — للمعاينة الفورية داخل نموذج المسودة. */
export function computeInvoiceTotals(input: {
  items: { quantity: number; unitPrice: number }[];
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
}): InvoiceTotals {
  const subtotal = money(
    input.items.reduce((sum, it) => sum + money(it.quantity * it.unitPrice), 0),
  );
  const rawDiscount = Math.max(input.discountValue || 0, 0);
  const discountTotal =
    input.discountType === "percent"
      ? money((subtotal * Math.min(rawDiscount, 100)) / 100)
      : Math.min(money(rawDiscount), subtotal);
  const taxTotal = money(((subtotal - discountTotal) * Math.max(input.taxRate || 0, 0)) / 100);
  return { subtotal, discountTotal, taxTotal, total: money(subtotal - discountTotal + taxTotal) };
}

/** حالة العرض: الفاتورة غير المسددة التي تجاوز تاريخ استحقاقها اليوم تُعرض «متأخرة». */
export function displayStatus(invoice: {
  status: string;
  due_date: string | null;
  balance: number | string | null;
  todayRiyadh?: string;
}): OfficeInvoiceDisplayStatus {
  const status = invoice.status as OfficeInvoiceStatus;
  if (status !== "issued" && status !== "partially_paid") return status;
  const balance = Number(invoice.balance ?? 0);
  if (balance <= 0 || !invoice.due_date) return status;
  const today = invoice.todayRiyadh ?? riyadhToday();
  return invoice.due_date < today ? "overdue" : status;
}

/** تاريخ اليوم بتوقيت الرياض بصيغة YYYY-MM-DD. */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** إضافة أيام على تاريخ ميلادي بصيغة YYYY-MM-DD دون انزياح منطقة زمنية. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export const STATUS_TONE: Record<
  OfficeInvoiceDisplayStatus,
  "neutral" | "info" | "success" | "warn" | "danger"
> = {
  draft: "neutral",
  issued: "info",
  partially_paid: "warn",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};