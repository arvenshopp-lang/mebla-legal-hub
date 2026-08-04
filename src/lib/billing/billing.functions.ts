/**
 * طبقة دوال الخادم للمركز المالي.
 *
 * قواعد ثابتة في كل دالة:
 * - تحقق مصادقة (requireSupabaseAuth) + تحقق صلاحية billing.* فعلي على الخادم.
 * - تحقق صارم من المدخلات عبر مخططات zod قبل الوصول للمحرك.
 * - لا يُقبل أي مبلغ إجمالي محسوب في الواجهة — تُحسب الإجماليات في قاعدة البيانات.
 * - كل عملية تكتب سجل تدقيق يحمل معرّف الطلب ومعرّف الارتباط (داخل المحرك).
 * - رسائل الأخطاء عربية فقط ولا تكشف أي تفاصيل داخلية أو Stack Trace.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  approveReopenSchema,
  bankEntrySchema,
  closePeriodSchema,
  creditNoteSchema,
  decisionSchema,
  draftSchema,
  ignoreEntrySchema,
  invoiceFiltersSchema,
  issueSchema,
  listFiltersSchema,
  matchEntrySchema,
  noteSchema,
  paginationSchema,
  providerConfigSchema,
  providerEnabledSchema,
  providerCodeSchema,
  providerSecretsSchema,
  rangeSchema,
  reasonSchema,
  recordPaymentSchema,
  refundCreateSchema,
  refundDecisionSchema,
  reopenRequestSchema,
  sequencePreviewSchema,
  sequenceSchema,
  statementSchema,
  taxSettingsSchema,
  uuid,
  webhookActionSchema,
  webhookFiltersSchema,
} from "./billing.schemas";

/* ------------------------------------------------------------------ القراءة */

export const billingListInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invoiceFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listInvoices(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب الفواتير."));
    }
  });

export const billingInvoiceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      const [invoice, audit, tax] = await Promise.all([
        engine.getInvoiceDetail(ctx, data.id),
        engine.getInvoiceAudit(ctx, data.id),
        engine.getTaxSettings(),
      ]);
      return { invoice, audit, tax };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب تفاصيل الفاتورة."));
    }
  });

export const billingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.reports(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر احتساب مؤشرات المركز المالي."));
    }
  });

export const billingReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.view_reports");
    try {
      return await engine.reports(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إعداد التقارير المالية."));
    }
  });

export const billingListPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listPayments(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب المدفوعات."));
    }
  });

export const billingListAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listAttempts(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب محاولات الدفع."));
    }
  });

export const billingListRefunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listRefunds(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب الاستردادات."));
    }
  });

export const billingListCreditNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paginationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listCreditNotes(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب إشعارات الخصم."));
    }
  });

export const billingListReconciliations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.reconcile");
    try {
      return await engine.listReconciliations(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب حركات المطابقة البنكية."));
    }
  });

export const billingListPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listPeriods(ctx);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب الفترات المالية."));
    }
  });

export const billingListSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      const [sequences, tax, providers] = await Promise.all([
        engine.listSequences(ctx),
        engine.getTaxSettings(),
        engine.listProviders(ctx),
      ]);
      return { sequences, tax, providers };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب إعدادات المركز المالي."));
    }
  });

export const billingListWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => webhookFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await hooks.listWebhookEvents(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب رسائل مزودي الدفع."));
    }
  });

/* ------------------------------------------------------------------ الكتابة */

export const billingSaveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(
      context.supabase,
      context.userId,
      data.id ? "billing.update" : "billing.create",
    );
    try {
      const id = await engine.saveDraft(ctx, data);
      return { id, correlationId: ctx.correlationId };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر حفظ مسودة الفاتورة."));
    }
  });

export const billingIssueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => issueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.issue");
    try {
      return await engine.issueInvoice(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إصدار الفاتورة."));
    }
  });

export const billingCancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reasonSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.cancel");
    try {
      await engine.cancelInvoice(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إلغاء الفاتورة."));
    }
  });

