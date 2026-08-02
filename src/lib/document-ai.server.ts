import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { canDo, permissionDeniedMessage, type DocumentPermission } from "./doc-permissions";

type Client = SupabaseClient<Database>;

/**
 * Resolves the caller's active role inside one office and enforces the
 * feature permission server-side. Membership itself is re-checked through RLS.
 */
export async function requireDocumentPermission(
  supabase: Client,
  userId: string,
  organizationId: string,
  permission: DocumentPermission,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) throw new Error("لا تملك وصولاً إلى هذا المكتب.");
  if (!canDo(data.role, permission)) throw new Error(permissionDeniedMessage(permission));
  return data.role;
}

/** يستهلك حصة صفحات OCR ويمنع التجاوز برسالة واضحة. */
export async function consumeOcrQuota(supabase: Client, organizationId: string, pages: number) {
  const { data, error } = await supabase.rpc("consume_ocr_pages", {
    _organization_id: organizationId,
    _pages: pages,
  });
  if (error) throw new Error("تعذّر التحقق من حصة القراءة الضوئية في باقتك.");
  const row = (data as { allowed: boolean; used: number; monthly_limit: number | null }[] | null)?.[0];
  if (!row?.allowed) {
    const limit = row?.monthly_limit ?? 0;
    throw new Error(
      limit === 0
        ? "القراءة الضوئية غير مشمولة في باقتك الحالية. ارفع الباقة لتشغيلها."
        : `استهلكت باقتك كامل صفحات القراءة الضوئية لهذا الشهر (${limit} صفحة). ارفع الباقة أو انتظر بداية الشهر القادم.`,
    );
  }
  return row;
}
