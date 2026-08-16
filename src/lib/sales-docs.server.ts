/**
 * محرك وحدة عروض الأسعار والمقترحات والعقود — يُستدعى من داخل معالجات دوال
 * الخادم فقط (sales-docs.functions.ts).
 *
 * قواعد ثابتة:
 * - الإجماليات تُحسب حصراً عبر computeSalesDocTotals ثم تُكتب كما هي.
 * - أي انتقال حالة يُتحقق منه عبر STATUS_TRANSITIONS ويُسجَّل حدثاً في
 *   sales_document_events (جدول غير قابل للتعديل أو الحذف).
 * - مبدأ الفصل بين المُنشئ والمعتمد (Four-Eyes) في الاعتماد.
 * - المستند يُقفل (locked=true) فور القبول ولا تُعدَّل بنوده بعدها.
 */
import { writeAudit, type StaffRow } from "@/lib/admin-guard.server";
import { fmtDecimal } from "@/lib/format";
import { newTraceRef } from "@/lib/security/sensitive-guard.server";
import {
  APPROVAL_DISCOUNT_PERCENT_THRESHOLD,
  computeSalesDocTotals,
  STATUS_TRANSITIONS,
  type SalesDocEventRow,
  type SalesDocItemInput,
  type SalesDocItemRow,
  type SalesDocRow,
  type SalesDocSignatureRow,
  type SalesDocStatus,
  type SalesDocTemplateRow,
} from "@/lib/sales-docs.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type SalesCtx = { staff: StaffRow };

async function db(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/**
 * فشل موحّد لعمليات الوحدة.
 *
 * القاعدة: لا تُكتم أسباب الفشل. تُترجم أكواد Postgres المعروفة إلى رسالة عربية
 * دقيقة تشرح السبب الفعلي، ويُسجَّل الخطأ الأصلي في سجل الخادم مع معرّف تتبع
 * يُعاد للمستخدم — دون كشف تفاصيل داخلية أو Stack Trace في الواجهة.
 */
type DbError = { message?: string; code?: string; details?: string; hint?: string } | null;

function dbReason(error: DbError): string | null {
  const code = error?.code ?? "";
  const detail = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (code === "23514") {
    if (/sales_tpl_name_len/.test(detail)) return "اسم القالب يجب أن يكون بين حرفين و160 حرفاً.";
    if (/sales_tpl_validity_chk/.test(detail))
      return "مدة صلاحية القالب يجب أن تكون بين 0 و365 يوماً.";
    if (/sales_tpl_tax_chk|sales_doc_tax_chk/.test(detail))
      return "نسبة الضريبة يجب أن تكون بين 0 و100.";
    if (/sales_doc_title_len/.test(detail)) return "عنوان المستند يجب أن يكون بين حرفين و200 حرف.";
    if (/sales_doc_amount_chk/.test(detail)) return "قيم المستند لا يمكن أن تكون سالبة.";
    return "إحدى القيم المدخلة لا تحقق قواعد التحقق المعتمدة.";
  }
  if (code === "23503") return "أحد الحقول المرتبطة (العميل أو الشركة أو القالب) غير موجود.";
  if (code === "23502") return "حقل إلزامي مفقود في البيانات المرسلة.";
  if (code === "22P02") return "قيمة غير صالحة في أحد الحقول (تنسيق غير مقبول).";
  if (code === "42501" || code === "PGRST301")
    return "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.";
  return null;
}

function fail(error: DbError, fallback: string): never {
  const trace = newTraceRef("SD");
  console.error(
    `[sales-docs] ${trace} ${fallback} :: code=${error?.code ?? "-"} message=${error?.message ?? "-"} details=${error?.details ?? "-"}`,
  );
  const unique = error?.code === "23505";
  const reason = unique
    ? /sales_document_templates_name_key/.test(`${error?.message} ${error?.details}`)
      ? "يوجد قالب آخر بنفس الاسم لهذا النوع — اختر اسماً مختلفاً."
      : "توجد قيمة مكررة تمنع الحفظ."
    : dbReason(error);
  throw new Error(`${reason ?? fallback} (مرجع: ${trace})`);
}

/* ------------------------------------------------------------------ القراءة */

export type ListFilters = {
  search?: string | null;
  kind?: string | null;
  status?: string | null;
  companyId?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
};

const LIST_COLUMNS =
  "id, kind, status, number, title, organization_id, company_id, contact_id, currency, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount, total, requires_approval, locked, owner_staff_id, created_by, created_at, updated_at, sent_at, decided_at, valid_until, starts_on, ends_on, converted_invoice_id, converted_subscription_id, recipient_name, recipient_company, recipient_phone, recipient_email, recipient_address, organizations(name), crm_companies(name)";

function mapRow(row: AnyClient): SalesDocRow {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    number: row.number,
    title: row.title,
    organization_id: row.organization_id,
    organization_name: row.organizations?.name ?? row.crm_companies?.name ?? null,
    company_id: row.company_id,
    contact_id: row.contact_id,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value),
    discount_amount: Number(row.discount_amount),
    tax_rate: Number(row.tax_rate),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    requires_approval: !!row.requires_approval,
    locked: !!row.locked,
    owner_staff_id: row.owner_staff_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sent_at: row.sent_at,
    decided_at: row.decided_at,
    valid_until: row.valid_until,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    converted_invoice_id: row.converted_invoice_id,
    converted_subscription_id: row.converted_subscription_id,
    recipient_name: row.recipient_name ?? null,
    recipient_company: row.recipient_company ?? null,
    recipient_phone: row.recipient_phone ?? null,
    recipient_email: row.recipient_email ?? null,
    recipient_address: row.recipient_address ?? null,
  };
}

