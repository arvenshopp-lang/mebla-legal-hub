import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * دوال خادم RBAC — غلاف رقيق فقط: كل المنطق في `rbac-ops.server.ts`،
 * وكل عملية تمر من `authorize()` داخل تلك الطبقة.
 */

const uuid = z.string().uuid();
const reason = z.string().trim().min(8, "السبب مطلوب ولا يقل عن ٨ أحرف").max(500);
const permission = z.string().trim().min(3).max(80);

export const getRbacOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.rbacOverview(context.supabase, context.userId);
  });

export const saveRbacRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.nullish(),
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{2,39}$/, "الرمز يبدأ بحرف لاتيني صغير ويحتوي حروفاً وأرقاماً وشرطة سفلية"),
        name_ar: z.string().trim().min(2).max(80),
        description: z.string().trim().max(300).nullish(),
        permissions: z.array(permission).max(200),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.saveRole(context.supabase, context.userId, {
      id: data.id ?? null,
      code: data.code,
      name_ar: data.name_ar,
      description: data.description ?? null,
      permissions: data.permissions,
      ...(data.is_active === undefined ? {} : { is_active: data.is_active }),
    });
  });

export const cloneRbacRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: uuid,
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{2,39}$/, "الرمز يبدأ بحرف لاتيني صغير ويحتوي حروفاً وأرقاماً وشرطة سفلية"),
        name_ar: z.string().trim().min(2).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.cloneRole(context.supabase, context.userId, data);
  });

export const deleteRbacRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.deleteRole(context.supabase, context.userId, data.id);
  });

/** إنشاء دور من قالب تشغيلي — القالب يُنسخ كدور عادي ولا يُسند لأحد تلقائياً. */
export const createRoleFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        templateCode: z.string().trim().min(3).max(60),
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{2,39}$/, "الرمز يبدأ بحرف لاتيني صغير ويحتوي حروفاً وأرقاماً وشرطة سفلية"),
        name_ar: z.string().trim().min(2).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.createRoleFromTemplate(context.supabase, context.userId, data);
  });

const _deleteRbacRoleLegacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.deleteRole(context.supabase, context.userId, data.id);
  });

export const saveRbacDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.nullish(),
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{2,39}$/, "الرمز يبدأ بحرف لاتيني صغير ويحتوي حروفاً وأرقاماً وشرطة سفلية"),
        name_ar: z.string().trim().min(2).max(80),
        description: z.string().trim().max(300).nullish(),
        parent_department_id: uuid.nullish(),
        manager_user_id: uuid.nullish(),
        default_role_id: uuid.nullish(),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.saveDepartment(context.supabase, context.userId, {
      ...data,
      id: data.id ?? null,
      description: data.description ?? null,
      parent_department_id: data.parent_department_id ?? null,
      manager_user_id: data.manager_user_id ?? null,
      default_role_id: data.default_role_id ?? null,
    });
  });

export const updateRbacStaffOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        staffUserId: uuid,
        department_id: uuid.nullish(),
        manager_user_id: uuid.nullish(),
        role_id: uuid.nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.updateStaffOrg(context.supabase, context.userId, {
      staffUserId: data.staffUserId,
      department_id: data.department_id ?? null,
      manager_user_id: data.manager_user_id ?? null,
      role_id: data.role_id ?? null,
    });
  });

export const createRbacGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        granteeUserId: uuid,
        permission,
        source: z.enum(["temporary", "delegation"]),
        reason,
        reference: z.string().trim().max(80).nullish(),
        startsAt: z.string().datetime().nullish(),
        expiresAt: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.createGrant(context.supabase, context.userId, {
      ...data,
      reference: data.reference ?? null,
      startsAt: data.startsAt ?? null,
    });
  });

export const revokeRbacGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.revokeGrant(context.supabase, context.userId, data);
  });

export const createRbacApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().trim().min(3).max(80),
        resourceType: z.string().trim().min(2).max(60),
        resourceId: z.string().trim().max(120).nullish(),
        reason,
        payload: z.record(z.string(), z.unknown()).optional(),
        expiresInHours: z.number().int().min(1).max(720).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.createApprovalRequest(context.supabase, context.userId, {
      ...data,
      resourceId: data.resourceId ?? null,
    });
  });

export const decideRbacApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.decideApprovalRequest(context.supabase, context.userId, data);
  });

export const revokeRbacSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.revokeStaffSession(context.supabase, context.userId, data);
  });

export const saveRbacRestrictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        staffUserId: uuid,
        ip_enforced: z.boolean(),
        allowed_ips: z.array(z.string().trim().max(64)).max(50),
        denied_ips: z.array(z.string().trim().max(64)).max(50),
        device_enforced: z.boolean(),
        trusted_devices: z.array(z.string().trim().max(64)).max(50),
        blocked_devices: z.array(z.string().trim().max(64)).max(50),
        time_enforced: z.boolean(),
        work_start_minute: z.number().int().min(0).max(1440),
        work_end_minute: z.number().int().min(0).max(1440),
        allowed_weekdays: z.array(z.number().int().min(0).max(6)).max(7),
        reason: z.string().trim().max(300).nullish(),
        effective_from: z.string().datetime().nullish(),
        effective_to: z.string().datetime().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.saveRestrictions(context.supabase, context.userId, {
      ...data,
      reason: data.reason ?? null,
      effective_from: data.effective_from ?? null,
      effective_to: data.effective_to ?? null,
    });
  });

export const revokeAllRbacSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ staffUserId: uuid, reason: z.string().trim().max(500).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.revokeAllStaffSessions(context.supabase, context.userId, data);
  });

export const getRbacAuditPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        action: z.string().trim().max(80).optional(),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.rbacAuditPage(context.supabase, context.userId, data);
  });

export const requestRbacImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetUserId: uuid, reason, minutes: z.number().int().min(5).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.requestImpersonation(context.supabase, context.userId, data);
  });

export const decideRbacImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.approveImpersonation(context.supabase, context.userId, data);
  });

export const endRbacImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.endImpersonation(context.supabase, context.userId, data);
  });

export const getRbacImpersonationState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.currentImpersonation(context.userId);
  });

export const logRbacImpersonationPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().trim().min(1).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.logImpersonationPage(context.supabase, context.userId, data.path);
  });

export const getRbacImpersonationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const ops = await import("./rbac-ops.server");
    return ops.impersonationEvents(context.supabase, context.userId, data.sessionId);
  });
