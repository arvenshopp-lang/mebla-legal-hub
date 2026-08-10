import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  organizationId: z.string().uuid(),
  itemType: z.enum(["task", "deadline"]),
  itemId: z.string().uuid(),
});

const pageInput = input.extend({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z
    .object({ occurredAt: z.string(), seq: z.number().int().nonnegative() })
    .nullish(),
});

const captureInput = input.extend({ since: z.string().datetime() });

const exportInput = input.extend({ format: z.enum(["csv", "pdf"]) });

/** سجل أحداث مهمة/مهلة واحدة — متاح لكل عضو يقرأ العمل نفسه (محامي، مساعد، مدير). */
export const getWorkItemTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getWorkItemTimeline } = await import("./timeline.server");
    return getWorkItemTimeline(context.supabase, data.organizationId, data.itemType, data.itemId, {
      limit: data.limit,
      cursor: data.cursor ?? null,
    });
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

/**
 * تصدير سجل الأحداث كـ CSV أو محتوى PDF — للأدوار المصرّح لها فقط،
 * والتحقق يجري كاملاً على الخادم.
 */
export const exportWorkItemTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => exportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { exportWorkItemTimeline } = await import("./timeline.server");
    return exportWorkItemTimeline(
      context.supabase,
      context.userId,
      data.organizationId,
      data.itemType,
      data.itemId,
      data.format,
    );
  });