export async function listDocuments(
  filters: ListFilters,
): Promise<{ rows: SalesDocRow[]; total: number }> {
  const client = await db();
  let query = client
    .from("sales_documents")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.search) {
    const s = filters.search.replace(/[%,]/g, "");
    query = query.or(`title.ilike.%${s}%,number.ilike.%${s}%`);
  }

  const fromIdx = (filters.page - 1) * filters.pageSize;
  const { data, error, count } = await query.range(fromIdx, fromIdx + filters.pageSize - 1);
  if (error) fail(error, "تعذّر جلب المستندات.");
  return { rows: (data ?? []).map(mapRow), total: count ?? 0 };
}

export type DocumentDetail = {
  document: SalesDocRow;
  items: SalesDocItemRow[];
  events: SalesDocEventRow[];
  signatures: SalesDocSignatureRow[];
};

export async function getDocumentDetail(id: string): Promise<DocumentDetail> {
  const client = await db();
  const { data: row, error } = await client
    .from("sales_documents")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !row) throw new Error("المستند غير موجود.");
  const [{ data: items }, { data: events }, { data: signatures }] = await Promise.all([
    client.from("sales_document_items").select("*").eq("document_id", id).order("sort_order"),
    client
      .from("sales_document_events")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("sales_document_signatures")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    document: mapRow(row),
    items: ((items ?? []) as AnyClient[]).map((it) => ({
      id: it.id,
      document_id: it.document_id,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      discount_amount: Number(it.discount_amount),
      amount: Number(it.amount),
      sort_order: it.sort_order,
    })),
    events: (events ?? []) as SalesDocEventRow[],
    signatures: (signatures ?? []) as SalesDocSignatureRow[],
  };
}

/* -------------------------------------------------------------- الحفظ (مسودة) */

export type DraftInput = {
  id?: string | null;
  kind: "quote" | "proposal" | "contract";
  title: string;
  organizationId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  templateId?: string | null;
  currency: string;
  discountType: "percent" | "amount";
  discountValue: number;
  taxRate: number;
  intro?: string | null;
  terms?: string | null;
  notes?: string | null;
  validUntil?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  recipientName?: string | null;
  recipientCompany?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  recipientAddress?: string | null;
  items: SalesDocItemInput[];
};

