/**
 * محرك المركز المالي — يُستدعى من داخل معالجات دوال الخادم فقط.
 *
 * قواعد ثابتة:
 * - لا يُقبل أي مبلغ محسوب في المتصفح: كل الإجماليات تُحسب في قاعدة البيانات
 *   (recalc_invoice) والبنود تُحفظ عبر عملية ذرّية واحدة (billing_save_draft).
 * - كل عملية مالية تكتب سجل تدقيق يحمل الحالة قبل/بعد ومعرّف الارتباط.
 * - الفترات المقفلة يفرضها مشغّل قاعدة البيانات، لا الواجهة.
 */
import { writeAudit, type StaffRow } from "@/lib/admin-guard.server";
import { getProvider } from "./providers.server";
import type { BillingRow, BillingReports, InvoiceDetail, InvoiceRow } from "./billing.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type BillingCtx = {
  /** عميل المستخدم — يُستخدم لدوال قاعدة البيانات التي تتحقق من الصلاحية بنفسها. */
  sb: AnyClient;
  staff: StaffRow;
  correlationId: string;
  requestId: string;
};

async function db(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** رسائل قاعدة البيانات التقنية تُترجم لرسائل عربية مفهومة. */
const DB_ERRORS: Record<string, string> = {
  FINANCIAL_PERIOD_CLOSED: "الفترة المالية مقفلة، ولا يمكن تسجيل أو تعديل أي حركة داخلها.",
  INVOICE_NOT_EDITABLE: "لا يمكن تعديل فاتورة بعد إصدارها.",
  INVOICE_NOT_FOUND: "الفاتورة غير موجودة.",
  ENTRY_NOT_FOUND: "الحركة البنكية غير موجودة.",
  ENTRY_ALREADY_MATCHED: "الحركة مطابَقة مسبقاً.",
  PAYMENT_NOT_FOUND: "الدفعة غير موجودة.",
  CURRENCY_MISMATCH: "عملة الحركة تختلف عن عملة الدفعة.",
  REQUEST_NOT_FOUND: "طلب إعادة الفتح غير موجود.",
  REQUEST_NOT_PENDING: "الطلب لم يعد بانتظار الاعتماد.",
  SELF_APPROVAL_FORBIDDEN: "لا يمكن اعتماد طلبك بنفسك — يلزم موظف آخر.",
  FORBIDDEN: "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.",
  FINANCIAL_RECORD_DELETE_FORBIDDEN: "لا يمكن حذف السجلات المالية نهائياً.",
};

export function translateDbError(message: string | null | undefined, fallback: string): string {
  const raw = String(message ?? "");
  for (const [code, text] of Object.entries(DB_ERRORS)) {
    if (raw.includes(code)) return text;
  }
  return fallback;
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(translateDbError(error?.message, fallback));
}

export function newCorrelationId(prefix = "bil"): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------- تسجيل محاولات الدفع */

export async function logAttempt(input: {
  paymentId?: string | null;
  invoiceId?: string | null;
  provider: string;
  operation: string;
  status: "success" | "failed" | "pending";
  providerStatus?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  request?: unknown;
  response?: unknown;
  durationMs?: number | null;
}): Promise<void> {
  const client = await db();
  await client.from("platform_payment_attempts").insert({
    payment_id: input.paymentId ?? null,
    invoice_id: input.invoiceId ?? null,
    provider: input.provider,
    operation: input.operation,
    status: input.status,
    provider_status: input.providerStatus ?? null,
    http_status: input.httpStatus ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    request_id: input.requestId ?? null,
    correlation_id: input.correlationId ?? null,
    request_payload: (input.request ?? {}) as never,
    response_payload: (input.response ?? {}) as never,
    duration_ms: input.durationMs ?? null,
  });
}

/* ------------------------------------------------------------------ الفواتير */

const INVOICE_LIST_COLUMNS =
  "id, number, organization_id, customer_name, customer_email, currency, subtotal, discount_total, tax_total, total, paid_total, refunded_total, remaining, status, issued_at, due_at, created_at, plan_label";

export type InvoiceFilters = {
  search?: string | null;
  status?: string | null;
  organizationId?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
};

export async function listInvoices(
  _ctx: BillingCtx,
  filters: InvoiceFilters,
): Promise<{ rows: InvoiceRow[]; total: number }> {
  const client = await db();
  let query = client
    .from("platform_invoices")
    .select(`${INVOICE_LIST_COLUMNS}, organizations(name)`, { count: "exact" });

  const search = filters.search?.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, " ");
    query = query.or(
      `number.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_email.ilike.%${safe}%`,
    );
  }
  if (filters.status && filters.status !== "all") {
    if (filters.status === "unpaid")
      query = query.in("status", ["issued", "pending", "partially_paid", "overdue"]);
    else query = query.eq("status", filters.status);
  }
  if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب الفواتير.");

  const rows = (data ?? []).map((row: BillingRow & { organizations?: { name?: string } }) => ({
    ...(row as unknown as InvoiceRow),
    organization_name: row.organizations?.name ?? null,
  })) as InvoiceRow[];
  return { rows, total: count ?? 0 };
}

export async function getInvoiceDetail(_ctx: BillingCtx, id: string): Promise<InvoiceDetail> {
  const client = await db();
  const { data, error } = await client
    .from("platform_invoices")
    .select("*, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error, "تعذّر جلب الفاتورة.");
  if (!data) throw new Error("الفاتورة غير موجودة.");

  const [items, payments, refunds, creditNotes, notes] = await Promise.all([
    client.from("platform_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    client
      .from("platform_payments")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("platform_refunds")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("platform_credit_notes")
      .select("*")
      .eq("invoice_id", id)
      .order("issued_at", { ascending: false }),
    client
      .from("platform_billing_notes")
      .select("*")
      .eq("resource_type", "invoice")
      .eq("resource_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const row = data as BillingRow & { organizations?: { name?: string } };
  return {
    ...(row as unknown as InvoiceDetail),
    organization_name: row.organizations?.name ?? null,
    items: (items.data ?? []).map((i: BillingRow) => ({
      id: i["id"] as string,
      description: i["description"] as string,
      quantity: Number(i["quantity"]),
      unitPrice: Number(i["unit_price"]),
      discountAmount: Number(i["discount_amount"]),
      taxRate: Number(i["tax_rate"]),
      lineSubtotal: Number(i["line_subtotal"]),
      lineTax: Number(i["line_tax"]),
      lineTotal: Number(i["line_total"]),
    })),
    payments: (payments.data ?? []) as InvoiceDetail["payments"],
    refunds: (refunds.data ?? []) as InvoiceDetail["refunds"],
    credit_notes: (creditNotes.data ?? []) as InvoiceDetail["credit_notes"],
    notes_log: (notes.data ?? []).map((n: BillingRow) => ({
      id: n["id"] as string,
      body: n["body"] as string,
      author_email: (n["author_email"] as string | null) ?? null,
      created_at: n["created_at"] as string,
    })),
  };
}

/** سجل التدقيق الخاص بالفاتورة — يُبنى من admin_audit_logs. */
export async function getInvoiceAudit(
  _ctx: BillingCtx,
  id: string,
): Promise<
  {
    id: string;
    action: string;
    actor_email: string | null;
    description: string | null;
    created_at: string;
  }[]
> {
  const client = await db();
  const { data } = await client
    .from("admin_audit_logs")
    .select("id, action, actor_email, description, created_at")
    .eq("entity_type", "invoice")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as never;
}

export type DraftItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
};

export type DraftInput = {
  id?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  planCode?: string | null;
  planLabel?: string | null;
  customerName: string;
  customerLegalName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  billingAddress?: string | null;
  commercialRegistration?: string | null;
  taxNumber?: string | null;
  currency: string;
  taxRate: number;
  taxExempt: boolean;
  taxExemptionReason?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  dueAt?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  items: DraftItemInput[];
};

export async function saveDraft(ctx: BillingCtx, input: DraftInput): Promise<string> {
  const before = input.id ? await safeInvoiceSnapshot(input.id) : null;
  const { data, error } = await ctx.sb.rpc("billing_save_draft", {
    _payload: {
      id: input.id ?? null,
      organization_id: input.organizationId ?? null,
      user_id: input.userId ?? null,
      plan_code: input.planCode ?? null,
      plan_label: input.planLabel ?? null,
      customer_name: input.customerName,
      customer_legal_name: input.customerLegalName ?? null,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      billing_address: input.billingAddress ?? null,
      commercial_registration: input.commercialRegistration ?? null,
      tax_number: input.taxNumber ?? null,
      currency: input.currency,
      tax_rate: input.taxRate,
      tax_exempt: input.taxExempt,
      tax_exemption_reason: input.taxExemptionReason ?? null,
      service_period_start: input.servicePeriodStart ?? null,
      service_period_end: input.servicePeriodEnd ?? null,
      due_at: input.dueAt ?? null,
      notes: input.notes ?? null,
      internal_notes: input.internalNotes ?? null,
      items: input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_amount: item.discountAmount,
      })),
    },
  });
  if (error) fail(error, "تعذّر حفظ مسودة الفاتورة.");
  const invoiceId = data as string;
  const after = await safeInvoiceSnapshot(invoiceId);
  await writeAudit(await db(), ctx.staff, {
    action: input.id ? "billing.invoice.update_draft" : "billing.invoice.create_draft",
    entity_type: "invoice",
    entity_id: invoiceId,
    description: input.id ? "تعديل مسودة فاتورة" : "إنشاء مسودة فاتورة",
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      items: input.items.length,
    },
    before,
    after,
  });
  return invoiceId;
}