export const billingRecordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recordPaymentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.record_payment");
    try {
      return await engine.recordPayment(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تسجيل الدفعة."));
    }
  });

export const billingDecidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.approve_payment");
    if (data.decision === "reject" && !data.reason) throw new Error("سبب الرفض مطلوب.");
    try {
      await engine.decidePayment(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تنفيذ قرار الدفعة."));
    }
  });

export const billingCreateRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refundCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.refund");
    try {
      const id = await engine.createRefund(ctx, data);
      return { id };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إنشاء طلب الاسترداد."));
    }
  });

export const billingDecideRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refundDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.refund");
    try {
      await engine.decideRefund(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تنفيذ قرار الاسترداد."));
    }
  });

export const billingCreateCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => creditNoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.refund");
    try {
      return await engine.createCreditNote(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إصدار إشعار الخصم."));
    }
  });

export const billingAddNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => noteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.update");
    try {
      await engine.addNote(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إضافة الملاحظة."));
    }
  });

export const billingAddBankEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bankEntrySchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.reconcile");
    try {
      const id = await engine.addBankEntry(ctx, data);
      return { id };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إضافة الحركة البنكية."));
    }
  });

export const billingMatchBankEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => matchEntrySchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.reconcile");
    try {
      await engine.matchBankEntry(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّرت مطابقة الحركة البنكية."));
    }
  });

export const billingIgnoreBankEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ignoreEntrySchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.reconcile");
    try {
      await engine.ignoreBankEntry(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تجاهل الحركة البنكية."));
    }
  });

export const billingClosePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => closePeriodSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.close_period");
    try {
      const id = await engine.closePeriod(ctx, data);
      return { id };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إقفال الفترة المالية."));
    }
  });

export const billingRequestReopen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reopenRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.close_period");
    try {
      const id = await engine.requestReopen(ctx, data);
      return { id };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تسجيل طلب إعادة الفتح."));
    }
  });

export const billingApproveReopen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => approveReopenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.reopen_period");
    try {
      await engine.approveReopen(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر اعتماد إعادة فتح الفترة."));
    }
  });

export const billingSaveProviderSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => providerSecretsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await engine.saveProviderSecrets(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر حفظ مفاتيح المزوّد."));
    }
  });

export const billingTestProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => providerCodeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      return await engine.testProvider(ctx, data);
    } catch (error) {
      return { ok: false, message: ctxMod.safeMessage(error, "تعذّر إجراء اختبار الاتصال.") };
    }
  });

export const billingSetProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => providerEnabledSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await engine.setProviderEnabled(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تحديث حالة المزوّد."));
    }
  });

export const billingUpdateSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sequenceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await engine.updateSequence(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تحديث إعدادات الترقيم."));
    }
  });

export const billingSaveTaxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => taxSettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await engine.saveTaxSettings(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر حفظ إعدادات الضريبة."));
    }
  });

export const billingSendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.issue");
    try {
      const sent = await engine.notifyBillingEvent(data.id, "invoice_issued", { reference: ctx.correlationId });
      return { sent };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إرسال الفاتورة بالبريد."));
    }
  });

export const billingRetryWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      return await hooks.processRetryQueue(20);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إعادة معالجة رسائل المزوّد."));
    }
  });

export const billingRunReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    await ctxMod.billingCtx(context.supabase, context.userId, "billing.issue");
    try {
      return await engine.runDueReminders();
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إرسال تذكيرات الاستحقاق."));
    }
  });

/* --------------------------------------- المزوّدون والترقيم والرسائل الواردة */

export const billingProviderStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.listProviderStats(ctx);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب مؤشرات مزودي الدفع."));
    }
  });

export const billingUpdateProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => providerConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await engine.updateProviderConfig(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر تحديث إعدادات المزوّد."));
    }
  });

export const billingPreviewSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sequencePreviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [engine, ctxMod] = await Promise.all([import("./billing.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await engine.previewSequence(ctx, data);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر معاينة الرقم القادم."));
    }
  });