async function logEvent(
  client: AnyClient,
  documentId: string,
  event: string,
  fromStatus: SalesDocStatus | null,
  toStatus: SalesDocStatus | null,
  actorEmail: string,
  note?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.from("sales_document_events").insert({
    document_id: documentId,
    event,
    from_status: fromStatus,
    to_status: toStatus,
    actor_email: actorEmail,
    note: note ?? null,
    metadata,
  });
}

export async function saveDraft(ctx: SalesCtx, input: DraftInput): Promise<string> {
  const client = await db();
  const totals = computeSalesDocTotals(
    input.items,
    input.discountType,
    input.discountValue,
    input.taxRate,
  );

  if (input.id) {
    const { data: existing } = await client
      .from("sales_documents")
      .select("id, status, locked")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing) throw new Error("المستند غير موجود.");
    if (existing.locked || !["draft", "pending_approval", "approved"].includes(existing.status)) {
      throw new Error("لا يمكن تعديل مستند بعد اعتماده أو إرساله أو قفله.");
    }
  }

  const payload = {
    kind: input.kind,
    title: input.title,
    organization_id: input.organizationId ?? null,
    company_id: input.companyId ?? null,
    contact_id: input.contactId ?? null,
    deal_id: input.dealId ?? null,
    template_id: input.templateId ?? null,
    currency: input.currency,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    discount_amount: totals.discount_amount,
    tax_rate: input.taxRate,
    tax_amount: totals.tax_amount,
    subtotal: totals.subtotal,
    total: totals.total,
    requires_approval: totals.requires_approval,
    intro: input.intro ?? null,
    terms: input.terms ?? null,
    notes: input.notes ?? null,
    valid_until: input.validUntil ?? null,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    recipient_name: input.recipientName ?? null,
    recipient_company: input.recipientCompany ?? null,
    recipient_phone: input.recipientPhone ?? null,
    recipient_email: input.recipientEmail ?? null,
    recipient_address: input.recipientAddress ?? null,
    status: "draft" as const,
    updated_by: ctx.staff.user_id,
  };

  let documentId = input.id ?? null;
  if (documentId) {
    const { error } = await client.from("sales_documents").update(payload).eq("id", documentId);
    if (error) fail(error, "تعذّر تحديث المستند.");
    await client.from("sales_document_items").delete().eq("document_id", documentId);
  } else {
    const { data, error } = await client
      .from("sales_documents")
      .insert({ ...payload, created_by: ctx.staff.user_id })
      .select("id")
      .single();
    if (error || !data) fail(error, "تعذّر إنشاء المستند.");
    documentId = data.id as string;
    await logEvent(client, documentId, "created", null, "draft", ctx.staff.email);
  }

  if (input.items.length > 0) {
    const rows = input.items.map((item, index) => ({
      document_id: documentId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      amount: Math.max(0, item.quantity * item.unit_price - item.discount_amount),
      sort_order: index,
    }));
    const { error } = await client.from("sales_document_items").insert(rows);
    if (error) fail(error, "تعذّر حفظ بنود المستند.");
  }

  await writeAudit(client, ctx.staff, {
    action: input.id ? "sales_docs.update_draft" : "sales_docs.create_draft",
    entity_type: "sales_document",
    entity_id: documentId,
    description: input.id ? "تعديل مسودة" : "إنشاء مسودة",
    metadata: { items: input.items.length },
  });

  return documentId as string;
}

export async function deleteDraft(ctx: SalesCtx, id: string): Promise<void> {
  const client = await db();
  const { data: doc } = await client
    .from("sales_documents")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) throw new Error("المستند غير موجود.");
  if (doc.status !== "draft") throw new Error("لا يمكن حذف إلا مسودة لم تُرسل بعد.");
  const { error } = await client.from("sales_documents").delete().eq("id", id);
  if (error) fail(error, "تعذّر حذف المسودة.");
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.delete_draft",
    entity_type: "sales_document",
    entity_id: id,
    description: "حذف مسودة",
  });
}

async function requireDoc(client: AnyClient, id: string): Promise<AnyClient> {
  const { data } = await client.from("sales_documents").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("المستند غير موجود.");
  return data;
}

