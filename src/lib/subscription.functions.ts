import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlanFeatureKey, SubscriptionOverview } from "./subscription.shared";

const orgSchema = z.object({ organizationId: z.string().uuid() });

const FEATURE_KEYS = [
  "ai_enabled",
  "esignature_enabled",
  "voice_enabled",
  "api_enabled",
  "pdf_search_enabled",
  "client_upload_enabled",
] as const;

/** Authoritative subscription snapshot: plan, state, usage, history, invoices. */
export const getSubscriptionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data, context }): Promise<SubscriptionOverview> => {
    const { loadOverview } = await import("./subscription.server");
    return loadOverview(context.supabase, data.organizationId);
  });

/** Server-side feature check used before any gated action or route render. */
export const checkFeatureAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgSchema.extend({ feature: z.enum(FEATURE_KEYS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { loadOverview } = await import("./subscription.server");
    const { hasFeature } = await import("./subscription.shared");
    const overview = await loadOverview(context.supabase, data.organizationId);
    return {
      allowed: hasFeature(overview, data.feature as PlanFeatureKey),
      state: overview.state,
      planName: overview.plan.name_ar,
    };
  });

/** Records metered usage (OCR pages). The database rejects over-quota calls. */
export const recordOcrUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgSchema.extend({ pages: z.number().int().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertEntitlement } = await import("./subscription.server");
    const { translateSubscriptionError } = await import("./subscription.shared");
    await assertEntitlement(context.supabase, data.organizationId, { requireLive: true });

    const { data: used, error } = await context.supabase.rpc("record_metered_usage", {
      _organization_id: data.organizationId,
      _metric: "ocr_pages",
      _amount: data.pages,
    });
    if (error) {
      throw new Error(translateSubscriptionError(error.message) ?? "تعذّر تسجيل الاستخدام.");
    }
    return { used: Number(used ?? 0) };
  });
/**
 * رابط فاتورة قصير الصلاحية. القراءة من المستودع تحدث على الخادم فقط بعد
 * التحقق من عضوية المكتب وارتباط الفاتورة به.
 */
export const signInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), invoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id, pdf_path")
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !invoice?.pdf_path) throw new Error("الفاتورة غير متوفرة للتنزيل.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(invoice.pdf_path, 60);
    if (signError || !signed) throw new Error("تعذّر تجهيز رابط الفاتورة.");
    return { url: signed.signedUrl };
  });