async function safeInvoiceSnapshot(id: string): Promise<BillingRow | null> {
  const client = await db();
  const { data } = await client
    .from("platform_invoices")
    .select(
      "number, status, subtotal, discount_total, tax_total, total, paid_total, refunded_total, remaining, due_at, issued_at",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as BillingRow | null) ?? null;
}

export async function issueInvoice(
  ctx: BillingCtx,
  input: { id: string; dueAt?: string | null; notify: boolean },
): Promise<{ number: string; emailed: boolean }> {
  const client = await db();
  const before = await safeInvoiceSnapshot(input.id);
  const { data: invoice } = await client
    .from("platform_invoices")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  if (invoice.status !== "draft") throw new Error("الفاتورة مُصدرة مسبقاً.");

  const { count } = await client
    .from("platform_invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", input.id);
  if (!count) throw new Error("لا يمكن إصدار فاتورة بدون بنود.");

  const issuedAt = new Date().toISOString();
  // انتقال حالة ذرّي: نداءان متزامنان لا ينجحان معاً على نفس الفاتورة.
  const { data: claimed, error } = await client
    .from("platform_invoices")
    .update({
      status: "pending",
      issued_at: issuedAt,
      due_at: input.dueAt ?? invoice.due_at ?? new Date(Date.now() + 14 * 86400_000).toISOString(),
      updated_at: issuedAt,
    })
    .eq("id", input.id)
    .eq("status", "draft")
    .select("id");
  if (error) fail(error, "تعذّر إصدار الفاتورة.");
  if (!claimed || claimed.length === 0) throw new Error("الفاتورة مُصدرة مسبقاً.");
  await client.rpc("recalc_invoice", { _invoice_id: input.id });

  let emailed = false;
  if (input.notify) emailed = await notifyBillingEvent(input.id, "invoice_issued");

  await writeAudit(client, ctx.staff, {
    action: "billing.invoice.issue",
    entity_type: "invoice",
    entity_id: input.id,
    description: `إصدار الفاتورة ${invoice.number}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId, emailed },
    before,
    after: await safeInvoiceSnapshot(input.id),
  });
  return { number: invoice.number as string, emailed };
}

export async function cancelInvoice(
  ctx: BillingCtx,
  input: { id: string; reason: string },
): Promise<void> {
  const client = await db();
  const before = await safeInvoiceSnapshot(input.id);
  const { data: invoice } = await client
    .from("platform_invoices")
    .select("id, number, status, paid_total")
    .eq("id", input.id)
    .maybeSingle();
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  if (invoice.status === "cancelled") throw new Error("الفاتورة ملغاة مسبقاً.");
  if (Number(invoice.paid_total) > 0)
    throw new Error("لا يمكن إلغاء فاتورة عليها تحصيل — استخدم الاسترداد أو إشعار الخصم.");

  const { error } = await client
    .from("platform_invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: input.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) fail(error, "تعذّر إلغاء الفاتورة.");

  await writeAudit(client, ctx.staff, {
    action: "billing.invoice.cancel",
    entity_type: "invoice",
    entity_id: input.id,
    description: `إلغاء الفاتورة ${invoice.number}: ${input.reason}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before,
    after: await safeInvoiceSnapshot(input.id),
  });
}

/* ----------------------------------------------------------------- الدفعات */

export async function listPayments(
  _ctx: BillingCtx,
  filters: {
    search?: string | null;
    status?: string | null;
    method?: string | null;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  let query = client
    .from("platform_payments")
    .select("*, platform_invoices(number, customer_name)", { count: "exact" });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.method && filters.method !== "all") query = query.eq("method", filters.method);
  const search = filters.search?.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, " ");
    query = query.or(`bank_reference.ilike.%${safe}%,provider_payment_id.ilike.%${safe}%`);
  }
  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب الدفعات.");
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