function assertTransition(from: SalesDocStatus, to: SalesDocStatus) {
  const allowed = STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) throw new Error("انتقال حالة غير مسموح به من الحالة الحالية.");
}

/* --------------------------------------------------------------- سير الاعتماد */

export async function requestApproval(
  ctx: SalesCtx,
  id: string,
  note?: string | null,
): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  assertTransition(doc.status, "pending_approval");
  const { error } = await client
    .from("sales_documents")
    .update({ status: "pending_approval", updated_by: ctx.staff.user_id })
    .eq("id", id);
  if (error) fail(error, "تعذّر إرسال طلب الاعتماد.");
  await logEvent(
    client,
    id,
    "approval_requested",
    doc.status,
    "pending_approval",
    ctx.staff.email,
    note,
  );
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.request_approval",
    entity_type: "sales_document",
    entity_id: id,
    description: "طلب اعتماد مستند",
  });
}

export async function decideApproval(
  ctx: SalesCtx,
  id: string,
  approve: boolean,
  note?: string | null,
): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  if (doc.status !== "pending_approval") throw new Error("المستند ليس بانتظار الاعتماد.");
  if (doc.created_by && doc.created_by === ctx.staff.user_id) {
    throw new Error(
      "لا يمكن اعتماد مستند أنشأته بنفسك — يلزم موظف آخر (مبدأ الفصل بين المُنشئ والمعتمد).",
    );
  }
  const toStatus: SalesDocStatus = approve ? "approved" : "draft";
  assertTransition(doc.status, toStatus);
  const { error } = await client
    .from("sales_documents")
    .update({
      status: toStatus,
      approved_by: approve ? ctx.staff.user_id : null,
      approved_at: approve ? new Date().toISOString() : null,
      updated_by: ctx.staff.user_id,
    })
    .eq("id", id);
  if (error) fail(error, "تعذّر تسجيل قرار الاعتماد.");
  await logEvent(
    client,
    id,
    approve ? "approved" : "rejected_approval",
    doc.status,
    toStatus,
    ctx.staff.email,
    note,
  );
  await writeAudit(client, ctx.staff, {
    action: approve ? "sales_docs.approve" : "sales_docs.reject_approval",
    entity_type: "sales_document",
    entity_id: id,
    description: approve ? "اعتماد مستند" : "رفض اعتماد مستند",
  });
}

/* -------------------------------------------------------------------- الإرسال */

export async function sendDocument(
  ctx: SalesCtx,
  id: string,
  toEmail: string,
  message?: string | null,
): Promise<{ number: string }> {
  const client = await db();
  const doc = await requireDoc(client, id);
  if (doc.requires_approval && doc.status !== "approved") {
    throw new Error("يتطلب هذا المستند اعتماداً قبل الإرسال بسبب تجاوز حد الخصم المسموح.");
  }
  assertTransition(doc.status, "sent");

  let number = doc.number as string | null;
  if (!number) {
    const { data: numberData, error: numberError } = await client.rpc("next_financial_number", {
      _kind: doc.kind,
    });
    if (numberError || !numberData) throw new Error("تعذّر توليد الرقم النظامي للمستند.");
    number = numberData as string;
  }

  const sentAt = new Date().toISOString();
  const { error } = await client
    .from("sales_documents")
    .update({ status: "sent", number, sent_at: sentAt, updated_by: ctx.staff.user_id })
    .eq("id", id);
  if (error) fail(error, "تعذّر إرسال المستند.");
  await logEvent(client, id, "sent", doc.status, "sent", ctx.staff.email, message, { to: toEmail });
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.send",
    entity_type: "sales_document",
    entity_id: id,
    description: `إرسال المستند رقم ${number} إلى ${toEmail}`,
  });

  try {
    const { sendAppEmail } = await import("@/lib/email/app-email.server");
    const React = await import("react");
    const label =
      doc.kind === "contract" ? "العقد" : doc.kind === "proposal" ? "المقترح" : "عرض السعر";
    const element = React.createElement(
      "div",
      {
        style: { fontFamily: "sans-serif", direction: "rtl" as const, textAlign: "right" as const },
      },
      React.createElement("h2", null, `${label} رقم ${number} — ${doc.title as string}`),
      React.createElement(
        "p",
        null,
        message || "مرفق تفاصيل المستند، يسعدنا استلام ردكم في أقرب وقت.",
      ),
      React.createElement("p", null, `الإجمالي: ${fmtDecimal(Number(doc.total))} ${doc.currency}`),
    );
    // فحص الحجب قبل الإرسال بفئة المبيعات (تُمنع بإلغاء الاشتراك أيضاً).
    const { isRecipientBlocked } = await import("@/lib/email/suppression.server");
    if (await isRecipientBlocked(toEmail, "sales")) return { number: number as string };

    await sendAppEmail({
      to: toEmail,
      subject: `${label} ${number} من مِهلة`,
      element,
      label: "sales_document_send",
      // عروض ومقترحات: هوية المبيعات كي يصل رد العميل لقسم المبيعات.
      identity: "sales",
      idempotencyKey: `sales-doc-${id}-${number}`,
      organizationId: (doc.organization_id as string) ?? null,
    });
  } catch {
    // فشل البريد لا يُفشل عملية الإرسال بحد ذاتها — الحدث مسجَّل والتدقيق قائم.
  }

  return { number: number as string };
}

