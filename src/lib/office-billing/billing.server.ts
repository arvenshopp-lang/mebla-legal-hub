/**
 * منطق فوترة المكتب — خادم فقط.
 * كل استعلام ينفَّذ بهوية المستخدم الموقّع (RLS مطبّق) بعد تحقق صريح من الدور،
 * فلا يعتمد العزل على الواجهة إطلاقاً. الإجماليات تُحسب في قاعدة البيانات.
 */
import { requireMemberRole } from "@/lib/pii.server";
import type { AppRole } from "@/hooks/use-auth";
import {
  BILLING_DENIED_MESSAGE,
  BILLING_MANAGE_DENIED_MESSAGE,
  BILLING_MANAGE_ROLES,
  BILLING_VIEW_ROLES,
} from "./permissions";
import { displayStatus, riyadhToday, type OfficeInvoiceDisplayStatus } from "./billing.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const num = (v: unknown): number => Number(v ?? 0);

export type BillingAccess = { role: AppRole; canManage: boolean };

/** بوابة الوصول المالية: تُستدعى في بداية كل عملية قراءة أو كتابة. */
export async function requireBillingAccess(
  supabase: Client,
  organizationId: string,
  userId: string,
  mode: "view" | "manage",
): Promise<BillingAccess> {
  const role = (await requireMemberRole(supabase, organizationId, userId)) as AppRole;
  if (!BILLING_VIEW_ROLES.includes(role)) throw new Error(BILLING_DENIED_MESSAGE);
  if (mode === "manage" && !BILLING_MANAGE_ROLES.includes(role)) {
    throw new Error(BILLING_MANAGE_DENIED_MESSAGE);
  }
  return { role, canManage: BILLING_MANAGE_ROLES.includes(role) };
}

const INVOICE_COLUMNS =
  "id, organization_id, client_id, case_id, invoice_number, status, currency, issue_date, due_date, " +
  "discount_type, discount_value, tax_rate, subtotal, discount_total, tax_total, total, paid_total, balance, " +
  "payment_terms, notes, title, issued_at, paid_at, cancelled_at, cancellation_reason, created_at, updated_at";

export type InvoiceListRow = {
  id: string;
  invoice_number: string | null;
  title: string | null;
  status: string;
  displayStatus: OfficeInvoiceDisplayStatus;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  paid_total: number;
  balance: number;
  client: { id: string; full_name: string } | null;
  case: { id: string; case_title: string; case_number: string | null } | null;
};

export type InvoiceListResult = { rows: InvoiceListRow[]; count: number };