export async function recordPayment(
  ctx: BillingCtx,
  input: {
    invoiceId: string;
    amount: number;
    method: string;
    receivedAt?: string | null;
    bankReference?: string | null;
    proofPath?: string | null;
    notes?: string | null;
    idempotencyKey: string;
  },
): Promise<{ paymentId: string; duplicate: boolean }> {
  const client = await db();

  // منع التكرار: نفس مفتاح التفرّد لا يُنشئ دفعتين.
  const { data: existing } = await client
    .from("platform_payments")
    .select("id")
    .eq("correlation_id", input.idempotencyKey)
    .maybeSingle();
  if (existing) return { paymentId: existing.id as string, duplicate: true };

  const { data: invoice } = await client
    .from("platform_invoices")
    .select("id, number, status, currency, remaining, organization_id")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  if (invoice.status === "draft") throw new Error("لا يمكن تحصيل فاتورة قبل إصدارها.");
  if (invoice.status === "cancelled") throw new Error("الفاتورة ملغاة.");

  const amount = round2(input.amount);
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  if (amount > round2(Number(invoice.remaining)) + 0.001)
    throw new Error(`المبلغ يتجاوز المتبقي على الفاتورة (${Number(invoice.remaining)}).`);

  const { data: created, error } = await client
    .from("platform_payments")
    .insert({
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      amount,
      currency: invoice.currency,
      method: input.method,
      provider: "manual",
      status: "pending",
      bank_reference: input.bankReference ?? null,
      proof_path: input.proofPath ?? null,
      received_at: input.receivedAt ?? new Date().toISOString(),
      submitted_by: ctx.staff.user_id,
      submitted_by_email: ctx.staff.email,
      correlation_id: input.idempotencyKey,
      notes: input.notes ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) {
    // منع التكرار على مستوى القاعدة: نداءان متزامنان بنفس مفتاح التفرّد
    // يفوز أحدهما فقط، والثاني يعيد الدفعة نفسها بدل إنشاء صف مكرر.
    if (error?.code === "23505") {
      const { data: winner } = await client
        .from("platform_payments")
        .select("id")
        .eq("correlation_id", input.idempotencyKey)
        .maybeSingle();
      if (winner) return { paymentId: winner.id as string, duplicate: true };
    }
    fail(error, "تعذّر تسجيل الدفعة.");
  }

  await logAttempt({
    paymentId: created.id as string,
    invoiceId: invoice.id as string,
    provider: "manual",
    operation: "record_payment",
    status: "pending",
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    request: { amount, method: input.method },
  });

  await writeAudit(client, ctx.staff, {
    action: "billing.payment.record",
    entity_type: "payment",
    entity_id: created.id as string,
    description: `تسجيل دفعة ${amount} على الفاتورة ${invoice.number}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId, invoiceId: invoice.id },
    before: null,
    after: { amount, method: input.method, status: "pending" },
  });

  return { paymentId: created.id as string, duplicate: false };
}

export async function decidePayment(
  ctx: BillingCtx,
  input: { paymentId: string; decision: "approve" | "reject"; reason?: string | null },
): Promise<void> {
  const client = await db();
  const { data: payment } = await client
    .from("platform_payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (!payment) throw new Error("الدفعة غير موجودة.");
  if (payment.status !== "pending" && payment.status !== "processing")
    throw new Error("تم البت في هذه الدفعة مسبقاً.");

  const now = new Date().toISOString();
  const patch =
    input.decision === "approve"
      ? {
          status: "paid",
          paid_at: now,
          approved_by: ctx.staff.user_id,
          approved_by_email: ctx.staff.email,
          approved_at: now,
          updated_at: now,
        }
      : {
          status: "failed",
          rejection_reason: input.reason ?? "لم يُقبل إثبات التحويل",
          approved_by: ctx.staff.user_id,
          approved_by_email: ctx.staff.email,
          approved_at: now,
          updated_at: now,
        };

  const { error } = await client.from("platform_payments").update(patch).eq("id", input.paymentId);
  if (error) fail(error, "تعذّر تحديث حالة الدفعة.");
  await client.rpc("recalc_invoice", { _invoice_id: payment.invoice_id });

  await logAttempt({
    paymentId: input.paymentId,
    invoiceId: payment.invoice_id as string,
    provider: payment.provider as string,
    operation: input.decision === "approve" ? "approve_payment" : "reject_payment",
    status: input.decision === "approve" ? "success" : "failed",
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    errorMessage: input.decision === "reject" ? (input.reason ?? null) : null,
  });

  await notifyBillingEvent(
    payment.invoice_id as string,
    input.decision === "approve" ? "payment_approved" : "payment_rejected",
    { amount: Number(payment.amount), reason: input.reason ?? null },
  );

  await writeAudit(client, ctx.staff, {
    action: input.decision === "approve" ? "billing.payment.approve" : "billing.payment.reject",
    entity_type: "payment",
    entity_id: input.paymentId,
    description: `${input.decision === "approve" ? "اعتماد" : "رفض"} دفعة بمبلغ ${payment.amount}`,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      invoiceId: payment.invoice_id,
    },
    before: { status: payment.status },
    after: patch,
  });
}

/* ------------------------------------------------- الاستردادات وإشعارات الخصم */

export async function listRefunds(
  _ctx: BillingCtx,
  filters: { status?: string | null; page: number; pageSize: number },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  let query = client
    .from("platform_refunds")
    .select("*, platform_invoices(number, customer_name)", { count: "exact" });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب الاستردادات.");
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

export async function createRefund(
  ctx: BillingCtx,
  input: { paymentId: string; amount: number; reason: string },
): Promise<string> {
  const client = await db();
  const { data: payment } = await client
    .from("platform_payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (!payment) throw new Error("الدفعة غير موجودة.");
  if (!["paid", "partially_refunded"].includes(payment.status as string))
    throw new Error("لا يمكن استرداد دفعة غير معتمدة.");

  const amount = round2(input.amount);
  const refundable = round2(Number(payment.amount) - Number(payment.refunded_amount));
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  if (amount > refundable + 0.001)
    throw new Error(`المبلغ يتجاوز القابل للاسترداد (${refundable}).`);

  const { data: created, error } = await client
    .from("platform_refunds")
    .insert({
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      amount,
      currency: payment.currency,
      reason: input.reason,
      status: "pending",
      provider: payment.provider,
      requested_by: ctx.staff.user_id,
      requested_by_email: ctx.staff.email,
      correlation_id: ctx.correlationId,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) fail(error, "تعذّر إنشاء طلب الاسترداد.");

  await writeAudit(client, ctx.staff, {
    action: "billing.refund.request",
    entity_type: "refund",
    entity_id: created.id as string,
    description: `طلب استرداد ${amount} — ${input.reason}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId, paymentId: payment.id },
    before: null,
    after: { amount, status: "pending" },
  });
  return created.id as string;
}