export async function markViewed(id: string): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  if (doc.status !== "sent") return;
  await client
    .from("sales_documents")
    .update({ status: "viewed", first_viewed_at: doc.first_viewed_at ?? new Date().toISOString() })
    .eq("id", id);
  await logEvent(client, id, "viewed", "sent", "viewed", "system");
}

/* -------------------------------------------------------------------- القرار */

export async function recordDecision(
  ctx: SalesCtx,
  id: string,
  decision: "accepted" | "rejected" | "expired" | "cancelled",
  note?: string | null,
): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  assertTransition(doc.status, decision);
  const decidedAt = new Date().toISOString();
  const { error } = await client
    .from("sales_documents")
    .update({
      status: decision,
      decided_at: decidedAt,
      decision_note: note ?? null,
      locked: decision === "accepted" ? true : doc.locked,
      updated_by: ctx.staff.user_id,
    })
    .eq("id", id);
  if (error) fail(error, "تعذّر تسجيل القرار.");
  await logEvent(client, id, `decision_${decision}`, doc.status, decision, ctx.staff.email, note);
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.decide",
    entity_type: "sales_document",
    entity_id: id,
    description: `تسجيل قرار: ${decision}`,
  });
}

export async function activateContract(ctx: SalesCtx, id: string): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  assertTransition(doc.status, "active");
  const { error } = await client
    .from("sales_documents")
    .update({ status: "active", locked: true })
    .eq("id", id);
  if (error) fail(error, "تعذّر تفعيل العقد.");
  await logEvent(client, id, "activated", doc.status, "active", ctx.staff.email);
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.activate",
    entity_type: "sales_document",
    entity_id: id,
    description: "تفعيل عقد",
  });
}

export async function terminateContract(
  ctx: SalesCtx,
  id: string,
  note?: string | null,
): Promise<void> {
  const client = await db();
  const doc = await requireDoc(client, id);
  assertTransition(doc.status, "terminated");
  const { error } = await client
    .from("sales_documents")
    .update({ status: "terminated", decision_note: note ?? doc.decision_note })
    .eq("id", id);
  if (error) fail(error, "تعذّر إنهاء العقد.");
  await logEvent(client, id, "terminated", doc.status, "terminated", ctx.staff.email, note);
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.terminate",
    entity_type: "sales_document",
    entity_id: id,
    description: "إنهاء عقد",
  });
}

