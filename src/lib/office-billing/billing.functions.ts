import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgId = z.string().uuid();
const money = z.number().finite().min(0).max(99_999_999);

const itemSchema = z.object({
  description: z.string().trim().min(2, "وصف البند مطلوب").max(300),
  quantity: z.number().finite().gt(0, "الكمية يجب أن تكون أكبر من صفر").max(100_000),
  unitPrice: money,
});

const invoiceInput = z.object({
  organizationId: orgId,
  clientId: z.string().uuid("اختر العميل"),
  caseId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  discountType: z.enum(["amount", "percent"]),
  discountValue: money,
  taxRate: z.number().finite().min(0).max(100),
  paymentTerms: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(itemSchema).min(1, "أضف بنداً واحداً على الأقل").max(100),
});

/** قائمة فواتير المكتب — القراءة مقيدة بأدوار الاطلاع المالي. */
export const listOfficeInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        search: z.string().max(120).optional(),
        status: z.string().max(20).optional(),
        clientId: z.string().uuid().optional(),
        caseId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(50).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, listInvoices } = await import("./billing.server");
    const access = await requireBillingAccess(
      context.supabase,
      data.organizationId,
      context.userId,
      "view",
    );
    const result = await listInvoices(context.supabase, data);
    return { ...result, canManage: access.canManage };
  });

/** تفاصيل فاتورة واحدة مع بنودها ودفعاتها. */
export const getOfficeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, getInvoiceDetail } = await import("./billing.server");
    const access = await requireBillingAccess(
      context.supabase,
      data.organizationId,
      context.userId,
      "view",
    );
    const detail = await getInvoiceDetail(context.supabase, data.organizationId, data.invoiceId);
    return { ...detail, canManage: access.canManage };
  });

/** المؤشرات المالية للمكتب (أو لعميل/قضية محددة). */
export const getOfficeBillingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        clientId: z.string().uuid().optional(),
        caseId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, officeBillingSummary } = await import("./billing.server");
    const access = await requireBillingAccess(
      context.supabase,
      data.organizationId,
      context.userId,
      "view",
    );
    const summary = await officeBillingSummary(context.supabase, data.organizationId, {
      clientId: data.clientId,
      caseId: data.caseId,
    });
    return { ...summary, canManage: access.canManage };
  });

/** كشف حساب العميل: الفواتير والدفعات والأرصدة. */
export const getClientStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, clientStatement } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "view");
    return clientStatement(context.supabase, data.organizationId, data.clientId);
  });

/** إنشاء مسودة فاتورة مع بنودها. الإجماليات تحسبها قاعدة البيانات. */
export const createOfficeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => invoiceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");

    const { data: created, error } = await context.supabase
      .from("office_invoices")
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        case_id: data.caseId ?? null,
        title: data.title ?? null,
        issue_date: data.issueDate ?? null,
        due_date: data.dueDate ?? null,
        discount_type: data.discountType,
        discount_value: data.discountValue,
        tax_rate: data.taxRate,
        payment_terms: data.paymentTerms ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "تعذّر إنشاء الفاتورة.");

    const invoiceId = (created as { id: string }).id;
    const { error: itemsError } = await context.supabase.from("office_invoice_items").insert(
      data.items.map((it, index) => ({
        organization_id: data.organizationId,
        invoice_id: invoiceId,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        sort_order: index,
      })) as never,
    );
    if (itemsError) {
      // المسودة بلا بنود لا قيمة لها؛ نتراجع عنها كي لا تبقى بيانات ناقصة.
      await context.supabase
        .from("office_invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("organization_id", data.organizationId);
      throw new Error(itemsError.message || "تعذّر حفظ بنود الفاتورة.");
    }
    return { id: invoiceId };
  });

/** تعديل مسودة فاتورة واستبدال بنودها. مرفوض بعد الإصدار (يفرضه حارس القاعدة أيضاً). */
export const updateOfficeInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => invoiceInput.extend({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");

    const { data: current, error: readError } = await context.supabase
      .from("office_invoices")
      .select("id, status")
      .eq("organization_id", data.organizationId)
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (readError || !current) throw new Error("الفاتورة غير موجودة.");
    if ((current as { status: string }).status !== "draft") {
      throw new Error("لا يمكن تعديل فاتورة بعد إصدارها.");
    }

    const { error } = await context.supabase
      .from("office_invoices")
      .update({
        client_id: data.clientId,
        case_id: data.caseId ?? null,
        title: data.title ?? null,
        issue_date: data.issueDate ?? null,
        due_date: data.dueDate ?? null,
        discount_type: data.discountType,
        discount_value: data.discountValue,
        tax_rate: data.taxRate,
        payment_terms: data.paymentTerms ?? null,
        notes: data.notes ?? null,
      } as never)
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message || "تعذّر تحديث الفاتورة.");

    const { error: delError } = await context.supabase
      .from("office_invoice_items")
      .delete()
      .eq("invoice_id", data.invoiceId)
      .eq("organization_id", data.organizationId);
    if (delError) throw new Error("تعذّر تحديث بنود الفاتورة.");

    const { error: insError } = await context.supabase.from("office_invoice_items").insert(
      data.items.map((it, index) => ({
        organization_id: data.organizationId,
        invoice_id: data.invoiceId,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        sort_order: index,
      })) as never,
    );
    if (insError) throw new Error(insError.message || "تعذّر حفظ بنود الفاتورة.");
    return { id: data.invoiceId };
  });

