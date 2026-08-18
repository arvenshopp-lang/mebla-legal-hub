/**
 * دوال خادم مركز التشغيل (الحوادث + النبضات + الطوابير).
 * ملف رقيق: تحقق صلاحية على الخادم، ثم تفويض المنطق لطبقة .server.ts،
 * وكتابة سجل تدقيق لكل تعديل على حادثة.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { OperationsOverview } from "@/lib/observability/incidents.shared";
import type {
  AssignableStaff,
  IncidentListResult,
} from "@/lib/observability/incidents-read.server";
import type { IncidentEventRow, IncidentRow } from "@/lib/observability/incidents.shared";

const guard = () => import("@/lib/admin-guard.server");
const reads = () => import("@/lib/observability/incidents-read.server");

const STATUSES = ["open", "investigating", "monitoring", "resolved"] as const;
const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const SOURCES = ["failure", "job", "queue"] as const;

export const getOperationsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperationsOverview> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "operations.read");
    const db = await g.admin();
    const { readOperationsOverview } = await import("@/lib/observability/watchdog.server");
    return readOperationsOverview(db);
  });

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        statuses: z.array(z.enum(STATUSES)).min(1).default(["open", "investigating", "monitoring"]),
        severities: z.array(z.enum(SEVERITIES)).min(1).default([...SEVERITIES]),
        sources: z.array(z.enum(SOURCES)).min(1).default([...SOURCES]),
        search: z.string().trim().max(80).default(""),
        limit: z.coerce.number().int().min(10).max(100).default(20),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<IncidentListResult> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "operations.read");
    const db = await g.admin();
    return (await reads()).readIncidents(db, data);
  });

export const getIncidentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ incidentId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      incident: IncidentRow;
      events: IncidentEventRow[];
      assignable: AssignableStaff[];
    }> => {
      const g = await guard();
      await g.requireStaff(context.supabase, context.userId, "operations.read");
      const db = await g.admin();
      const r = await reads();
      const [detail, assignable] = await Promise.all([
        r.readIncidentDetail(db, data.incidentId),
        r.readAssignableStaff(db),
      ]);
      return { ...detail, assignable };
    },
  );

export const updateIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        incidentId: z.string().uuid(),
        status: z.enum(STATUSES).optional(),
        assigneeStaffId: z.string().uuid().nullable().optional(),
        resolution: z.string().trim().max(300).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .refine(
        (value) =>
          value.status !== undefined ||
          value.assigneeStaffId !== undefined ||
          (value.note ?? "").length > 0,
        { message: "لا يوجد تغيير مطلوب." },
      )
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "operations.manage");
    const db = await g.admin();
    const { applyIncidentTransition } = await import("@/lib/observability/incidents.server");
    const { before, after } = await applyIncidentTransition(db, {
      incidentId: data.incidentId,
      status: data.status,
      assigneeStaffId: data.assigneeStaffId,
      resolution: data.resolution ?? null,
      note: data.note ?? null,
      actorEmail: staff.email,
    });
    await g.writeAudit(db, staff, {
      action: "operations.incident_update",
      entity_type: "platform_incident",
      entity_id: data.incidentId,
      description: data.status
        ? `تغيير حالة الحادثة إلى ${data.status}`
        : data.assigneeStaffId !== undefined
          ? "تحديث إسناد الحادثة"
          : "إضافة ملاحظة على الحادثة",
      before,
      after,
    });
    return { ok: true };
  });