/* ---------------------------------------------------------------- التوقيع */

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signDocument(
  ctx: SalesCtx,
  id: string,
  signerName: string,
  signerEmail: string,
  signerRole: string | null,
): Promise<void> {
  const client = await db();
  const detail = await getDocumentDetail(id);
  const { requestMeta } = await import("@/lib/admin-guard.server");
  const { ip, userAgent } = requestMeta();
  const signedAt = new Date().toISOString();
  const content = JSON.stringify({
    id: detail.document.id,
    number: detail.document.number,
    total: detail.document.total,
    items: detail.items.map((i) => ({ d: i.description, q: i.quantity, p: i.unit_price })),
    signerName,
    signerEmail,
    signedAt,
    ip,
  });
  const evidenceHash = await sha256Hex(content);
  const { error } = await client.from("sales_document_signatures").insert({
    document_id: id,
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    method: "electronic",
    evidence_hash: evidenceHash,
    ip,
    user_agent: userAgent,
    signed_at: signedAt,
  });
  if (error) fail(error, "تعذّر تسجيل التوقيع.");
  await logEvent(
    client,
    id,
    "signed",
    null,
    null,
    ctx.staff.email,
    `توقيع: ${signerName} <${signerEmail}>`,
    {
      evidence_hash: evidenceHash,
    },
  );
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.sign",
    entity_type: "sales_document",
    entity_id: id,
    description: `توقيع إلكتروني من ${signerName}`,
    metadata: { evidence_hash: evidenceHash },
  });
}

/* --------------------------------------------------------------------- التحويل */

export async function convertToInvoice(
  ctx: SalesCtx,
  id: string,
  dueAt?: string | null,
): Promise<{ invoiceId: string }> {
  const client = await db();
  const detail = await getDocumentDetail(id);
  const doc = detail.document;
  if (!["accepted", "active"].includes(doc.status))
    throw new Error("لا يمكن التحويل لفاتورة إلا لمستند مقبول أو عقد نشط.");
  if (doc.converted_invoice_id) throw new Error("تم تحويل هذا المستند إلى فاتورة مسبقاً.");

  let customerName = doc.title;
  let customerEmail: string | null = null;
  if (doc.company_id) {
    const { data: company } = await client
      .from("crm_companies")
      .select("name, legal_name, email")
      .eq("id", doc.company_id)
      .maybeSingle();
    if (company) {
      customerName = company.legal_name || company.name;
      customerEmail = company.email ?? null;
    }
  }
  if (doc.contact_id) {
    const { data: contact } = await client
      .from("crm_contacts")
      .select("full_name, email")
      .eq("id", doc.contact_id)
      .maybeSingle();
    if (contact) {
      customerEmail = customerEmail ?? contact.email ?? null;
      if (customerName === doc.title) customerName = contact.full_name;
    }
  }

  const { data: invoiceId, error } = await client.rpc("billing_save_draft", {
    _payload: {
      id: null,
      organization_id: doc.organization_id,
      user_id: null,
      plan_code: null,
      plan_label: doc.title,
      customer_name: customerName,
      customer_legal_name: null,
      customer_email: customerEmail,
      customer_phone: null,
      billing_address: null,
      commercial_registration: null,
      tax_number: null,
      currency: doc.currency,
      tax_rate: doc.tax_rate,
      tax_exempt: false,
      tax_exemption_reason: null,
      service_period_start: doc.starts_on ?? null,
      service_period_end: doc.ends_on ?? null,
      due_at: dueAt ?? null,
      notes: `مُحوَّل من المستند ${doc.number ?? doc.id} (${doc.title})`,
      internal_notes: null,
      items: detail.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
      })),
    },
  });
  if (error || !invoiceId) fail(error, "تعذّر إنشاء الفاتورة من المستند.");

  const { error: updateError } = await client
    .from("sales_documents")
    .update({ converted_invoice_id: invoiceId })
    .eq("id", id);
  if (updateError) fail(updateError, "تعذّر تحديث حالة التحويل.");
  await logEvent(client, id, "converted_to_invoice", null, null, ctx.staff.email, null, {
    invoice_id: invoiceId,
  });
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.convert_invoice",
    entity_type: "sales_document",
    entity_id: id,
    description: "تحويل إلى فاتورة",
    metadata: { invoice_id: invoiceId as string },
  });
  return { invoiceId: invoiceId as string };
}