export const billingWebhookDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.read");
    try {
      return await hooks.getWebhookDetail(ctx, data.id);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر جلب تفاصيل الرسالة."));
    }
  });

export const billingRetryWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      return await hooks.retryWebhookEvent(ctx, data.id);
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّرت إعادة معالجة الرسالة."));
    }
  });

export const billingDeadLetterWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => webhookActionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await hooks.markWebhookDeadLetter(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر ترحيل الرسالة."));
    }
  });

export const billingReopenWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => webhookActionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const [hooks, ctxMod] = await Promise.all([import("./webhooks.server"), import("./ctx.server")]);
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.manage_providers");
    try {
      await hooks.reopenWebhookEvent(ctx, data);
      return { ok: true };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر إعادة فتح الرسالة."));
    }
  });

/* ------------------------------------------------------- مستندات PDF الموحدة */

/**
 * جميع مخرجات PDF تمر من محرك واحد (pdf/engine.server) بنماذج موحّدة،
 * وتُعاد بصيغة base64 لأن حدود دوال الخادم تنقل JSON فقط.
 */
async function pdfDeps() {
  const [engine, ctxMod, pdfEngine, models] = await Promise.all([
    import("./billing.server"),
    import("./ctx.server"),
    import("./pdf/engine.server"),
    import("./pdf/models.server"),
  ]);
  return { engine, ctxMod, pdfEngine, models };
}

export const billingInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const { engine, ctxMod, pdfEngine, models } = await pdfDeps();
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.export");
    try {
      const [invoice, tax] = await Promise.all([engine.getInvoiceDetail(ctx, data.id), engine.getTaxSettings()]);
      const model = invoice.status === "draft" ? models.quoteModel(invoice) : models.invoiceModel(invoice);
      const bytes = await pdfEngine.renderBillingPdf(model, tax);
      return { fileName: model.fileName, base64: pdfEngine.toBase64(bytes) };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر توليد ملف الفاتورة."));
    }
  });

/** عرض سعر من مسودة الفاتورة — بلا مطالبة سداد ولا أثر ضريبي. */
export const billingQuotePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ id: uuid.parse((data as { id: string }).id) }))
  .handler(async ({ data, context }) => {
    const { engine, ctxMod, pdfEngine, models } = await pdfDeps();
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.export");
    try {
      const [invoice, tax] = await Promise.all([engine.getInvoiceDetail(ctx, data.id), engine.getTaxSettings()]);
      const model = models.quoteModel(invoice);
      const bytes = await pdfEngine.renderBillingPdf(model, tax);
      return { fileName: model.fileName, base64: pdfEngine.toBase64(bytes) };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر توليد عرض السعر."));
    }
  });

/** إيصال سداد لدفعة معتمدة. */
export const billingReceiptPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ paymentId: uuid.parse((data as { paymentId: string }).paymentId) }))
  .handler(async ({ data, context }) => {
    const { engine, ctxMod, pdfEngine, models } = await pdfDeps();
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.export");
    try {
      const [source, tax] = await Promise.all([
        engine.getPaymentReceipt(ctx, data.paymentId),
        engine.getTaxSettings(),
      ]);
      const model = models.receiptModel(source);
      const bytes = await pdfEngine.renderBillingPdf(model, tax);
      return { fileName: model.fileName, base64: pdfEngine.toBase64(bytes) };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر توليد الإيصال."));
    }
  });

/** كشف حساب مكتب خلال فترة. */
export const billingStatementPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { engine, ctxMod, pdfEngine, models } = await pdfDeps();
    const ctx = await ctxMod.billingCtx(context.supabase, context.userId, "billing.export");
    try {
      const [source, tax] = await Promise.all([engine.getAccountStatement(ctx, data), engine.getTaxSettings()]);
      const model = models.statementModel(source);
      const bytes = await pdfEngine.renderBillingPdf(model, tax);
      return { fileName: model.fileName, base64: pdfEngine.toBase64(bytes) };
    } catch (error) {
      throw new Error(ctxMod.safeMessage(error, "تعذّر توليد كشف الحساب."));
    }
  });
