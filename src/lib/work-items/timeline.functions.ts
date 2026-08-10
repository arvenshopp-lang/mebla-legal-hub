import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  organizationId: z.string().uuid(),
  itemType: z.enum(["task", "deadline"]),
  itemId: z.string().uuid(),
});

const captureInput = input.extend({ since: z.string().datetime() });

/** سجل أحداث مهمة/مهلة واحدة — متاح لكل عضو يقرأ العمل نفسه (محامي، مساعد، مدير). */
export const getWorkItemTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkItemTimeline } = await import("./timeline.server");
    return getWorkItemTimeline(context.supabase, data.organizationId, data.itemType, data.itemId);
  });

/**
 * هل تعذّر تسجيل حدث لهذا العمل بعد لحظة الحفظ؟ يُعيد مرجع التتبع فقط
 * ليُعرض للمستخدم كتنبيه غير معيق بعد نجاح الحفظ.
 */
export const getWorkItemCaptureIssueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => captureInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkItemCaptureIssue } = await import("./timeline.server");
    return getWorkItemCaptureIssue(
      context.supabase,
      data.organizationId,
      data.itemType,
      data.itemId,
      data.since,
    );
  });
