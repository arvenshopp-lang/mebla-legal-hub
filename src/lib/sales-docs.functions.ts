/**
 * دوال خادم وحدة «العروض والمقترحات والعقود».
 * كل دالة تتحقق من صلاحية sales_docs.* قبل أي عملية، والمحرك (sales-docs.server)
 * يتولى الحسابات وانتقالات الحالة وسجل الأحداث والتدقيق.
 * ملف رقيق: لا منطق هنا — استيرادات وتحقق مدخلات ودوال خادم فقط.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  approveSchema,
  convertInvoiceSchema,
  convertSubscriptionSchema,
  decisionSchema,
  deleteSchema,
  draftSchema,
  idSchema,
  lifecycleSchema,
  listFiltersSchema,
  requestApprovalSchema,
  sendSchema,
  signSchema,
  templateSchema,
} from "@/lib/sales-docs.schemas";

export const salesList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.read");
    return engine.listDocuments(data);
  });

export const salesDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.read");
    const [detail, content] = await Promise.all([engine.getDocumentDetail(data.id), engine.getDocumentContent(data.id)]);
    // حدود دوال الخادم تنقل JSON فقط، لذا تُطبَّع بيانات الأحداث الحرة قبل الإرجاع.
    const events = detail.events.map((event) => ({
      ...event,
      metadata: JSON.parse(JSON.stringify(event.metadata ?? {})) as Record<string, string | number | boolean | null>,
    }));
    return { ...detail, events, content };
  });

export const salesOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.read");
    return engine.pickerOptions();
  });

export const salesSaveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, data.id ? "sales_docs.update" : "sales_docs.create");
    const id = await engine.saveDraft(
      { staff },
      {
        ...data,
        items: data.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: item.discountAmount,
        })),
      },
    );
    return { id };
  });

export const salesDeleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.delete");
    await engine.deleteDraft({ staff }, data.id);
    return { ok: true };
  });

export const salesRequestApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestApprovalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.update");
    await engine.requestApproval({ staff }, data.id, data.note ?? null);
    return { ok: true };
  });

export const salesDecideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.approve");
    await engine.decideApproval({ staff }, data.id, data.approve, data.note ?? null);
    return { ok: true };
  });

export const salesSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.send");
    return engine.sendDocument({ staff }, data.id, data.toEmail, data.message ?? null);
  });

export const salesRecordDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.decide");
    await engine.recordDecision({ staff }, data.id, data.decision, data.note ?? null);
    if (data.decision === "accepted" && data.signerName && data.signerEmail) {
      await engine.signDocument({ staff }, data.id, data.signerName, data.signerEmail, null);
    }
    return { ok: true };
  });

export const salesSign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.decide");
    await engine.signDocument({ staff }, data.id, data.signerName, data.signerEmail, data.signerRole ?? null);
    return { ok: true };
  });

export const salesActivate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lifecycleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.decide");
    await engine.activateContract({ staff }, data.id);
    return { ok: true };
  });

export const salesTerminate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lifecycleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.decide");
    await engine.terminateContract({ staff }, data.id, data.note ?? null);
    return { ok: true };
  });

export const salesConvertToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => convertInvoiceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.convert");
    return engine.convertToInvoice({ staff }, data.id, data.dueAt ?? null);
  });

export const salesConvertToSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => convertSubscriptionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.convert");
    return engine.convertToSubscription({ staff }, data.id, data.planCode, data.startsOn ?? null, data.endsOn ?? null);
  });

export const salesListTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.read");
    return { templates: await engine.listTemplates() };
  });

export const salesSaveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.manage_templates");
    const id = await engine.saveTemplate(
      { staff },
      {
        ...data,
        items: data.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: item.discountAmount,
        })),
      },
    );
    return { id };
  });

export const salesDeleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine] = await Promise.all([import("@/lib/admin-guard.server"), import("@/lib/sales-docs.server")]);
    const staff = await g.requireStaff(context.supabase, context.userId, "sales_docs.manage_templates");
    await engine.deleteTemplate({ staff }, data.id);
    return { ok: true };
  });

/** ملف PDF عربي للمستند — يُعاد بصيغة base64 لأن حدود دوال الخادم تنقل JSON فقط. */
export const salesDocumentPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [g, engine, billing, pdfEngine, model] = await Promise.all([
      import("@/lib/admin-guard.server"),
      import("@/lib/sales-docs.server"),
      import("@/lib/billing/billing.server"),
      import("@/lib/billing/pdf/engine.server"),
      import("@/lib/sales-docs.pdf.server"),
    ]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.read");
    const [detail, content, tax] = await Promise.all([
      engine.getDocumentDetail(data.id),
      engine.getDocumentContent(data.id),
      billing.getTaxSettings(),
    ]);
    const document = model.salesDocModel(
      detail,
      { companyName: content.companyName, contactName: content.contactName, contactEmail: content.contactEmail },
      { intro: content.intro, terms: content.terms },
    );
    const bytes = await pdfEngine.renderBillingPdf(document, tax);
    return { fileName: document.fileName, base64: pdfEngine.toBase64(bytes) };
  });

export const salesExportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const [g, engine, csv, shared] = await Promise.all([
      import("@/lib/admin-guard.server"),
      import("@/lib/sales-docs.server"),
      import("@/lib/csv"),
      import("@/lib/sales-docs.shared"),
    ]);
    await g.requireStaff(context.supabase, context.userId, "sales_docs.export");
    const { rows } = await engine.listDocuments({ ...data, page: 1, pageSize: 100 });
    const content = csv.buildCsv(
      ["الرقم", "النوع", "العنوان", "الحالة", "العميل", "الإجمالي", "العملة", "تاريخ الإنشاء"],
      rows.map((row) => [
        row.number ?? "",
        shared.KIND_LABELS[row.kind],
        row.title,
        shared.STATUS_LABELS[row.status],
        row.organization_name ?? "",
        row.total,
        row.currency,
        row.created_at,
      ]),
    );
    return { fileName: `sales-documents-${new Date().toISOString().slice(0, 10)}.csv`, content };
  });