/** إصدار الفاتورة: الترقيم المتسلسل وتثبيت البنود يتمّان في قاعدة البيانات. */
export const issueOfficeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { data: row, error } = await context.supabase
      .from("office_invoices")
      .update({ status: "issued" } as never)
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId)
      .eq("status", "draft")
      .select("id, invoice_number, status")
      .maybeSingle();
    if (error) throw new Error(error.message || "تعذّر إصدار الفاتورة.");
    if (!row) throw new Error("الفاتورة غير موجودة أو سبق إصدارها.");
    return row as { id: string; invoice_number: string | null; status: string };
  });

/** إلغاء فاتورة مُصدرة (بدل الحذف) مع سبب مسجَّل في سجل العمليات. */
export const cancelOfficeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        invoiceId: z.string().uuid(),
        reason: z.string().trim().min(3, "سبب الإلغاء مطلوب").max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { data: row, error } = await context.supabase
      .from("office_invoices")
      .update({ status: "cancelled", cancellation_reason: data.reason } as never)
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId)
      .neq("status", "cancelled")
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message || "تعذّر إلغاء الفاتورة.");
    if (!row) throw new Error("الفاتورة غير موجودة أو ملغاة مسبقاً.");
    return row as { id: string; status: string };
  });

/** حذف مسودة فاتورة فقط — الفواتير المُصدرة تُلغى ولا تُحذف. */
export const deleteOfficeInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { error } = await context.supabase
      .from("office_invoices")
      .delete()
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId)
      .eq("status", "draft");
    if (error) throw new Error(error.message || "تعذّر حذف المسودة.");
    return { id: data.invoiceId };
  });

/** تسجيل دفعة (كاملة أو جزئية). القاعدة تمنع تجاوز قيمة الفاتورة وتحدّث الحالة تلقائياً. */
export const recordOfficePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        invoiceId: z.string().uuid(),
        amount: z.number().finite().gt(0, "المبلغ يجب أن يكون أكبر من صفر").max(99_999_999),
        method: z.enum(["cash", "bank_transfer", "card", "cheque", "other"]),
        paidAt: z.string().min(1, "تاريخ التحصيل مطلوب"),
        referenceNumber: z.string().trim().max(120).nullable().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");

    const { data: invoice, error: invError } = await context.supabase
      .from("office_invoices")
      .select("id, client_id, status")
      .eq("organization_id", data.organizationId)
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (invError || !invoice) throw new Error("الفاتورة غير موجودة.");

    const { data: created, error } = await context.supabase
      .from("office_payments")
      .insert({
        organization_id: data.organizationId,
        invoice_id: data.invoiceId,
        client_id: (invoice as { client_id: string }).client_id,
        amount: data.amount,
        method: data.method,
        paid_at: data.paidAt,
        reference_number: data.referenceNumber?.trim() ? data.referenceNumber.trim() : null,
        note: data.note ?? null,
        received_by: context.userId,
        created_by: context.userId,
      } as never)
      .select("id, amount")
      .single();
    if (error) {
      if (error.code === "23505" || /office_payments_reference_unique/.test(error.message)) {
        throw new Error("الرقم المرجعي مسجَّل مسبقاً على هذه الفاتورة.");
      }
      throw new Error(error.message || "تعذّر تسجيل الدفعة.");
    }
    return created as { id: string; amount: number };
  });

/** إبطال دفعة مع سبب إلزامي — لا حذف نهائي للدفعات. */
export const voidOfficePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        paymentId: z.string().uuid(),
        reason: z.string().trim().min(3, "سبب الإبطال مطلوب").max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { data: row, error } = await context.supabase
      .from("office_payments")
      .update({ voided_at: new Date().toISOString(), void_reason: data.reason } as never)
      .eq("id", data.paymentId)
      .eq("organization_id", data.organizationId)
      .is("voided_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message || "تعذّر إبطال الدفعة.");
    if (!row) throw new Error("الدفعة غير موجودة أو مُبطلة مسبقاً.");
    return row as { id: string };
  });