export async function listInvoices(
  supabase: Client,
  input: {
    organizationId: string;
    search?: string;
    status?: string;
    clientId?: string;
    caseId?: string;
    page: number;
    pageSize: number;
  },
): Promise<InvoiceListResult> {
  const today = riyadhToday();
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("office_invoices")
    .select(
      `${INVOICE_COLUMNS}, client:clients(id, full_name), case:cases(id, case_title, case_number)`,
      { count: "exact" },
    )
    .eq("organization_id", input.organizationId);

  if (input.clientId) query = query.eq("client_id", input.clientId);
  if (input.caseId) query = query.eq("case_id", input.caseId);
  if (input.status && input.status !== "all") {
    if (input.status === "overdue") {
      query = query
        .in("status", ["issued", "partially_paid"])
        .lt("due_date", today)
        .gt("balance", 0);
    } else {
      query = query.eq("status", input.status);
    }
  }
  const term = input.search?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ").trim();
    if (safe) query = query.or(`invoice_number.ilike.%${safe}%,title.ilike.%${safe}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + input.pageSize - 1);
  if (error) throw new Error("تعذّر تحميل الفواتير. أعد المحاولة.");

  type Raw = Record<string, unknown> & {
    client?: { id: string; full_name: string } | null;
    case?: { id: string; case_title: string; case_number: string | null } | null;
  };
  const rows: InvoiceListRow[] = ((data ?? []) as Raw[]).map((r) => ({
    id: String(r["id"]),
    invoice_number: (r["invoice_number"] as string | null) ?? null,
    title: (r["title"] as string | null) ?? null,
    status: String(r["status"]),
    displayStatus: displayStatus({
      status: String(r["status"]),
      due_date: (r["due_date"] as string | null) ?? null,
      balance: num(r["balance"]),
      todayRiyadh: today,
    }),
    issue_date: (r["issue_date"] as string | null) ?? null,
    due_date: (r["due_date"] as string | null) ?? null,
    total: num(r["total"]),
    paid_total: num(r["paid_total"]),
    balance: num(r["balance"]),
    client: r.client ?? null,
    case: r.case ?? null,
  }));
  return { rows, count: count ?? 0 };
}

export type InvoiceRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  case_id: string | null;
  invoice_number: string | null;
  status: string;
  displayStatus: OfficeInvoiceDisplayStatus;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  discount_type: string;
  discount_value: number;
  tax_rate: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid_total: number;
  balance: number;
  payment_terms: string | null;
  notes: string | null;
  title: string | null;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  client: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    client_type: string | null;
  } | null;
  case: { id: string; case_title: string; case_number: string | null } | null;
};

export type InvoiceDetail = {
  invoice: InvoiceRecord;
  items: {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference_number: string | null;
    paid_at: string;
    note: string | null;
    voided_at: string | null;
    void_reason: string | null;
  }[];
  organization: { id: string; name: string; tax_number: string | null } | null;
};

export async function getInvoiceDetail(
  supabase: Client,
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceDetail> {
  const { data, error } = await supabase
    .from("office_invoices")
    .select(
      `${INVOICE_COLUMNS}, client:clients(id, full_name, email, phone, client_type), case:cases(id, case_title, case_number)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error("تعذّر تحميل الفاتورة.");
  if (!data) throw new Error("الفاتورة غير موجودة أو لا تملك صلاحية الاطلاع عليها.");

  const [itemsRes, paymentsRes, orgRes] = await Promise.all([
    supabase
      .from("office_invoice_items")
      .select("id, description, quantity, unit_price, line_total, sort_order")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("office_payments")
      .select("id, amount, method, reference_number, paid_at, note, voided_at, void_reason")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false }),
    supabase
      .from("organizations")
      .select("id, name, tax_number")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  if (itemsRes.error) throw new Error("تعذّر تحميل بنود الفاتورة.");
  if (paymentsRes.error) throw new Error("تعذّر تحميل دفعات الفاتورة.");

  const raw = data as Record<string, unknown>;
  const str = (k: string): string | null => (raw[k] as string | null) ?? null;
  return {
    invoice: {
      id: String(raw["id"]),
      organization_id: String(raw["organization_id"]),
      client_id: String(raw["client_id"]),
      case_id: str("case_id"),
      invoice_number: str("invoice_number"),
      status: String(raw["status"]),
      displayStatus: displayStatus({
        status: String(raw["status"]),
        due_date: str("due_date"),
        balance: num(raw["balance"]),
      }),
      currency: String(raw["currency"] ?? "SAR"),
      issue_date: str("issue_date"),
      due_date: str("due_date"),
      discount_type: String(raw["discount_type"] ?? "amount"),
      discount_value: num(raw["discount_value"]),
      tax_rate: num(raw["tax_rate"]),
      subtotal: num(raw["subtotal"]),
      discount_total: num(raw["discount_total"]),
      tax_total: num(raw["tax_total"]),
      total: num(raw["total"]),
      paid_total: num(raw["paid_total"]),
      balance: num(raw["balance"]),
      payment_terms: str("payment_terms"),
      notes: str("notes"),
      title: str("title"),
      issued_at: str("issued_at"),
      paid_at: str("paid_at"),
      cancelled_at: str("cancelled_at"),
      cancellation_reason: str("cancellation_reason"),
      created_at: String(raw["created_at"]),
      updated_at: String(raw["updated_at"]),
      client: (raw["client"] as InvoiceRecord["client"]) ?? null,
      case: (raw["case"] as InvoiceRecord["case"]) ?? null,
    },
    items: (itemsRes.data ?? []).map((i: Record<string, unknown>) => ({
      id: String(i["id"]),
      description: String(i["description"]),
      quantity: num(i["quantity"]),
      unit_price: num(i["unit_price"]),
      line_total: num(i["line_total"]),
      sort_order: Number(i["sort_order"] ?? 0),
    })),
    payments: (paymentsRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p["id"]),
      amount: num(p["amount"]),
      method: String(p["method"]),
      reference_number: (p["reference_number"] as string | null) ?? null,
      paid_at: String(p["paid_at"]),
      note: (p["note"] as string | null) ?? null,
      voided_at: (p["voided_at"] as string | null) ?? null,
      void_reason: (p["void_reason"] as string | null) ?? null,
    })),
    organization: (orgRes.data as InvoiceDetail["organization"]) ?? null,
  };
}

export type BillingSummary = {
  invoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
  draftCount: number;
  overdueCount: number;
};

type SummaryRow = { status: string; due_date: string | null; total: number; paid_total: number };

