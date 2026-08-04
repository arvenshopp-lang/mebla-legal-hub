import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgInput = z.object({ organizationId: z.string().uuid() });

const permissionEnum = z.enum([
  "case_parties.read",
  "case_parties.create",
  "case_parties.update",
  "case_parties.delete",
]);

/** الصلاحيات الفعّالة للمستخدم الحالي على بيانات أطراف القضية (تُحسب خادمياً). */
export const getMyCasePartyPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { casePartyPermissions } = await import("./case-parties.server");
    return casePartyPermissions(context.supabase, data.organizationId);
  });

/** حذف طرف قضية: صلاحية حذف صريحة + تدقيق تلقائي بالقيم قبل الحذف. */
export const deleteCaseParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireCasePartyPermission } = await import("./case-parties.server");
    await requireCasePartyPermission(context.supabase, data.organizationId, "case_parties.delete");

    const { error } = await context.supabase
      .from("case_parties")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error("تعذّر حذف الطرف. تأكد من صلاحياتك ثم أعد المحاولة.");
    return { id: data.id };
  });

/** سجل تدقيق أطراف القضية (قبل/بعد) — للاطلاع فقط. */
export const listCasePartyAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        caseId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireCasePartyPermission } = await import("./case-parties.server");
    await requireCasePartyPermission(context.supabase, data.organizationId, "case_parties.read");

    let query = context.supabase
      .from("case_party_audit_logs")
      .select("id, case_id, party_id, action, actor_id, before_values, after_values, changed_fields, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.caseId) query = query.eq("case_id", data.caseId);

    const { data: rows, error } = await query;
    if (error) throw new Error("تعذّر تحميل سجل تدقيق أطراف القضية.");
    return rows ?? [];
  });

/** منح/سحب صلاحيات أطراف القضية: مالك المكتب والمدير فقط. */
async function requireOrgAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  userId: string,
) {
  const { requireMemberRole } = await import("./pii.server");
  const role = await requireMemberRole(supabase, organizationId, userId);
  if (role !== "owner" && role !== "admin") {
    throw new Error("إدارة صلاحيات أطراف القضية متاحة لمالك المكتب والمدير فقط.");
  }
  return role;
}

export const listCasePartyGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireOrgAdmin(context.supabase, data.organizationId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("case_party_permissions")
      .select("id, user_id, permission, reason, granted_at, expires_at, revoked_at")
      .eq("organization_id", data.organizationId)
      .order("granted_at", { ascending: false });
    if (error) throw new Error("تعذّر تحميل منح صلاحيات أطراف القضية.");
    return rows ?? [];
  });

export const grantCasePartyPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        permission: permissionEnum,
        reason: z.string().trim().min(8, "السبب الإداري إلزامي").max(300),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgAdmin(context.supabase, data.organizationId, context.userId);

    const { error } = await context.supabase.from("case_party_permissions").upsert(
      {
        organization_id: data.organizationId,
        user_id: data.userId,
        permission: data.permission,
        reason: data.reason,
        granted_by: context.userId,
        granted_at: new Date().toISOString(),
        expires_at: data.expiresAt ?? null,
        revoked_at: null,
        revoked_by: null,
      } as never,
      { onConflict: "organization_id,user_id,permission" },
    );
    if (error) throw new Error(error.message);

    const { logActivity } = await import("./audit");
    await logActivity(context.supabase, {
      organizationId: data.organizationId,
      action: "case_party_permission.grant",
      entityType: "case_party_permission",
      entityId: data.userId,
      metadata: { permission: data.permission, expires_at: data.expiresAt ?? null, reason: data.reason },
    });
    return { ok: true };
  });

export const revokeCasePartyPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgAdmin(context.supabase, data.organizationId, context.userId);

    const { data: row, error } = await context.supabase
      .from("case_party_permissions")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId } as never)
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .select("user_id, permission")
      .single();
    if (error) throw new Error(error.message);

    const { logActivity } = await import("./audit");
    await logActivity(context.supabase, {
      organizationId: data.organizationId,
      action: "case_party_permission.revoke",
      entityType: "case_party_permission",
      entityId: (row as { user_id: string }).user_id,
      metadata: { permission: (row as { permission: string }).permission },
    });
    return { ok: true };
  });
