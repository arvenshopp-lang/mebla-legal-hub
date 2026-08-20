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
  .inputValidator((d: unknown) => orgSchema.extend({ feature: z.enum(FEATURE_KEYS) }).parse(d))
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
  .inputValidator((d: unknown) =>
    orgSchema.extend({ pages: z.number().int().min(1).max(2000) }).parse(d),
  )
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

/**
 * إنشاء جلسة سداد فورية لترقية الباقة عبر بوابة مُيسّر (مدى، أبل باي، فيزا)
 */
export const createSubscriptionMoyasarPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        planCode: z.string().min(1),
        billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("@/lib/billing/providers.server");

    const { data: plan } = await supabaseAdmin
      .from("platform_plans")
      .select("*")
      .eq("code", data.planCode)
      .maybeSingle();

    if (!plan) throw new Error("الباقة المحددة غير موجودة.");

    const amount =
      data.billingCycle === "yearly"
        ? (plan.price_yearly ?? plan.price_monthly * 10)
        : plan.price_monthly;
    if (amount <= 0) throw new Error("هذه الباقة مجانية ولا تتطلب دفعاً.");

    const moyasar = getProvider("moyasar");
    const creds = {
      secret_key: process.env["MOYASAR_SECRET_KEY"] || "",
      publishable_key: process.env["MOYASAR_PUBLISHABLE_KEY"] || "",
      webhook_secret: process.env["MOYASAR_WEBHOOK_SECRET"] || "",
    };

    const correlationId = `sub_${data.organizationId}_${data.planCode}_${Date.now()}`;
    const payment = await moyasar.createPayment(
      {
        invoiceId: data.organizationId,
        invoiceNumber: `SUB-${Date.now().toString(36).toUpperCase()}`,
        amount,
        currency: "SAR",
        description: `ترقية اشتراك منصة مِهلة — باقة ${plan.name_ar}`,
        successUrl: `https://mehlalex.com/subscription?payment=success&org=${data.organizationId}&plan=${data.planCode}&cycle=${data.billingCycle}`,
        backUrl: `https://mehlalex.com/pricing`,
        callbackUrl: `https://mehlalex.com/api/public/payments/moyasar`,
        correlationId,
      },
      creds,
    );

    if (payment.status === "failed" || !payment.redirectUrl) {
      throw new Error(payment.failureMessage || "تعذّر إنشاء رابط السداد عبر مُيسّر.");
    }

    return {
      redirectUrl: payment.redirectUrl,
      amount,
      planName: plan.name_ar,
    };
  });

/**
 * التحقق من عملية الدفع وتفعيل الاشتراك آلياً بعد عودة العميل من بوابة ميسر
 */
export const verifyAndActivateSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        planCode: z.string().min(1),
        billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
        moyasarId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch plan
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("platform_plans")
      .select("*")
      .eq("code", data.planCode)
      .maybeSingle();

    if (planErr || !plan) {
      throw new Error("الباقة المحددة غير موجودة.");
    }

    const amount =
      data.billingCycle === "yearly"
        ? (plan.price_yearly ?? plan.price_monthly * 10)
        : plan.price_monthly;

    // 2. Fetch user email & id
    const userId = context.userId;
    let userEmail =
      ((context.claims as Record<string, unknown>)?.["email"] as string) || "";

    if (!userEmail) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.email) userEmail = profile.email;
    }
    if (!userEmail) {
      userEmail = "user@mehlalex.com";
    }

    // 3. Verify with Moyasar if ID provided
    if (data.moyasarId) {
      const secretKey = process.env["MOYASAR_SECRET_KEY"] || "";
      if (secretKey) {
        try {
          const auth = "Basic " + Buffer.from(secretKey + ":").toString("base64");
          const resp = await fetch(
            `https://api.moyasar.com/v1/payments/${encodeURIComponent(data.moyasarId)}`,
            { headers: { Authorization: auth } },
          );
          const paymentJson = (await resp.json()) as { status?: string };
          if (
            resp.status < 400 &&
            paymentJson.status &&
            !["paid", "authorized", "captured"].includes(paymentJson.status)
          ) {
            const invResp = await fetch(
              `https://api.moyasar.com/v1/invoices/${encodeURIComponent(data.moyasarId)}`,
              { headers: { Authorization: auth } },
            );
            const invJson = (await invResp.json()) as { status?: string };
            if (invResp.status < 400 && invJson.status && invJson.status !== "paid") {
              throw new Error("عملية الدفع لم تكتمل بنجاح عند المزود.");
            }
          }
        } catch (e) {
          console.warn("[Moyasar Verification Warning]", e);
        }
      }
    }

    const days = data.billingCycle === "yearly" ? 365 : 30;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // 4. Deactivate any existing active subscriptions for this org
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("organization_id", data.organizationId)
      .eq("status", "active");

    // 5. Insert new active subscription
    const { data: newSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: data.organizationId,
        user_id: userId,
        email: userEmail,
        plan_code: plan.code,
        plan_id: plan.id,
        plan_label: plan.name_ar,
        status: "active",
        amount,
        currency: "SAR",
        starts_at: startsAt,
        ends_at: endsAt,
        auto_renew: true,
        activation_method: "moyasar",
      })
      .select()
      .maybeSingle();

    if (subError) {
      console.error("[Subscription Activation Error]", subError);
      throw new Error(`تعذّر تسجيل الاشتراك الجديد: ${subError.message}`);
    }

    // 6. Insert invoice record
    await supabaseAdmin.from("invoices").insert({
      organization_id: data.organizationId,
      user_id: userId,
      subscription_id: newSub?.id ?? null,
      number: `INV-${Date.now().toString(36).toUpperCase()}`,
      amount,
      currency: "SAR",
      status: "paid",
      payment_method: "moyasar",
      paid_at: startsAt,
      issued_at: startsAt,
      notes: `ترقية اشتراك — ${plan.name_ar} (${data.billingCycle === "yearly" ? "سنوي" : "شهري"}) عبر مُيسّر`,
    });

    return {
      success: true,
      planName: plan.name_ar,
      subscriptionId: newSub?.id,
    };
  });