function summarize(rows: SummaryRow[], today: string): BillingSummary {
  let invoiced = 0;
  let collected = 0;
  let outstanding = 0;
  let overdue = 0;
  let draftCount = 0;
  let overdueCount = 0;
  for (const r of rows) {
    if (r.status === "draft") {
      draftCount += 1;
      continue;
    }
    if (r.status === "cancelled") continue;
    const total = num(r.total);
    const paid = num(r.paid_total);
    const balance = Math.round((total - paid) * 100) / 100;
    invoiced += total;
    collected += paid;
    outstanding += balance;
    if (balance > 0 && r.due_date && r.due_date < today) {
      overdue += balance;
      overdueCount += 1;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    invoiced: r2(invoiced),
    collected: r2(collected),
    outstanding: r2(outstanding),
    overdue: r2(overdue),
    draftCount,
    overdueCount,
  };
}

/** مؤشرات المكتب المالية — تُحسب من صفوف المكتب نفسه فقط. */
export async function officeBillingSummary(
  supabase: Client,
  organizationId: string,
  filters?: { clientId?: string; caseId?: string },
): Promise<BillingSummary> {
  let query = supabase
    .from("office_invoices")
    .select("status, due_date, total, paid_total")
    .eq("organization_id", organizationId);
  if (filters?.clientId) query = query.eq("client_id", filters.clientId);
  if (filters?.caseId) query = query.eq("case_id", filters.caseId);
  const { data, error } = await query;
  if (error) throw new Error("تعذّر حساب المؤشرات المالية.");
  return summarize((data ?? []) as SummaryRow[], riyadhToday());
}

export type ClientStatement = {
  client: { id: string; full_name: string; email: string | null; phone: string | null };
  organization: { id: string; name: string; tax_number: string | null } | null;
  summary: BillingSummary;
  invoices: {
    id: string;
    invoice_number: string | null;
    status: string;
    displayStatus: OfficeInvoiceDisplayStatus;
    issue_date: string | null;
    due_date: string | null;
    total: number;
    paid_total: number;
    balance: number;
    case_title: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    paid_at: string;
    reference_number: string | null;
    invoice_number: string | null;
  }[];
  generatedAt: string;
};

export async function clientStatement(
  supabase: Client,
  organizationId: string,
  clientId: string,
): Promise<ClientStatement> {
  const today = riyadhToday();
  const [clientRes, invoicesRes, paymentsRes, orgRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, email, phone")
      .eq("organization_id", organizationId)
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("office_invoices")
      .select(
        "id, invoice_number, status, issue_date, due_date, total, paid_total, balance, case:cases(case_title)",
      )
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("office_payments")
      .select("id, amount, method, paid_at, reference_number, invoice:office_invoices(invoice_number)")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .is("voided_at", null)
      .order("paid_at", { ascending: false }),
    supabase
      .from("organizations")
      .select("id, name, tax_number")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  if (clientRes.error || !clientRes.data) throw new Error("العميل غير موجود في هذا المكتب.");
  if (invoicesRes.error) throw new Error("تعذّر تحميل فواتير العميل.");
  if (paymentsRes.error) throw new Error("تعذّر تحميل دفعات العميل.");

  type InvRaw = Record<string, unknown> & { case?: { case_title: string } | null };
  const invoices = ((invoicesRes.data ?? []) as InvRaw[]).map((r) => ({
    id: String(r["id"]),
    invoice_number: (r["invoice_number"] as string | null) ?? null,
    status: String(r["status"]),
    displayStatus: displayStatus({
      status: String(r["status"]),
      due_date: (r["due_date"] as string | null) ?? null,
      balance: num(r["balance"]),
      todayRiyadh: today,
    }),
    issue_date: (r["issue_date"] as string | null) ?? null,
    due_date: (r["due_date"] as string | null) ?? null,
    total: num(r["total"]),
    paid_total: num(r["paid_total"]),
    balance: num(r["balance"]),
    case_title: r.case?.case_title ?? null,
  }));

  type PayRaw = Record<string, unknown> & { invoice?: { invoice_number: string | null } | null };
  const payments = ((paymentsRes.data ?? []) as PayRaw[]).map((p) => ({
    id: String(p["id"]),
    amount: num(p["amount"]),
    method: String(p["method"]),
    paid_at: String(p["paid_at"]),
    reference_number: (p["reference_number"] as string | null) ?? null,
    invoice_number: p.invoice?.invoice_number ?? null,
  }));

  return {
    client: clientRes.data as ClientStatement["client"],
    organization: (orgRes.data as ClientStatement["organization"]) ?? null,
    summary: summarize(
      invoices.map((i) => ({
        status: i.status,
        due_date: i.due_date,
        total: i.total,
        paid_total: i.paid_total,
      })),
      today,
    ),
    invoices,
    payments,
    generatedAt: new Date().toISOString(),
  };
}