export async function convertToSubscription(
  ctx: SalesCtx,
  id: string,
  planCode: string,
  startsOn?: string | null,
  endsOn?: string | null,
): Promise<{ subscriptionId: string }> {
  const client = await db();
  const detail = await getDocumentDetail(id);
  const doc = detail.document;
  if (!["accepted", "active"].includes(doc.status))
    throw new Error("لا يمكن التحويل لاشتراك إلا لمستند مقبول أو عقد نشط.");
  if (doc.converted_subscription_id) throw new Error("تم تحويل هذا المستند إلى اشتراك مسبقاً.");
  if (!doc.organization_id) throw new Error("لا يمكن إنشاء اشتراك بدون ربط المستند بمكتب.");

  const { data: owner } = await client
    .from("organization_members")
    .select("profiles(id, email)")
    .eq("organization_id", doc.organization_id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  const ownerProfile = (owner as AnyClient)?.profiles as {
    id: string;
    email: string | null;
  } | null;
  if (!ownerProfile?.id) throw new Error("تعذّر تحديد مالك المكتب لإنشاء الاشتراك.");

  const starts = startsOn ?? doc.starts_on ?? new Date().toISOString().slice(0, 10);
  const ends =
    endsOn ?? doc.ends_on ?? new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  const { data: created, error } = await client
    .from("subscriptions")
    .insert({
      organization_id: doc.organization_id,
      user_id: ownerProfile.id,
      email: ownerProfile.email ?? "",
      plan_code: planCode,
      plan_label: doc.title,
      amount: doc.total,
      currency: doc.currency,
      starts_at: starts,
      ends_at: ends,
      status: "active",
      activation_method: "sales_document_conversion",
      created_by: ctx.staff.user_id,
    })
    .select("id")
    .single();
  if (error || !created) fail(error, "تعذّر إنشاء الاشتراك.");

  const { error: updateError } = await client
    .from("sales_documents")
    .update({ converted_subscription_id: created.id })
    .eq("id", id);
  if (updateError) fail(updateError, "تعذّر تحديث حالة التحويل.");
  await logEvent(client, id, "converted_to_subscription", null, null, ctx.staff.email, null, {
    subscription_id: created.id,
  });
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.convert_subscription",
    entity_type: "sales_document",
    entity_id: id,
    description: "تحويل إلى اشتراك",
    metadata: { subscription_id: created.id as string },
  });
  return { subscriptionId: created.id as string };
}

/* ---------------------------------------------------------------------- القوالب */

