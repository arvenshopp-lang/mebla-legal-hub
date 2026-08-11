import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * تحقق خادمي صريح: القضية موجودة وتنتمي لنفس المكتب.
 * لا نعتمد على RLS وحدها لأن سياسات الكتابة تتحقق من العضوية فقط،
 * ولا تفرض أن case_id ينتمي إلى organization_id.
 */
export async function assertCaseBelongsToOrganization(
  supabase: SupabaseClient<Database>,
  caseId: string,
  organizationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("cases")
    .select("id, organization_id")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !data || data.organization_id !== organizationId) {
    throw new Error("القضية غير موجودة أو لا تنتمي إلى هذا المكتب.");
  }
}
