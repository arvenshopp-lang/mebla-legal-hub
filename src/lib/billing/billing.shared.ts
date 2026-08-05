/**
 * المركز المالي — أنواع ومسميات وحسابات مشتركة بين الخادم والواجهة.
 * لا يحتوي هذا الملف على أي منطق خادمي أو أسرار.
 */

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "pending",
  "paid",
  "partially_paid",
  "overdue",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "مسودة",
  issued: "مُصدرة",
  pending: "بانتظار السداد",
  paid: "مسددة",
  partially_paid: "مسددة جزئياً",
  overdue: "متأخرة",
  cancelled: "ملغاة",
  refunded: "مرتجعة",
  partially_refunded: "مرتجعة جزئياً",
};

export const INVOICE_STATUS_TONES: Record<
  InvoiceStatus,
  "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"
> = {
  draft: "muted",
  issued: "info",
  pending: "warn",
  paid: "green",
  partially_paid: "gold",
  overdue: "red",
  cancelled: "muted",
  refunded: "red",
  partially_refunded: "gold",
};

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار الاعتماد",
  processing: "قيد المعالجة",
  paid: "مُعتمدة",
  failed: "فاشلة",
  cancelled: "ملغاة",
  refunded: "مُستردة",
  partially_refunded: "مُستردة جزئياً",
};

export const PAYMENT_STATUS_TONES: Record<
  PaymentStatus,
  "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"
> = {
  pending: "warn",
  processing: "info",
  paid: "green",
  failed: "red",
  cancelled: "muted",
  refunded: "red",
  partially_refunded: "gold",
};

export const PAYMENT_METHODS = [
  "bank_transfer",
  "manual",
  "card",
  "apple_pay",
  "stc_pay",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "تحويل بنكي",
  manual: "تحصيل يدوي",
  card: "بطاقة",
  apple_pay: "Apple Pay",
  stc_pay: "STC Pay",
  other: "أخرى",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  processing: "قيد التنفيذ",
  completed: "منفّذ",
  failed: "فاشل",
  cancelled: "ملغى",
};

export const WEBHOOK_STATUS_LABELS: Record<string, string> = {
  received: "مستلم",
  processed: "مُعالج",
  ignored: "مُتجاهل",
  failed: "فاشل",
  dead_letter: "رسائل فاشلة نهائياً",
};

export const PROVIDER_STATUS_LABELS: Record<string, string> = {
  not_configured: "غير مهيّأ",
  configured: "مهيّأ (بانتظار اختبار الاتصال)",
  verified: "مُتحقق منه",
  failed: "فشل الاتصال",
};

/* ----------------------------------------------------------------- الأنواع */

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
};

export type InvoiceItemRow = InvoiceItemInput & {
  id: string;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
};

export type InvoiceRow = {
  id: string;
  number: string;
  organization_id: string | null;
  organization_name: string | null;
  customer_name: string;
  customer_email: string | null;
  currency: string;
  total: number;
  paid_total: number;
  refunded_total: number;
  remaining: number;
  tax_total: number;
  discount_total: number;
  subtotal: number;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
};

export type InvoiceDetail = InvoiceRow & {
  customer_legal_name: string | null;
  customer_phone: string | null;
  billing_address: string | null;
  commercial_registration: string | null;
  tax_number: string | null;
  tax_rate: number;
  tax_exempt: boolean;
  tax_exemption_reason: string | null;
  plan_code: string | null;
  plan_label: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  internal_notes: string | null;
  coupon_code: string | null;
  created_by_email: string | null;
  items: InvoiceItemRow[];
  payments: PaymentRow[];
  refunds: RefundRow[];
  credit_notes: CreditNoteRow[];
  notes_log: BillingNoteRow[];
};

export type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider: string;
  status: PaymentStatus;
  provider_payment_id: string | null;
  bank_reference: string | null;
  proof_path: string | null;
  refunded_amount: number;
  received_at: string | null;
  paid_at: string | null;
  submitted_by_email: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  failure_message: string | null;
  notes: string | null;
  created_at: string;
};

export type RefundRow = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  reason: string;
  status: string;
  provider: string;
  requested_by_email: string | null;
  approved_by_email: string | null;
  processed_at: string | null;
  failure_message: string | null;
  created_at: string;
};

export type CreditNoteRow = {
  id: string;
  number: string;
  invoice_id: string;
  amount: number;
  tax_amount: number;
  reason: string;
  status: string;
  issued_at: string;
  created_by_email: string | null;
};

export type BillingNoteRow = {
  id: string;
  body: string;
  author_email: string | null;
  created_at: string;
};

/* ---------------------------------------------------------------- الحسابات */

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** حساب بنود الفاتورة — نفس المعادلة المستخدمة على الخادم وفي قاعدة البيانات. */
export function computeTotals(
  items: InvoiceItemInput[],
  taxRate: number,
  taxExempt: boolean,
): { subtotal: number; discountTotal: number; taxTotal: number; total: number } {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const gross = Number(item.quantity) * Number(item.unitPrice);
    const discount = Math.min(Number(item.discountAmount) || 0, gross);
    subtotal += gross;
    discountTotal += discount;
    if (!taxExempt) taxTotal += (gross - discount) * (Number(taxRate) / 100);
  }
  const total = round2(Math.max(subtotal - discountTotal, 0) + taxTotal);
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total,
  };
}

export function formatMoney(amount: number | string | null | undefined, currency = "SAR"): string {
  const value = Number(amount ?? 0);
  const label = currency === "SAR" ? "ر.س" : currency;
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(value)} · ${date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

/** فئات تقرير أعمار الدين. */
export const AGING_BUCKETS = [
  { key: "current", label: "غير مستحقة", min: -100000, max: 0 },
  { key: "d1_30", label: "١–٣٠ يوماً", min: 1, max: 30 },
  { key: "d31_60", label: "٣١–٦٠ يوماً", min: 31, max: 60 },
  { key: "d61_90", label: "٦١–٩٠ يوماً", min: 61, max: 90 },
  { key: "d90_plus", label: "أكثر من ٩٠ يوماً", min: 91, max: 1_000_000 },
] as const;
export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export type BillingReports = {
  generated_at: string;
  range: { from: string; to: string };
  summary: {
    invoiced_total: number;
    collected_total: number;
    outstanding_total: number;
    overdue_total: number;
    refunded_total: number;
    discount_total: number;
    tax_total: number;
    credit_note_total: number;
    invoice_count: number;
    paid_count: number;
    partially_paid_count: number;
    overdue_count: number;
    collection_rate: number;
  };
  aging: { key: AgingBucketKey; label: string; count: number; amount: number }[];
  by_plan: { label: string; count: number; invoiced: number; collected: number }[];
  by_office: {
    label: string;
    count: number;
    invoiced: number;
    collected: number;
    outstanding: number;
  }[];
  by_month: { month: string; invoiced: number; collected: number; count: number }[];
  payments_by_method: { label: string; count: number; amount: number }[];
  unmatched_payments: {
    id: string;
    number: string;
    amount: number;
    created_at: string;
    method: string;
  }[];
};
/** قيمة قابلة للتسلسل عبر حدود الخادم (JSON فقط). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
/** صف بيانات مالي قابل للتسلسل — يُستخدم في مخرجات دوال الخادم. */
export type BillingRow = { [key: string]: JsonValue };
