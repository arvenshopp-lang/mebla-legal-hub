/**
 * دوال الخادم لإصدار مستندات فوترة المكتب PDF وإدارة هويتها.
 * كل دالة تتحقق من العضوية والصلاحية المالية قبل أي قراءة أو كتابة.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgId = z.string().uuid();

const brandingText = z.object({
  organizationId: orgId,
  footerNote: z.string().trim().max(600).nullable().optional(),
  signatoryName: z.string().trim().max(120).nullable().optional(),
  signatoryTitle: z.string().trim().max(120).nullable().optional(),
  bankDetails: z.string().trim().max(600).nullable().optional(),
  showSignature: z.boolean(),
});

/** فاتورة PDF بهوية المكتب. */
export const invoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, getInvoiceDetail } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "view");
    const detail = await getInvoiceDetail(context.supabase, data.organizationId, data.invoiceId);
    const { renderInvoicePdf } = await import("./pdf.server");
    return renderInvoicePdf(context.supabase, data.organizationId, detail);
  });

/** إيصال استلام دفعة PDF. */
export const paymentReceiptPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: orgId,
        invoiceId: z.string().uuid(),
        paymentId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, getInvoiceDetail } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "view");
    const detail = await getInvoiceDetail(context.supabase, data.organizationId, data.invoiceId);
    const { renderReceiptPdf } = await import("./pdf.server");
    return renderReceiptPdf(context.supabase, data.organizationId, detail, data.paymentId);
  });

/** كشف حساب عميل PDF. */
export const clientStatementPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess, clientStatement } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "view");
    const statement = await clientStatement(context.supabase, data.organizationId, data.clientId);
    const { renderStatementPdf } = await import("./pdf.server");
    return renderStatementPdf(context.supabase, data.organizationId, statement);
  });

/** قراءة هوية الفواتير (متاحة لمن يملك الاطلاع المالي). */
export const getInvoiceBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: orgId }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    const access = await requireBillingAccess(
      context.supabase,
      data.organizationId,
      context.userId,
      "view",
    );
    const { readInvoiceBranding, loadInvoiceLogoBytes } = await import("./branding.server");
    const branding = await readInvoiceBranding(context.supabase, data.organizationId);
    const logo = await loadInvoiceLogoBytes(branding, data.organizationId);
    const { toBase64 } = await import("@/lib/billing/pdf/engine.server");
    return {
      ...branding,
      canManage: access.canManage,
      logoPreview: logo ? `data:${logo.mime};base64,${toBase64(logo.bytes)}` : null,
    };
  });

/** حفظ الحقول النصية لهوية الفواتير. */
export const saveInvoiceBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandingText.parse(d))
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { saveInvoiceBrandingText } = await import("./branding.server");
    return saveInvoiceBrandingText(context.supabase, data.organizationId, data);
  });

/** رفع شعار الفواتير (base64 من المتصفح؛ يُتحقق من الحجم والبصمة على الخادم). */
export const uploadInvoiceBrandingLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: orgId, base64: z.string().min(16).max(4_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const { uploadInvoiceLogo, loadInvoiceLogoBytes } = await import("./branding.server");
    const branding = await uploadInvoiceLogo(context.supabase, data.organizationId, bytes);
    const logo = await loadInvoiceLogoBytes(branding, data.organizationId);
    const { toBase64 } = await import("@/lib/billing/pdf/engine.server");
    return {
      ...branding,
      logoPreview: logo ? `data:${logo.mime};base64,${toBase64(logo.bytes)}` : null,
    };
  });

/** حذف شعار الفواتير. */
export const deleteInvoiceBrandingLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: orgId }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireBillingAccess } = await import("./billing.server");
    await requireBillingAccess(context.supabase, data.organizationId, context.userId, "manage");
    const { removeInvoiceLogo } = await import("./branding.server");
    const branding = await removeInvoiceLogo(context.supabase, data.organizationId);
    return { ...branding, logoPreview: null as string | null };
  });
