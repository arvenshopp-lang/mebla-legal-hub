/**
 * دوال خادم البحث العالمي وسجل النشاط الموحّد ولوحة المراقبة.
 * ملف رقيق: تحقق صلاحية على الخادم ثم تفويض المنطق لطبقة .server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  ActivityFeed,
  GlobalSearchResult,
  MonitoringSnapshot,
} from "@/lib/admin-observability.shared";

const guard = () => import("@/lib/admin-guard.server");
const engine = () => import("@/lib/admin-observability.server");

export const globalAdminSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().max(80) }).parse(input))
  .handler(async ({ data, context }): Promise<GlobalSearchResult> => {
    const g = await guard();
    const staff = await g.requireActiveStaff(context.supabase, context.userId);
    const db = await g.admin();
    return (await engine()).runGlobalSearch(db, staff, data.query);
  });

export const getActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sources: z.array(z.enum(["admin", "tenant", "failure"])).min(1).default(["admin", "tenant", "failure"]),
        search: z.string().trim().max(80).default(""),
        from: z.string().datetime().nullable().default(null),
        to: z.string().datetime().nullable().default(null),
        limit: z.coerce.number().int().min(10).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ActivityFeed> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "audit.read");
    const db = await g.admin();
    return (await engine()).readActivityFeed(db, data);
  });

export const getMonitoringSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitoringSnapshot> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "monitoring.read");
    const db = await g.admin();
    return (await engine()).readMonitoringSnapshot(db);
  });
