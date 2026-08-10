import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  organizationId: z.string().uuid(),
  itemType: z.enum(["task", "deadline"]),
  itemId: z.string().uuid(),
});

/** سجل أحداث مهمة/مهلة واحدة — متاح لكل عضو يقرأ العمل نفسه (محامي، مساعد، مدير). */
export const getWorkItemTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkItemTimeline } = await import("./timeline.server");
    return getWorkItemTimeline(
      context.supabase,
      data.organizationId,
      data.itemType,
      data.itemId,
    );
  });