import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Maps database guard/quota signals to accurate Arabic messages for the user. */
function describeRequestError(message: string | undefined): string {
  const raw = message ?? "";
  if (raw.includes("FEATURE_UNAVAILABLE:client_upload")) {
    return "رفع مستندات العملاء غير متاح في باقتك الحالية. فعّل باقة أعلى لإنشاء روابط الرفع.";
  }
  if (raw.includes("SUBSCRIPTION_SUSPENDED")) {
    return "اشتراك المكتب موقوف حالياً، تعذّر إنشاء الرابط.";
  }
  if (raw.includes("EXPIRY_MUST_BE_FUTURE")) {
    return "تاريخ انتهاء الرابط يجب أن يكون في المستقبل.";
  }
  if (raw.includes("row-level security") || raw.includes("permission denied")) {
    return "لا تملك صلاحية إنشاء روابط رفع لهذه القضية.";
  }
  return "تعذّر إنشاء الرابط، حاول مرة أخرى.";
}

const createSchema = z.object({
  caseId: z.string().uuid(),
  title: z.string().trim().min(2).max(150),
  message: z.string().trim().max(1000).optional().nullable(),
  items: z.array(z.string().trim().min(1).max(150)).max(20).default([]),
  expiresAt: z.string().datetime().optional().nullable(),
});

/** Creates a single-use upload link. The raw token is returned exactly once. */
export const createDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: kase, error: caseErr } = await supabase
      .from("cases")
      .select("id, organization_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseErr || !kase) throw new Error("القضية غير موجودة أو لا تملك صلاحية الوصول إليها.");

    // ترابط صريح: لا يُكتب أي طلب قبل إثبات أن القضية تنتمي لنفس المكتب.
    const { assertCaseBelongsToOrganization } = await import("./document-requests.server");
    await assertCaseBelongsToOrganization(supabase, kase.id, kase.organization_id);

    // بوابة استحقاق خادمية: رفع مستندات العملاء ميزة مرتبطة بالباقة ولا يجوز الاعتماد على الواجهة.
    const { assertEntitlement } = await import("./subscription.server");
    await assertEntitlement(supabase, kase.organization_id, {
      feature: "client_upload_enabled",
      requireLive: true,
    });

    const { generateToken, hashText } = await import("./client-portal.server");
    const token = generateToken();
    const tokenHash = await hashText(token);

    const { data: inserted, error } = await supabase
      .from("document_requests")
      .insert({
        organization_id: kase.organization_id,
        case_id: kase.id,
        title: data.title,
        message: data.message || null,
        requested_items: data.items,
        token_hash: tokenHash,
        expires_at: data.expiresAt || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(describeRequestError(error.message));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("document_request_events").insert({
      organization_id: kase.organization_id,
      request_id: inserted.id,
      event: "created",
      actor_id: userId,
      detail: {
        title: data.title,
        items: data.items.length,
      },
    });

    return { id: inserted.id, token };
  });

export const revokeDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("document_requests")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .eq("status", "active")
      .select("id, organization_id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إلغاء الرابط.");
    if (!row) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("document_request_events").insert({
      organization_id: row.organization_id,
      request_id: row.id,
      event: "revoked",
      actor_id: userId,
    });
    return { ok: true };
  });
