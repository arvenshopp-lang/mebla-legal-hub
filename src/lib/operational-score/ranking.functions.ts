import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgInput = z.object({ organizationId: z.string().uuid() });
const optInInput = orgInput.extend({ optIn: z.boolean() });
const exclusionInput = orgInput.extend({
  excluded: z.boolean(),
  reason: z.string().trim().min(3).max(300).optional(),
});
const listInput = z.object({ limit: z.number().int().min(1).max(200).optional() });

/** إعداد الظهور العام للمكتب — قراءة لأعضاء المكتب النشطين. */
export const getMyRankingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getRankingSettings } = await import("./ranking.server");
    const { requireActiveMembership } = await import("./score.server");
    await requireActiveMembership(context.supabase, data.organizationId, context.userId);
    return getRankingSettings(context.supabase, data.organizationId);
  });

/** موافقة/سحب موافقة الظهور العام — مدير المكتب فقط، مع سجل تدقيق. */
export const setOperationalRankingOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => optInInput.parse(d))
  .handler(async ({ data, context }) => {
    const { setRankingOptIn } = await import("./ranking.server");
    return setRankingOptIn(context.supabase, data.organizationId, context.userId, data.optIn);
  });

/** حالة دعوة الظهور العام للمكتب الحالي — مخوّلون فقط، وبيانات المكتب نفسه فقط. */
export const getOperationalRankingPromptState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { evaluateOptInPrompt } = await import("./ranking.server");
    const { requireActiveMembership } = await import("./score.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireActiveMembership(context.supabase, data.organizationId, context.userId);
    return evaluateOptInPrompt(
      context.supabase,
      supabaseAdmin,
      data.organizationId,
      context.userId,
    );
  });

/** قبول الدعوة — يعيد التحقق من الصلاحية والأهلية خادمياً قبل التفعيل. */
export const acceptOperationalRankingPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { acceptOptInFromPrompt } = await import("./ranking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return acceptOptInFromPrompt(
      context.supabase,
      supabaseAdmin,
      data.organizationId,
      context.userId,
    );
  });

/** «ليس الآن» / الإغلاق: تأجيل خادمي 30 يوماً بلا أي تغيير في الموافقة. */
export const snoozeOperationalRankingPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { snoozeOptInPrompt } = await import("./ranking.server");
    return snoozeOptInPrompt(context.supabase, data.organizationId, context.userId);
  });

/** حالة الترتيب لموظفي المنصة. */
export const adminListRankingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { requireStaff } = await import("@/lib/admin-guard.server");
    const { listRankingStatus } = await import("./ranking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireStaff(context.supabase, context.userId, "organizations.read");
    return listRankingStatus(supabaseAdmin, data.limit ?? 100);
  });

/** استثناء مكتب من الترتيب العام أو إعادته — منصة فقط، مع سجل تدقيق إداري. */
export const adminSetRankingExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => exclusionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireStaff, writeAudit } = await import("@/lib/admin-guard.server");
    const { setPlatformExclusion, getRankingSettings } = await import("./ranking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const staff = await requireStaff(context.supabase, context.userId, "organizations.update");
    if (data.excluded && !data.reason) {
      throw new Error("سبب الاستثناء مطلوب.");
    }
    const before = await getRankingSettings(supabaseAdmin, data.organizationId);
    await setPlatformExclusion(
      supabaseAdmin,
      data.organizationId,
      data.excluded,
      data.reason ?? null,
      context.userId,
    );
    const after = await getRankingSettings(supabaseAdmin, data.organizationId);
    await writeAudit(supabaseAdmin, staff, {
      action: data.excluded ? "ranking.platform_exclude" : "ranking.platform_restore",
      entity_type: "organization_ranking_settings",
      entity_id: data.organizationId,
      description: data.excluded
        ? "استثناء مكتب من قائمة الأكثر إنجازاً"
        : "إعادة مكتب إلى قائمة الأكثر إنجازاً",
      metadata: { reason: data.reason ?? null },
      before,
      after,
    });
    return after;
  });

/**
 * الترتيب العام (Top 5) — دالة عامة بلا أي وسائط: لا `organizationId` ولا `limit`
 * ولا `offset` ولا وضع خام، فلا يوجد سطح تعداد أو استخراج للبيانات.
 */
export const getPublicOperationalRanking = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicRanking } = await import("./ranking.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getPublicRanking(supabaseAdmin);
});