export async function decideRefund(
  ctx: BillingCtx,
  input: { refundId: string; decision: "approve" | "reject"; reason?: string | null },
): Promise<void> {
  const client = await db();
  const { data: refund } = await client
    .from("platform_refunds")
    .select("*")
    .eq("id", input.refundId)
    .maybeSingle();
  if (!refund) throw new Error("طلب الاسترداد غير موجود.");
  if (refund.status !== "pending") throw new Error("تم البت في هذا الطلب مسبقاً.");
  const now = new Date().toISOString();

  if (input.decision === "reject") {
    await client
      .from("platform_refunds")
      .update({
        status: "cancelled",
        failure_message: input.reason ?? "رُفض الطلب",
        approved_by: ctx.staff.user_id,
        approved_by_email: ctx.staff.email,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", input.refundId);
    await writeAudit(client, ctx.staff, {
      action: "billing.refund.reject",
      entity_type: "refund",
      entity_id: input.refundId,
      description: `رفض استرداد بمبلغ ${refund.amount}`,
      metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
      before: { status: "pending" },
      after: { status: "cancelled" },
    });
    return;
  }

  const { data: payment } = await client
    .from("platform_payments")
    .select("*")
    .eq("id", refund.payment_id)
    .maybeSingle();
  if (!payment) throw new Error("الدفعة المرتبطة غير موجودة.");

  // تنفيذ الاسترداد لدى المزوّد عند وجود عملية خارجية.
  let providerRefundId: string | null = null;
  if (payment.provider !== "manual" && payment.provider_payment_id) {
    const provider = getProvider(payment.provider as string);
    const creds = await providerCredentials(payment.provider as string);
    const started = Date.now();
    const result = await provider.refundPayment(
      payment.provider_payment_id as string,
      Number(refund.amount),
      creds,
    );
    providerRefundId = result.providerRefundId;
    await logAttempt({
      paymentId: payment.id as string,
      invoiceId: payment.invoice_id as string,
      provider: payment.provider as string,
      operation: "refund",
      status: result.status === "failed" ? "failed" : "success",
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      durationMs: Date.now() - started,
      response: result.raw,
    });
    if (result.status === "failed") {
      await client
        .from("platform_refunds")
        .update({
          status: "failed",
          failure_message: "رفض المزوّد تنفيذ الاسترداد.",
          updated_at: now,
        })
        .eq("id", input.refundId);
      throw new Error("رفض المزوّد تنفيذ الاسترداد.");
    }
  }

  const refundedTotal = round2(Number(payment.refunded_amount) + Number(refund.amount));
  await client
    .from("platform_refunds")
    .update({
      status: "completed",
      provider_refund_id: providerRefundId,
      approved_by: ctx.staff.user_id,
      approved_by_email: ctx.staff.email,
      approved_at: now,
      processed_at: now,
      updated_at: now,
    })
    .eq("id", input.refundId);

  await client
    .from("platform_payments")
    .update({
      refunded_amount: refundedTotal,
      status: refundedTotal >= Number(payment.amount) ? "refunded" : "partially_refunded",
      updated_at: now,
    })
    .eq("id", payment.id);

  await client.rpc("recalc_invoice", { _invoice_id: refund.invoice_id });
  await notifyBillingEvent(refund.invoice_id as string, "refund_completed", {
    amount: Number(refund.amount),
  });

  await writeAudit(client, ctx.staff, {
    action: "billing.refund.approve",
    entity_type: "refund",
    entity_id: input.refundId,
    description: `اعتماد استرداد بمبلغ ${refund.amount}`,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      invoiceId: refund.invoice_id,
    },
    before: { status: "pending" },
    after: { status: "completed", refundedTotal },
  });
}

export async function listCreditNotes(
  _ctx: BillingCtx,
  filters: { page: number; pageSize: number },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await client
    .from("platform_credit_notes")
    .select("*, platform_invoices(number, customer_name)", { count: "exact" })
    .order("issued_at", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب إشعارات الخصم.");
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

export async function createCreditNote(
  ctx: BillingCtx,
  input: { invoiceId: string; amount: number; taxAmount: number; reason: string },
): Promise<{ id: string; number: string }> {
  const client = await db();
  const { data: invoice } = await client
    .from("platform_invoices")
    .select("id, number, total, currency, organization_id, status")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  if (invoice.status === "draft") throw new Error("لا يُصدر إشعار خصم على مسودة.");

  const { data: existing } = await client
    .from("platform_credit_notes")
    .select("amount, tax_amount")
    .eq("invoice_id", input.invoiceId)
    .eq("status", "issued");
  const already = (existing ?? []).reduce(
    (sum: number, row: { amount: number; tax_amount: number }) =>
      sum + Number(row.amount) + Number(row.tax_amount),
    0,
  );
  const amount = round2(input.amount);
  const taxAmount = round2(input.taxAmount);
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  if (round2(already + amount + taxAmount) > round2(Number(invoice.total)) + 0.001)
    throw new Error("مجموع إشعارات الخصم يتجاوز قيمة الفاتورة.");

  const { data: numberRow, error: numberError } = await client.rpc("next_financial_number", {
    _kind: "credit_note",
  });
  if (numberError) fail(numberError, "تعذّر توليد رقم إشعار الخصم.");

  const { data: created, error } = await client
    .from("platform_credit_notes")
    .insert({
      number: numberRow as string,
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      amount,
      tax_amount: taxAmount,
      currency: invoice.currency,
      reason: input.reason,
      status: "issued",
      created_by: ctx.staff.user_id,
      created_by_email: ctx.staff.email,
    })
    .select("id, number")
    .maybeSingle();
  if (error || !created) fail(error, "تعذّر إصدار إشعار الخصم.");

  await notifyBillingEvent(invoice.id as string, "credit_note_issued", {
    amount: round2(amount + taxAmount),
    reference: created.number as string,
  });

  await writeAudit(client, ctx.staff, {
    action: "billing.credit_note.issue",
    entity_type: "invoice",
    entity_id: invoice.id as string,
    description: `إصدار إشعار خصم ${created.number} بمبلغ ${round2(amount + taxAmount)}`,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      creditNoteId: created.id,
    },
    before: null,
    after: { number: created.number, amount, taxAmount },
  });
  return { id: created.id as string, number: created.number as string };
}

/* ------------------------------------------------------------- الملاحظات */

export async function addNote(
  ctx: BillingCtx,
  input: { resourceType: string; resourceId: string; body: string },
): Promise<void> {
  const client = await db();
  const { error } = await client.from("platform_billing_notes").insert({
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    body: input.body,
    is_internal: true,
    author_id: ctx.staff.user_id,
    author_email: ctx.staff.email,
  });
  if (error) fail(error, "تعذّر حفظ الملاحظة.");
}

/* -------------------------------------------------------- المطابقة البنكية */

export async function listReconciliations(
  _ctx: BillingCtx,
  filters: { status?: string | null; page: number; pageSize: number },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  let query = client.from("platform_bank_reconciliations").select("*", { count: "exact" });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query
    .order("value_date", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب الحركات البنكية.");
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

export async function addBankEntry(
  ctx: BillingCtx,
  input: {
    statementRef: string;
    bankName?: string | null;
    amount: number;
    valueDate: string;
    payerName?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  const client = await db();
  const { data: duplicate } = await client
    .from("platform_bank_reconciliations")
    .select("id")
    .eq("statement_ref", input.statementRef)
    .maybeSingle();
  if (duplicate) throw new Error("رقم الحركة مسجّل مسبقاً.");

  const { data: created, error } = await client
    .from("platform_bank_reconciliations")
    .insert({
      statement_ref: input.statementRef,
      bank_name: input.bankName ?? null,
      amount: round2(input.amount),
      value_date: input.valueDate,
      payer_name: input.payerName ?? null,
      notes: input.notes ?? null,
      created_by: ctx.staff.user_id,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) fail(error, "تعذّر تسجيل الحركة البنكية.");

  await writeAudit(client, ctx.staff, {
    action: "billing.reconciliation.add",
    entity_type: "bank_entry",
    entity_id: created.id as string,
    description: `تسجيل حركة بنكية ${input.statementRef}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: null,
    after: { amount: input.amount, valueDate: input.valueDate },
  });
  return created.id as string;
}

export async function matchBankEntry(
  ctx: BillingCtx,
  input: { entryId: string; paymentId: string },
): Promise<void> {
  const { error } = await ctx.sb.rpc("billing_match_reconciliation", {
    _entry_id: input.entryId,
    _payment_id: input.paymentId,
  });
  if (error) fail(error, "تعذّرت مطابقة الحركة.");
  await writeAudit(await db(), ctx.staff, {
    action: "billing.reconciliation.match",
    entity_type: "bank_entry",
    entity_id: input.entryId,
    description: "مطابقة حركة بنكية بدفعة",
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      paymentId: input.paymentId,
    },
    before: { status: "unmatched" },
    after: { status: "matched" },
  });
}

export async function ignoreBankEntry(
  ctx: BillingCtx,
  input: { entryId: string; reason: string },
): Promise<void> {
  const client = await db();
  const { error } = await client
    .from("platform_bank_reconciliations")
    .update({ status: "ignored", notes: input.reason, updated_at: new Date().toISOString() })
    .eq("id", input.entryId)
    .eq("status", "unmatched");
  if (error) fail(error, "تعذّر تحديث الحركة.");
  await writeAudit(client, ctx.staff, {
    action: "billing.reconciliation.ignore",
    entity_type: "bank_entry",
    entity_id: input.entryId,
    description: `تجاهل حركة بنكية: ${input.reason}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { status: "unmatched" },
    after: { status: "ignored" },
  });
}

/* --------------------------------------------------------- الفترات المالية */

export async function listPeriods(_ctx: BillingCtx): Promise<{
  periods: BillingRow[];
  requests: BillingRow[];
}> {
  const client = await db();
  const [periods, requests] = await Promise.all([
    client
      .from("platform_financial_periods")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(60),
    client
      .from("platform_period_reopen_approvals")
      .select("*, platform_financial_periods(period_start, period_end, status)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    periods: (periods.data ?? []) as BillingRow[],
    requests: (requests.data ?? []) as BillingRow[],
  };
}

export async function closePeriod(
  ctx: BillingCtx,
  input: { periodStart: string; periodEnd: string; notes?: string | null },
): Promise<string> {
  const client = await db();
  if (new Date(input.periodEnd) < new Date(input.periodStart))
    throw new Error("تاريخ نهاية الفترة يجب أن يكون بعد بدايتها.");

  const { data: overlap } = await client
    .from("platform_financial_periods")
    .select("id")
    .eq("status", "closed")
    .lte("period_start", input.periodEnd)
    .gte("period_end", input.periodStart)
    .maybeSingle();
  if (overlap) throw new Error("توجد فترة مقفلة متداخلة مع هذا النطاق.");

  const now = new Date().toISOString();
  const { data: created, error } = await client
    .from("platform_financial_periods")
    .insert({
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "closed",
      closed_at: now,
      closed_by: ctx.staff.user_id,
      closed_by_email: ctx.staff.email,
      notes: input.notes ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) fail(error, "تعذّر إقفال الفترة.");

  await writeAudit(client, ctx.staff, {
    action: "billing.period.close",
    entity_type: "financial_period",
    entity_id: created.id as string,
    description: `إقفال الفترة ${input.periodStart} — ${input.periodEnd}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: null,
    after: { status: "closed" },
  });
  return created.id as string;
}

export async function requestReopen(
  ctx: BillingCtx,
  input: { periodId: string; reason: string },
): Promise<string> {
  const client = await db();
  const { data: period } = await client
    .from("platform_financial_periods")
    .select("id, status")
    .eq("id", input.periodId)
    .maybeSingle();
  if (!period) throw new Error("الفترة غير موجودة.");
  if (period.status !== "closed") throw new Error("الفترة مفتوحة أصلاً.");

  const { data: created, error } = await client
    .from("platform_period_reopen_approvals")
    .insert({
      period_id: input.periodId,
      reason: input.reason,
      requested_by: ctx.staff.user_id,
      requested_by_email: ctx.staff.email,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error || !created) fail(error, "تعذّر إنشاء طلب إعادة الفتح.");

  await writeAudit(client, ctx.staff, {
    action: "billing.period.reopen_request",
    entity_type: "financial_period",
    entity_id: input.periodId,
    description: `طلب إعادة فتح الفترة: ${input.reason}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { status: "closed" },
    after: { request: "pending" },
  });
  return created.id as string;
}

export async function approveReopen(ctx: BillingCtx, input: { approvalId: string }): Promise<void> {
  const { error } = await ctx.sb.rpc("billing_reopen_period", { _approval_id: input.approvalId });
  if (error) fail(error, "تعذّر اعتماد إعادة الفتح.");
  await writeAudit(await db(), ctx.staff, {
    action: "billing.period.reopen_approve",
    entity_type: "financial_period",
    entity_id: input.approvalId,
    description: "اعتماد إعادة فتح فترة مالية",
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { status: "closed" },
    after: { status: "open" },
  });
}

/* ----------------------------------------------------------- مزودو الدفع */

const PROVIDER_SECRET_PREFIX = "paysec_";

async function providerConfig(code: string): Promise<BillingRow> {
  const client = await db();
  const { data } = await client
    .from("platform_payment_provider_configs")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!data) throw new Error("مزوّد الدفع غير معروف.");
  return data as BillingRow;
}

function secretReferenceOf(config: BillingRow): string {
  const settings = (config["settings"] ?? {}) as BillingRow;
  const existing = settings["secret_reference"];
  return typeof existing === "string" && existing
    ? existing
    : `${PROVIDER_SECRET_PREFIX}${config["code"]}`;
}

async function providerCredentials(code: string): Promise<Record<string, string>> {
  const config = await providerConfig(code);
  const { IntegrationSecretVault } = await import("@/lib/integrations/vault.server");
  return IntegrationSecretVault.getSecretsServerSide(secretReferenceOf(config));
}

export async function listProviders(_ctx: BillingCtx): Promise<
  {
    code: string;
    name_ar: string;
    description: string | null;
    is_enabled: boolean;
    connection_status: string;
    last_tested_at: string | null;
    last_test_error: string | null;
    webhook_path: string | null;
    requires_credentials: boolean;
    required_keys: string[];
    secrets: { fieldKey: string; hint: string; status: string; rotatedAt: string | null }[];
  }[]
> {
  const client = await db();
  const { IntegrationSecretVault } = await import("@/lib/integrations/vault.server");
  const { data } = await client
    .from("platform_payment_provider_configs")
    .select("*")
    .order("sort_order");
  const rows = (data ?? []) as BillingRow[];
  return Promise.all(
    rows.map(async (row) => {
      const provider = getProvider(row["code"] as string);
      return {
        code: row["code"] as string,
        name_ar: row["name_ar"] as string,
        description: (row["description"] as string | null) ?? null,
        is_enabled: Boolean(row["is_enabled"]),
        connection_status: row["connection_status"] as string,
        last_tested_at: (row["last_tested_at"] as string | null) ?? null,
        last_test_error: (row["last_test_error"] as string | null) ?? null,
        webhook_path: (row["webhook_path"] as string | null) ?? null,
        requires_credentials: provider.requiresCredentials,
        required_keys: provider.requiredCredentialKeys,
        secrets: await IntegrationSecretVault.listHints(secretReferenceOf(row)),
      };
    }),
  );
}

export async function saveProviderSecrets(
  ctx: BillingCtx,
  input: { code: string; secrets: Record<string, string> },
): Promise<void> {
  const client = await db();
  const config = await providerConfig(input.code);
  const provider = getProvider(input.code);
  if (!provider.requiresCredentials) throw new Error("هذا المزوّد لا يحتاج مفاتيح.");
  const reference = secretReferenceOf(config);
  const { IntegrationSecretVault } = await import("@/lib/integrations/vault.server");

  for (const [key, value] of Object.entries(input.secrets)) {
    if (!value.trim()) continue;
    if (!provider.requiredCredentialKeys.includes(key))
      throw new Error("حقل مفتاح غير معروف لهذا المزوّد.");
    await IntegrationSecretVault.updateSecret(reference, key, value.trim(), ctx.staff.user_id);
  }

  const settings = { ...((config["settings"] ?? {}) as BillingRow), secret_reference: reference };
  await client
    .from("platform_payment_provider_configs")
    .update({
      settings,
      connection_status: "configured",
      is_enabled: false,
      last_test_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", input.code);

  await writeAudit(client, ctx.staff, {
    action: "billing.provider.save_secrets",
    entity_type: "payment_provider",
    entity_id: config["id"] as string,
    description: `تحديث مفاتيح مزوّد الدفع ${input.code}`,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      fields: Object.keys(input.secrets).filter((k) => input.secrets[k]?.trim()),
    },
    before: { connection_status: config["connection_status"] },
    after: { connection_status: "configured", is_enabled: false },
  });
}

export async function testProvider(
  ctx: BillingCtx,
  input: { code: string },
): Promise<{ ok: boolean; message: string }> {
  const client = await db();
  const config = await providerConfig(input.code);
  const provider = getProvider(input.code);
  const creds = await providerCredentials(input.code);

  const missing = provider.requiredCredentialKeys.filter((key) => !creds[key]);
  if (missing.length) {
    // غياب المفاتيح ليس فشل اتصال؛ المزوّد ببساطة غير مهيّأ بعد.
    const message = "بعض المفاتيح المطلوبة غير محفوظة بعد.";
    await client
      .from("platform_payment_provider_configs")
      .update({
        connection_status: "not_configured",
        last_test_error: message,
        last_tested_at: new Date().toISOString(),
      })
      .eq("code", input.code);
    return { ok: false, message };
  }

  const started = Date.now();
  const result = await provider.testConnection(creds);
  await client
    .from("platform_payment_provider_configs")
    .update({
      connection_status: result.ok ? "verified" : "failed",
      last_test_error: result.ok ? null : result.message,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("code", input.code);

  await logAttempt({
    provider: input.code,
    operation: "test_connection",
    status: result.ok ? "success" : "failed",
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    errorMessage: result.ok ? null : result.message,
    durationMs: Date.now() - started,
  });

  await writeAudit(client, ctx.staff, {
    action: "billing.provider.test",
    entity_type: "payment_provider",
    entity_id: config["id"] as string,
    description: `اختبار اتصال مزوّد الدفع ${input.code}: ${result.ok ? "ناجح" : "فاشل"}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { connection_status: config["connection_status"] },
    after: { connection_status: result.ok ? "verified" : "failed" },
  });
  return result;
}

export async function setProviderEnabled(
  ctx: BillingCtx,
  input: { code: string; enabled: boolean },
): Promise<void> {
  const client = await db();
  const config = await providerConfig(input.code);
  if (input.enabled && config["connection_status"] !== "verified")
    throw new Error("لا يمكن تفعيل المزوّد قبل نجاح اختبار الاتصال.");

  await client
    .from("platform_payment_provider_configs")
    .update({ is_enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq("code", input.code);

  await writeAudit(client, ctx.staff, {
    action: input.enabled ? "billing.provider.enable" : "billing.provider.disable",
    entity_type: "payment_provider",
    entity_id: config["id"] as string,
    description: `${input.enabled ? "تفعيل" : "تعطيل"} مزوّد الدفع ${input.code}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { is_enabled: config["is_enabled"] },
    after: { is_enabled: input.enabled },
  });
}

/* ------------------------------------------------- الترقيم وإعدادات الضريبة */

export async function listSequences(_ctx: BillingCtx): Promise<BillingRow[]> {
  const client = await db();
  const { data } = await client
    .from("platform_number_sequences")
    .select("*")
    .order("kind")
    .order("period_key", { ascending: false });
  return (data ?? []) as BillingRow[];
}

export async function updateSequence(
  ctx: BillingCtx,
  input: { kind: string; periodKey: string; prefix: string; padding: number },
): Promise<void> {
  const client = await db();
  const { data: current } = await client
    .from("platform_number_sequences")
    .select("*")
    .eq("kind", input.kind)
    .eq("period_key", input.periodKey)
    .maybeSingle();
  if (!current) throw new Error("التسلسل غير موجود.");

  const { error } = await client
    .from("platform_number_sequences")
    .update({ prefix: input.prefix, padding: input.padding, updated_at: new Date().toISOString() })
    .eq("kind", input.kind)
    .eq("period_key", input.periodKey);
  if (error) fail(error, "تعذّر تحديث إعدادات الترقيم.");

  await writeAudit(client, ctx.staff, {
    action: "billing.sequence.update",
    entity_type: "number_sequence",
    entity_id: null,
    description: `تحديث ترقيم ${input.kind} للفترة ${input.periodKey}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: { prefix: current["prefix"], padding: current["padding"] },
    after: { prefix: input.prefix, padding: input.padding },
  });
}

export type TaxSettings = {
  defaultRate: number;
  taxNumber: string;
  sellerName: string;
  sellerAddress: string;
  paymentTermsDays: number;
  bankDetails: string;
};

const TAX_SETTINGS_KEY = "billing_tax";

const DEFAULT_TAX_SETTINGS: TaxSettings = {
  defaultRate: 15,
  taxNumber: "",
  sellerName: "مِهلة | MEHLA",
  sellerAddress: "",
  paymentTermsDays: 14,
  bankDetails: "",
};

export async function getTaxSettings(): Promise<TaxSettings> {
  const client = await db();
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", TAX_SETTINGS_KEY)
    .maybeSingle();
  const value = (data?.value ?? {}) as Partial<TaxSettings>;
  return { ...DEFAULT_TAX_SETTINGS, ...value };
}

export async function saveTaxSettings(ctx: BillingCtx, input: TaxSettings): Promise<void> {
  const client = await db();
  const before = await getTaxSettings();
  const { error } = await client.from("platform_settings").upsert(
    {
      key: TAX_SETTINGS_KEY,
      value: input as never,
      is_public: false,
      updated_by: ctx.staff.user_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) fail(error, "تعذّر حفظ إعدادات الضريبة.");
  await writeAudit(client, ctx.staff, {
    action: "billing.tax_settings.update",
    entity_type: "billing_settings",
    entity_id: null,
    description: "تحديث إعدادات الضريبة والفوترة",
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before,
    after: input,
  });
}

/* ------------------------------------------------------------------ التقارير */

export async function reports(
  ctx: BillingCtx,
  input: { from: string; to: string },
): Promise<BillingReports> {
  const { data, error } = await ctx.sb.rpc("billing_reports", { _from: input.from, _to: input.to });
  if (error) fail(error, "تعذّر توليد التقارير المالية.");
  return data as BillingReports;
}

export async function listAttempts(
  _ctx: BillingCtx,
  filters: { status?: string | null; page: number; pageSize: number },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  let query = client.from("platform_payment_attempts").select("*", { count: "exact" });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const start = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(start, start + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب محاولات الدفع.");
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

/* ------------------------------------------------------- إشعارات البريد المالية */

export type BillingEmailEvent =
  | "invoice_issued"
  | "due_soon"
  | "overdue"
  | "payment_approved"
  | "payment_rejected"
  | "payment_failed"
  | "refund_completed"
  | "credit_note_issued";

/**
 * إرسال إشعار مالي للعميل. لا يرمي أبداً: فشل البريد لا يُبطل العملية المالية،
 * ويُسجّل في سجل الأعطال وسجل البريد.
 */
export async function notifyBillingEvent(
  invoiceId: string,
  event: BillingEmailEvent,
  extra?: { amount?: number; reason?: string | null; reference?: string | null },
): Promise<boolean> {
  try {
    const client = await db();
    const { data: invoice } = await client
      .from("platform_invoices")
      .select(
        "id, number, customer_name, customer_email, total, remaining, currency, due_at, organization_id, status",
      )
      .eq("id", invoiceId)
      .maybeSingle();
    if (!invoice?.customer_email) return false;

    const [{ sendAppEmail }, { BillingEventEmail, billingSubject }] = await Promise.all([
      import("@/lib/email/app-email.server"),
      import("@/lib/email-templates/billing-event"),
    ]);

    const result = await sendAppEmail({
      to: invoice.customer_email as string,
      subject: billingSubject(event, invoice.number as string),
      element: BillingEventEmail({
        event,
        invoiceNumber: invoice.number as string,
        customerName: invoice.customer_name as string,
        total: Number(invoice.total),
        remaining: Number(invoice.remaining),
        currency: invoice.currency as string,
        dueAt: (invoice.due_at as string | null) ?? null,
        amount: extra?.amount ?? null,
        reason: extra?.reason ?? null,
        reference: extra?.reference ?? null,
      }),
      label: `billing_${event}`,
      idempotencyKey: `billing-${event}-${invoiceId}-${extra?.reference ?? extra?.amount ?? "x"}`,
      organizationId: (invoice.organization_id as string | null) ?? null,
    });
    return result.sent;
  } catch {
    return false;
  }
}

/** تذكيرات الاستحقاق والتأخر — تُستدعى من مسار مجدول. */
export async function runDueReminders(): Promise<{ dueSoon: number; overdue: number }> {
  const client = await db();
  const now = Date.now();
  const soon = new Date(now + 3 * 86400_000).toISOString();

  const { data: dueSoon } = await client
    .from("platform_invoices")
    .select("id")
    .in("status", ["pending", "issued", "partially_paid"])
    .gt("due_at", new Date(now).toISOString())
    .lte("due_at", soon);

  const { data: overdue } = await client
    .from("platform_invoices")
    .select("id")
    .in("status", ["pending", "issued", "partially_paid", "overdue"])
    .lt("due_at", new Date(now).toISOString());

  for (const row of dueSoon ?? []) await notifyBillingEvent(row.id as string, "due_soon");
  for (const row of overdue ?? []) await notifyBillingEvent(row.id as string, "overdue");
  return { dueSoon: (dueSoon ?? []).length, overdue: (overdue ?? []).length };
}

/* --------------------------------------- إنشاء عملية دفع عبر مزوّد خارجي */

/**
 * بدء عملية دفع عند مزوّد خارجي لفاتورة مُصدرة. لا يوجد أي منطق خاص بمزوّد هنا:
 * كل التفاصيل داخل الموصل (Adapter). العملة الوحيدة المدعومة حالياً هي الريال
 * السعودي، والمزوّد يجب أن يكون مفعّلاً بعد اختبار اتصال ناجح.
 */
export async function createProviderPayment(
  ctx: BillingCtx,
  input: { invoiceId: string; code: string; idempotencyKey: string },
): Promise<{
  paymentId: string;
  duplicate: boolean;
  status: string;
  redirectUrl: string | null;
  providerPaymentId: string | null;
}> {
  const client = await db();
  const provider = getProvider(input.code);
  if (!provider.requiresCredentials)
    throw new Error("هذا المزوّد للتحصيل اليدوي ولا يبدأ عمليات دفع خارجية.");

  const config = await providerConfig(input.code);
  if (!config["is_enabled"]) throw new Error("مزوّد الدفع غير مفعّل.");
  if (config["connection_status"] !== "verified")
    throw new Error("لا يمكن بدء الدفع قبل نجاح اختبار اتصال المزوّد.");

  const creds = await providerCredentials(input.code);
  const missing = provider.requiredCredentialKeys.filter((key) => !creds[key]);
  if (missing.length) throw new Error("بعض مفاتيح المزوّد المطلوبة غير محفوظة بعد.");

  // منع التكرار: نفس مفتاح التفرّد يعيد نفس الدفعة بدل إنشاء عملية ثانية.
  const { data: existing } = await client
    .from("platform_payments")
    .select("id, status, provider_payment_id, metadata")
    .eq("correlation_id", input.idempotencyKey)
    .maybeSingle();
  if (existing)
    return {
      paymentId: existing.id as string,
      duplicate: true,
      status: existing.status as string,
      redirectUrl:
        ((existing.metadata as BillingRow | null)?.["redirect_url"] as string | null) ?? null,
      providerPaymentId: (existing.provider_payment_id as string | null) ?? null,
    };

  const { data: invoice } = await client
    .from("platform_invoices")
    .select("id, number, status, currency, remaining, organization_id")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  if (invoice.status === "draft") throw new Error("لا يمكن تحصيل فاتورة قبل إصدارها.");
  if (invoice.status === "cancelled") throw new Error("الفاتورة ملغاة.");
  if (String(invoice.currency).toUpperCase() !== "SAR")
    throw new Error("الدفع الإلكتروني مدعوم بالريال السعودي فقط حالياً.");
  const amount = round2(Number(invoice.remaining));
  if (amount <= 0) throw new Error("لا يوجد مبلغ متبقٍ على الفاتورة.");

  const { data: created, error } = await client
    .from("platform_payments")
    .insert({
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      amount,
      currency: invoice.currency,
      method: "provider",
      provider: input.code,
      status: "pending",
      submitted_by: ctx.staff.user_id,
      submitted_by_email: ctx.staff.email,
      correlation_id: input.idempotencyKey,
    })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") {
    const { data: winner } = await client
      .from("platform_payments")
      .select("id, status, provider_payment_id, metadata")
      .eq("correlation_id", input.idempotencyKey)
      .maybeSingle();
    if (winner)
      return {
        paymentId: winner.id as string,
        duplicate: true,
        status: winner.status as string,
        redirectUrl:
          ((winner.metadata as BillingRow | null)?.["redirect_url"] as string | null) ?? null,
        providerPaymentId: (winner.provider_payment_id as string | null) ?? null,
      };
  }
  if (error || !created) fail(error, "تعذّر تهيئة عملية الدفع.");
  const paymentId = created.id as string;

  const started = Date.now();
  let state: Awaited<ReturnType<typeof provider.createPayment>>;
  try {
    state = await provider.createPayment(
      {
        invoiceId: invoice.id as string,
        invoiceNumber: invoice.number as string,
        amount,
        currency: String(invoice.currency).toUpperCase(),
        description: `سداد الفاتورة ${invoice.number}`,
        correlationId: input.idempotencyKey,
        ...((config["webhook_path"] as string | null)
          ? { callbackUrl: String(config["webhook_path"]) }
          : {}),
      },
      creds,
    );
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : "تعذّر الاتصال بالمزوّد.";
    await client
      .from("platform_payments")
      .update({
        status: "failed",
        failure_code: "PROVIDER_UNREACHABLE",
        failure_message: message.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
    await logAttempt({
      paymentId,
      invoiceId: invoice.id as string,
      provider: input.code,
      operation: "create_payment",
      status: "failed",
      errorCode: "PROVIDER_UNREACHABLE",
      errorMessage: message.slice(0, 300),
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      durationMs: Date.now() - started,
    });
    throw new Error("تعذّر بدء عملية الدفع عند المزوّد.");
  }

  await client
    .from("platform_payments")
    .update({
      status: state.status,
      provider_payment_id: state.providerPaymentId,
      provider_reference: state.reference,
      failure_code: state.failureCode ?? null,
      failure_message: state.failureMessage ?? null,
      metadata: { redirect_url: state.redirectUrl ?? null, mode: config["settings"] ?? {} },
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  await logAttempt({
    paymentId,
    invoiceId: invoice.id as string,
    provider: input.code,
    operation: "create_payment",
    status: state.status === "failed" ? "failed" : "success",
    providerStatus: state.status,
    errorCode: state.failureCode ?? null,
    errorMessage: state.failureMessage ?? null,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    durationMs: Date.now() - started,
  });

  await writeAudit(client, ctx.staff, {
    action: "billing.payment.create_provider",
    entity_type: "invoice",
    entity_id: invoice.id as string,
    description: `بدء عملية دفع إلكتروني للفاتورة ${invoice.number} عبر ${input.code}`,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      paymentId,
      amount,
      provider: input.code,
    },
    before: null,
    after: { status: state.status, providerPaymentId: state.providerPaymentId },
  });

  return {
    paymentId,
    duplicate: false,
    status: state.status,
    redirectUrl: state.redirectUrl ?? null,
    providerPaymentId: state.providerPaymentId,
  };
}

/* ----------------------------------------------- معالجة أحداث المزوّد (Webhook) */

/**
 * تطبيق حالة دفع واردة من مزوّد. تُستدعى من مسار الويبهوك بعد التحقق من التوقيع
 * ومنع التكرار. لا تضاعف السداد: الدفعة تُحدَّث بالمعرّف الخارجي فقط.
 */
export async function applyProviderPaymentState(input: {
  provider: string;
  providerPaymentId: string;
  status:
    | "pending"
    | "processing"
    | "paid"
    | "failed"
    | "cancelled"
    | "refunded"
    | "partially_refunded";
  amount: number | null;
  currency?: string | null;
  correlationId: string;
}): Promise<{ applied: boolean; paymentId: string | null; invoiceId: string | null }> {
  const client = await db();
  const { data: payment } = await client
    .from("platform_payments")
    .select("*")
    .eq("provider", input.provider)
    .eq("provider_payment_id", input.providerPaymentId)
    .maybeSingle();
  if (!payment) return { applied: false, paymentId: null, invoiceId: null };

  // التحقق من المبلغ والعملة قبل أي تغيير حالة: عدم التطابق عطل يستحق الفشل
  // والدخول في سجل المحاولات، لا سداداً صامتاً بقيمة خاطئة.
  if (input.amount !== null && input.amount !== undefined) {
    const expected = round2(Number(payment.amount));
    if (Math.abs(round2(input.amount) - expected) > 0.01)
      throw new Error(
        `AMOUNT_MISMATCH: مبلغ المزوّد ${round2(input.amount)} لا يطابق مبلغ الدفعة ${expected}.`,
      );
  }
  if (input.currency && String(input.currency).toUpperCase() !== String(payment.currency).toUpperCase())
    throw new Error(
      `CURRENCY_MISMATCH: عملة المزوّد ${input.currency} لا تطابق عملة الدفعة ${payment.currency}.`,
    );

  if (payment.status === input.status) {
    return {
      applied: false,
      paymentId: payment.id as string,
      invoiceId: payment.invoice_id as string,
    };
  }
  // الحالات النهائية لا تُخفَّض بحدث لاحق مكرر أو متأخر.
  const terminal = ["refunded", "partially_refunded"];
  if (terminal.includes(payment.status as string) && input.status === "paid") {
    return {
      applied: false,
      paymentId: payment.id as string,
      invoiceId: payment.invoice_id as string,
    };
  }

  const now = new Date().toISOString();
  await client
    .from("platform_payments")
    .update({
      status: input.status,
      paid_at: input.status === "paid" ? (payment.paid_at ?? now) : payment.paid_at,
      updated_at: now,
    })
    .eq("id", payment.id);
  await client.rpc("recalc_invoice", { _invoice_id: payment.invoice_id });

  if (input.status === "paid")
    await notifyBillingEvent(payment.invoice_id as string, "payment_approved", {
      amount: Number(payment.amount),
    });
  if (input.status === "failed")
    await notifyBillingEvent(payment.invoice_id as string, "payment_failed", {
      amount: Number(payment.amount),
    });

  return {
    applied: true,
    paymentId: payment.id as string,
    invoiceId: payment.invoice_id as string,
  };
}
/* ------------------------------------------- إعدادات المزوّد المتقدمة والإحصاءات */

/** أوضاع تشغيل المزوّد المدعومة (تُحفظ داخل settings.mode). */
export type ProviderMode = "sandbox" | "production";

export async function updateProviderConfig(
  ctx: BillingCtx,
  input: { code: string; sortOrder?: number | null; mode?: ProviderMode | null },
): Promise<void> {
  const client = await db();
  const config = await providerConfig(input.code);
  const provider = getProvider(input.code);
  const settings = { ...((config["settings"] ?? {}) as BillingRow) };

  if (input.mode) {
    if (!provider.requiresCredentials) throw new Error("هذا المزوّد لا يدعم أوضاع التشغيل.");
    settings["mode"] = input.mode;
  }

  const patch: BillingRow = { settings: settings as never, updated_at: new Date().toISOString() };
  if (typeof input.sortOrder === "number")
    patch["sort_order"] = Math.max(0, Math.min(input.sortOrder, 99));

  const { error } = await client
    .from("platform_payment_provider_configs")
    .update(patch)
    .eq("code", input.code);
  if (error) fail(error, "تعذّر تحديث إعدادات المزوّد.");

  await writeAudit(client, ctx.staff, {
    action: "billing.provider.update_config",
    entity_type: "payment_provider",
    entity_id: config["id"] as string,
    description: `تحديث إعدادات مزوّد الدفع ${input.code}`,
    metadata: { correlationId: ctx.correlationId, requestId: ctx.requestId },
    before: {
      sort_order: config["sort_order"],
      mode: ((config["settings"] ?? {}) as BillingRow)["mode"] ?? null,
    },
    after: {
      sort_order: patch["sort_order"] ?? config["sort_order"],
      mode: settings["mode"] ?? null,
    },
  });
}

export type ProviderStat = {
  code: string;
  mode: ProviderMode | null;
  sort_order: number;
  supports_webhooks: boolean;
  supports_refunds: boolean;
  webhook_failed: number;
  webhook_dead_letter: number;
  last_success_at: string | null;
  last_failure_at: string | null;
};

/** مؤشرات تشغيلية لكل مزوّد: أعطال الرسائل الواردة وآخر نجاح/فشل فعلي. */
export async function listProviderStats(_ctx: BillingCtx): Promise<ProviderStat[]> {
  const client = await db();
  const { data } = await client
    .from("platform_payment_provider_configs")
    .select("code, settings, sort_order, supports_webhooks, supports_refunds")
    .order("sort_order");

  const rows = (data ?? []) as BillingRow[];
  return Promise.all(
    rows.map(async (row) => {
      const code = row["code"] as string;
      const [failed, dead, success, failure] = await Promise.all([
        client
          .from("platform_payment_webhooks")
          .select("id", { count: "exact", head: true })
          .eq("provider", code)
          .eq("status", "failed"),
        client
          .from("platform_payment_webhooks")
          .select("id", { count: "exact", head: true })
          .eq("provider", code)
          .eq("status", "dead_letter"),
        client
          .from("platform_payment_attempts")
          .select("created_at")
          .eq("provider", code)
          .eq("status", "success")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("platform_payment_attempts")
          .select("created_at")
          .eq("provider", code)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const settings = (row["settings"] ?? {}) as BillingRow;
      const mode = settings["mode"];
      return {
        code,
        mode: mode === "sandbox" || mode === "production" ? mode : null,
        sort_order: Number(row["sort_order"] ?? 0),
        supports_webhooks: Boolean(row["supports_webhooks"]),
        supports_refunds: Boolean(row["supports_refunds"]),
        webhook_failed: failed.count ?? 0,
        webhook_dead_letter: dead.count ?? 0,
        last_success_at: (success.data?.created_at as string | null) ?? null,
        last_failure_at: (failure.data?.created_at as string | null) ?? null,
      };
    }),
  );
}

/* ------------------------------------------------------- معاينة الرقم القادم */

/**
 * معاينة الرقم النظامي القادم دون استهلاكه.
 * الاستهلاك الفعلي يتم فقط داخل next_financial_number في قاعدة البيانات
 * (مع قفل استشاري يمنع التكرار عند الطلبات المتزامنة).
 */
export async function previewSequence(
  _ctx: BillingCtx,
  input: { kind: string; periodKey: string },
): Promise<{
  kind: string;
  periodKey: string;
  prefix: string;
  padding: number;
  nextValue: number;
  preview: string;
}> {
  const client = await db();
  const { data } = await client
    .from("platform_number_sequences")
    .select("*")
    .eq("kind", input.kind)
    .eq("period_key", input.periodKey)
    .maybeSingle();

  const defaults: Record<string, string> = {
    invoice: "MEH-INV",
    quote: "MEH-QT",
    credit_note: "MEH-CN",
  };
  const prefix = (data?.prefix as string | undefined) ?? defaults[input.kind] ?? "MEH";
  const padding = Number(data?.padding ?? 5);
  const nextValue = Number(data?.next_value ?? 1);
  return {
    kind: input.kind,
    periodKey: input.periodKey,
    prefix,
    padding,
    nextValue,
    preview: `${prefix}-${input.periodKey}-${String(nextValue).padStart(padding, "0")}`,
  };
}

/* -------------------------------------------------- مصادر مستندات PDF الموحدة */

/** بيانات إيصال السداد: الدفعة + الفاتورة المرتبطة + استرداداتها. */
export async function getPaymentReceipt(
  _ctx: BillingCtx,
  paymentId: string,
): Promise<import("./pdf/models.server").ReceiptSource> {
  const client = await db();
  const { data: payment, error } = await client
    .from("platform_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) fail(error, "تعذّر جلب الدفعة.");
  if (!payment) throw new Error("الدفعة غير موجودة.");
  if (payment.status === "pending" || payment.status === "failed")
    throw new Error("لا يمكن إصدار إيصال لدفعة غير معتمدة.");

  const [invoiceRes, refundsRes] = await Promise.all([
    client
      .from("platform_invoices")
      .select(
        "number, currency, customer_name, customer_legal_name, customer_email, tax_number, total, paid_total, remaining, organizations(name)",
      )
      .eq("id", payment.invoice_id)
      .maybeSingle(),
    client.from("platform_refunds").select("*").eq("payment_id", paymentId).order("created_at"),
  ]);
  if (!invoiceRes.data) throw new Error("الفاتورة المرتبطة بالدفعة غير موجودة.");

  const invoiceRow = invoiceRes.data as BillingRow & { organizations?: { name?: string } };
  return {
    payment: payment as never,
    refunds: (refundsRes.data ?? []) as never,
    invoice: {
      number: invoiceRow["number"] as string,
      currency: invoiceRow["currency"] as string,
      customer_name: invoiceRow["customer_name"] as string,
      customer_legal_name: (invoiceRow["customer_legal_name"] as string | null) ?? null,
      customer_email: (invoiceRow["customer_email"] as string | null) ?? null,
      tax_number: (invoiceRow["tax_number"] as string | null) ?? null,
      organization_name: invoiceRow.organizations?.name ?? null,
      total: Number(invoiceRow["total"]),
      paid_total: Number(invoiceRow["paid_total"]),
      remaining: Number(invoiceRow["remaining"]),
    },
  };
}

/** كشف حساب مكتب خلال فترة: الفواتير الصادرة + الدفعات + الرصيد المستحق. */
export async function getAccountStatement(
  _ctx: BillingCtx,
  input: { organizationId: string; from: string; to: string },
): Promise<import("./pdf/models.server").StatementSource> {
  const client = await db();
  const { data: org } = await client
    .from("organizations")
    .select("name, email, tax_number, commercial_registration")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (!org) throw new Error("المكتب غير موجود.");

  const { data: orgInvoiceIds } = await client
    .from("platform_invoices")
    .select("id")
    .eq("organization_id", input.organizationId);
  const invoiceIds = (orgInvoiceIds ?? []).map((row: BillingRow) => row["id"] as string);

  const [invoicesRes, openingRes, paymentsRes, refundsRes] = await Promise.all([
    client
      .from("platform_invoices")
      .select("id, number, currency, issued_at, due_at, status, total, paid_total, remaining")
      .eq("organization_id", input.organizationId)
      .neq("status", "draft")
      .gte("issued_at", input.from)
      .lte("issued_at", input.to)
      .order("issued_at"),
    client
      .from("platform_invoices")
      .select("remaining")
      .eq("organization_id", input.organizationId)
      .neq("status", "draft")
      .lt("issued_at", input.from),
    client
      .from("platform_payments")
      .select("amount, method, status, paid_at, received_at, created_at, platform_invoices(number)")
      .eq("organization_id", input.organizationId)
      .in("status", ["paid", "refunded", "partially_refunded"])
      .gte("created_at", input.from)
      .lte("created_at", input.to)
      .order("created_at"),
    client
      .from("platform_refunds")
      .select("amount")
      .eq("status", "completed")
      .in(
        "invoice_id",
        invoiceIds.length > 0 ? invoiceIds : ["00000000-0000-0000-0000-000000000000"],
      )
      .gte("created_at", input.from)
      .lte("created_at", input.to),
  ]);

  const invoices = (invoicesRes.data ?? []) as BillingRow[];
  const payments = (paymentsRes.data ?? []) as Array<
    BillingRow & { platform_invoices?: { number?: string } }
  >;

  const sum = (rows: BillingRow[], key: string) =>
    round2(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0));

  return {
    accountName: org.name as string,
    email: (org.email as string | null) ?? null,
    taxNumber: (org.tax_number as string | null) ?? null,
    commercialRegistration: (org.commercial_registration as string | null) ?? null,
    currency: (invoices[0]?.["currency"] as string | undefined) ?? "SAR",
    from: input.from,
    to: input.to,
    openingOutstanding: sum((openingRes.data ?? []) as BillingRow[], "remaining"),
    invoices: invoices.map((invoice) => ({
      number: invoice["number"] as string,
      issued_at: (invoice["issued_at"] as string | null) ?? null,
      due_at: (invoice["due_at"] as string | null) ?? null,
      status: invoice["status"] as string,
      total: Number(invoice["total"]),
      paid_total: Number(invoice["paid_total"]),
      remaining: Number(invoice["remaining"]),
    })),
    payments: payments.map((payment) => ({
      date: (payment["paid_at"] ?? payment["received_at"] ?? payment["created_at"]) as string,
      invoice_number: payment.platform_invoices?.number ?? "—",
      method: payment["method"] as string,
      status: payment["status"] as string,
      amount: Number(payment["amount"]),
    })),
    totals: {
      invoiced: sum(invoices, "total"),
      collected: sum(payments as BillingRow[], "amount"),
      refunded: sum((refundsRes.data ?? []) as BillingRow[], "amount"),
      outstanding: sum(invoices, "remaining"),
    },
  };
}