export async function listTemplates(): Promise<SalesDocTemplateRow[]> {
  const client = await db();
  const { data, error } = await client
    .from("sales_document_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail(error, "تعذّر جلب القوالب.");
  return (data ?? []).map((row: AnyClient) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    intro: row.intro,
    terms: row.terms,
    default_tax_rate: Number(row.default_tax_rate),
    default_validity_days: row.default_validity_days,
    items: (row.items ?? []) as SalesDocItemInput[],
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export type TemplateInput = {
  id?: string | null;
  kind: "quote" | "proposal" | "contract";
  name: string;
  intro?: string | null;
  terms?: string | null;
  defaultTaxRate: number;
  defaultValidityDays: number;
  isActive: boolean;
  items: SalesDocItemInput[];
};

export async function saveTemplate(ctx: SalesCtx, input: TemplateInput): Promise<string> {
  const client = await db();
  const payload = {
    kind: input.kind,
    name: input.name,
    intro: input.intro ?? null,
    terms: input.terms ?? null,
    default_tax_rate: input.defaultTaxRate,
    default_validity_days: input.defaultValidityDays,
    is_active: input.isActive,
    items: input.items as unknown as AnyClient,
    updated_by: ctx.staff.user_id,
  };
  if (input.id) {
    const { error } = await client
      .from("sales_document_templates")
      .update(payload)
      .eq("id", input.id);
    if (error) fail(error, "تعذّر تحديث القالب.");
    await writeAudit(client, ctx.staff, {
      action: "sales_docs.update_template",
      entity_type: "sales_document_template",
      entity_id: input.id,
      description: "تعديل قالب",
    });
    return input.id;
  }
  const { data, error } = await client
    .from("sales_document_templates")
    .insert({ ...payload, created_by: ctx.staff.user_id })
    .select("id")
    .single();
  if (error || !data) fail(error, "تعذّر إنشاء القالب.");
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.create_template",
    entity_type: "sales_document_template",
    entity_id: data.id,
    description: "إنشاء قالب",
  });
  return data.id as string;
}

export async function deleteTemplate(ctx: SalesCtx, id: string): Promise<void> {
  const client = await db();
  const { error } = await client.from("sales_document_templates").delete().eq("id", id);
  if (error) fail(error, "تعذّر حذف القالب.");
  await writeAudit(client, ctx.staff, {
    action: "sales_docs.delete_template",
    entity_type: "sales_document_template",
    entity_id: id,
    description: "حذف قالب",
  });
}

export { APPROVAL_DISCOUNT_PERCENT_THRESHOLD };

/* ------------------------------------------------------------- سياق المستند */

export type DocumentContent = {
  intro: string | null;
  terms: string | null;
  notes: string | null;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  dealId: string | null;
  templateId: string | null;
};

/** بيانات نصية وأطراف المستند — تُستخدم في نموذج PDF ونموذج التعديل. */
export async function getDocumentContent(id: string): Promise<DocumentContent> {
  const client = await db();
  const { data } = await client
    .from("sales_documents")
    .select("intro, terms, notes, deal_id, template_id, company_id, contact_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("المستند غير موجود.");
  let companyName: string | null = null;
  let contactName: string | null = null;
  let contactEmail: string | null = null;
  if (data.company_id) {
    const { data: company } = await client
      .from("crm_companies")
      .select("name, legal_name")
      .eq("id", data.company_id)
      .maybeSingle();
    companyName = company ? company.legal_name || company.name : null;
  }
  if (data.contact_id) {
    const { data: contact } = await client
      .from("crm_contacts")
      .select("full_name, email")
      .eq("id", data.contact_id)
      .maybeSingle();
    contactName = contact?.full_name ?? null;
    contactEmail = contact?.email ?? null;
  }
  return {
    intro: data.intro ?? null,
    terms: data.terms ?? null,
    notes: data.notes ?? null,
    companyName,
    contactName,
    contactEmail,
    dealId: data.deal_id ?? null,
    templateId: data.template_id ?? null,
  };
}

export type PickerOptions = {
  organizations: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; email: string | null; companyId: string | null }[];
  plans: { code: string; label: string }[];
};

/** قوائم الاختيار المطلوبة في نموذج المستند (مكاتب، شركات، جهات اتصال، باقات). */
export async function pickerOptions(): Promise<PickerOptions> {
  const client = await db();
  const [orgs, companies, contacts, plans] = await Promise.all([
    client.from("organizations").select("id, name").order("name").limit(500),
    client.from("crm_companies").select("id, name, legal_name").order("name").limit(500),
    client
      .from("crm_contacts")
      .select("id, full_name, email, company_id")
      .order("full_name")
      .limit(500),
    client.from("platform_plans").select("code, name_ar").order("code").limit(100),
  ]);
  return {
    organizations: ((orgs.data ?? []) as AnyClient[]).map((o) => ({ id: o.id, name: o.name })),
    companies: ((companies.data ?? []) as AnyClient[]).map((c) => ({
      id: c.id,
      name: c.legal_name || c.name,
    })),
    contacts: ((contacts.data ?? []) as AnyClient[]).map((c) => ({
      id: c.id,
      name: c.full_name,
      email: c.email ?? null,
      companyId: c.company_id ?? null,
    })),
    plans: ((plans.data ?? []) as AnyClient[]).map((p) => ({
      code: p.code,
      label: p.name_ar ?? p.code,
    })),
  };
}
