/**
 * أنواع مشتركة وحسابات نقية لوحدة عروض الأسعار والمقترحات والعقود.
 * قاعدة ثابتة: حساب الإجماليات هنا هو المرجع الوحيد، ويُعاد تنفيذه حرفياً
 * على الخادم قبل أي كتابة — لا يُقبل أي إجمالي يصل من المتصفح.
 */

export type SalesDocKind = "quote" | "proposal" | "contract";
export type SalesDocStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "active"
  | "terminated";

export type DiscountType = "percent" | "amount";

export const KIND_LABELS: Record<SalesDocKind, string> = {
  quote: "عرض سعر",
  proposal: "مقترح",
  contract: "عقد",
};

export const STATUS_LABELS: Record<SalesDocStatus, string> = {
  draft: "مسودة",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  sent: "مُرسل",
  viewed: "تمت المشاهدة",
  accepted: "مقبول",
  rejected: "مرفوض",
  expired: "منتهي الصلاحية",
  cancelled: "ملغى",
  active: "عقد نشط",
  terminated: "منتهٍ",
};

export const STATUS_TONE: Record<SalesDocStatus, "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"> = {
  draft: "muted",
  pending_approval: "warn",
  approved: "info",
  sent: "info",
  viewed: "info",
  accepted: "green",
  rejected: "red",
  expired: "muted",
  cancelled: "red",
  active: "green",
  terminated: "muted",
};

/** الحد الأقصى لنسبة الخصم قبل وجوب طلب اعتماد صريح (مبدأ الفصل بين المُنشئ والمعتمد). */
export const APPROVAL_DISCOUNT_PERCENT_THRESHOLD = 15;

export type SalesDocItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
};

export type SalesDocTotals = {
  subtotal: number;
  discount_amount: number;
  taxable: number;
  tax_amount: number;
  total: number;
  /** نسبة الخصم الفعلية على الإجمالي الفرعي — تُستخدم لتحديد وجوب الاعتماد. */
  effective_discount_percent: number;
  requires_approval: boolean;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** حساب إجماليات مستند البيع — نفس المنطق يُنفَّذ على الخادم قبل أي كتابة. */
export function computeSalesDocTotals(
  items: SalesDocItemInput[],
  discountType: DiscountType,
  discountValue: number,
  taxRate: number,
): SalesDocTotals {
  const subtotal = round2(
    items.reduce((sum, it) => sum + Math.max(0, it.quantity * it.unit_price - it.discount_amount), 0),
  );
  const rawDiscount =
    discountType === "percent" ? (subtotal * Math.max(0, discountValue)) / 100 : Math.max(0, discountValue);
  const discountAmount = round2(Math.min(rawDiscount, subtotal));
  const taxable = round2(Math.max(0, subtotal - discountAmount));
  const taxAmount = round2((taxable * Math.max(0, taxRate)) / 100);
  const total = round2(taxable + taxAmount);
  const effectiveDiscountPercent = subtotal > 0 ? round2((discountAmount / subtotal) * 100) : 0;
  return {
    subtotal,
    discount_amount: discountAmount,
    taxable,
    tax_amount: taxAmount,
    total,
    effective_discount_percent: effectiveDiscountPercent,
    requires_approval: effectiveDiscountPercent > APPROVAL_DISCOUNT_PERCENT_THRESHOLD,
  };
}

/** الانتقالات المسموحة لكل حالة — تُستخدم للتحقق قبل أي تغيير حالة على الخادم. */
export const STATUS_TRANSITIONS: Record<SalesDocStatus, SalesDocStatus[]> = {
  draft: ["pending_approval", "sent", "cancelled"],
  pending_approval: ["approved", "draft"],
  approved: ["sent", "draft"],
  sent: ["viewed", "accepted", "rejected", "expired", "cancelled"],
  viewed: ["accepted", "rejected", "expired", "cancelled"],
  accepted: ["active"],
  rejected: [],
  expired: [],
  cancelled: [],
  active: ["terminated"],
  terminated: [],
};

export type SalesDocRow = {
  id: string;
  kind: SalesDocKind;
  status: SalesDocStatus;
  number: string | null;
  title: string;
  organization_id: string | null;
  organization_name?: string | null;
  company_id: string | null;
  contact_id: string | null;
  currency: string;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  requires_approval: boolean;
  locked: boolean;
  owner_staff_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  decided_at: string | null;
  valid_until: string | null;
  starts_on: string | null;
  ends_on: string | null;
  converted_invoice_id: string | null;
  converted_subscription_id: string | null;
};

export type SalesDocItemRow = {
  id: string;
  document_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  amount: number;
  sort_order: number;
};

export type SalesDocEventRow = {
  id: string;
  document_id: string;
  event: string;
  from_status: SalesDocStatus | null;
  to_status: SalesDocStatus | null;
  actor_email: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SalesDocSignatureRow = {
  id: string;
  document_id: string;
  signer_name: string;
  signer_email: string;
  signer_role: string | null;
  method: string;
  evidence_hash: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
  created_at: string;
};

export type SalesDocTemplateRow = {
  id: string;
  kind: SalesDocKind;
  name: string;
  intro: string | null;
  terms: string | null;
  default_tax_rate: number;
  default_validity_days: number;
  items: SalesDocItemInput[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
