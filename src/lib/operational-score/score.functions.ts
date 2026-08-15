import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ organizationId: z.string().uuid() });

/**
 * مؤشر الإنجاز التشغيلي للمكتب الحالي (خاص بالمكتب فقط).
 * لا يعرض أي مقارنة أو ترتيب أو بيانات مكاتب أخرى.
 */
export const getMyOperationalScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { computeOrganizationScore, requireActiveMembership } = await import("./score.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireActiveMembership(context.supabase, data.organizationId, context.userId);
    return computeOrganizationScore(context.supabase, supabaseAdmin, data.organizationId);
  });