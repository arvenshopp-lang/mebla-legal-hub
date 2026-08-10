import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const periodInput = z.object({
  organizationId: z.string().uuid(),
  preset: z.enum([
    "this_month",
    "last_month",
    "last_3_months",
    "last_6_months",
    "this_year",
    "custom",
  ]),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

const memberInput = periodInput.extend({ memberId: z.string().uuid() });

const drilldownInput = memberInput.extend({
  kind: z.enum([
    "overdue_tasks",
    "overdue_deadlines",
    "completed_late",
    "open_tasks",
    "upcoming_deadlines",
    "active_cases",
  ]),
  page: z.number().int().min(0).max(500).default(0),
});

/** لوحة أداء الفريق: الحساب كامل على الخادم بعد التحقق من دور مالك/مدير المكتب. */
export const getTeamPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireTeamPerformanceAccess, computeTeamPerformance } = await import("./kpi.server");
    await requireTeamPerformanceAccess(context.supabase, data.organizationId, context.userId);
    return computeTeamPerformance(context.supabase, data.organizationId, {
      preset: data.preset,
      from: data.from ?? null,
      to: data.to ?? null,
    });
  });

/** تفصيل درجة عضو واحد: كل بُعد بأرقامه والأعمال التي بُني عليها. */
export const getMemberPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => memberInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireTeamPerformanceAccess, computeMemberDetail } = await import("./kpi.server");
    await requireTeamPerformanceAccess(context.supabase, data.organizationId, context.userId);
    return computeMemberDetail(context.supabase, data.organizationId, data.memberId, {
      preset: data.preset,
      from: data.from ?? null,
      to: data.to ?? null,
    });
  });

/** قائمة الأعمال خلف رقم واحد في اللوحة (Drill-down). */
export const getPerformanceDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => drilldownInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireTeamPerformanceAccess, computeDrilldown } = await import("./kpi.server");
    await requireTeamPerformanceAccess(context.supabase, data.organizationId, context.userId);
    return computeDrilldown(
      context.supabase,
      data.organizationId,
      data.memberId,
      data.kind,
      { preset: data.preset, from: data.from ?? null, to: data.to ?? null },
      data.page,
    );
  });

/** تصدير تقرير الأداء (CSV) — نفس أرقام اللوحة، بلا بيانات عملاء أو مستندات. */
export const exportTeamPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requireTeamPerformanceAccess, computeTeamPerformance } = await import("./kpi.server");
    await requireTeamPerformanceAccess(context.supabase, data.organizationId, context.userId);
    const result = await computeTeamPerformance(context.supabase, data.organizationId, {
      preset: data.preset,
      from: data.from ?? null,
      to: data.to ?? null,
    });
    const { buildPerformanceCsv } = await import("./kpi.export.server");
    return {
      csv: buildPerformanceCsv(result),
      fileName: `mehla-team-performance-${data.preset}.csv`,
    };
  });
