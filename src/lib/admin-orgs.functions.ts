/**
 * إدارة المكاتب من لوحة إدارة المنصة — أرقام مجمّعة فقط.
 * لا تُعيد أي دالة هنا محتوى قضية أو مستند أو ملف عميل، ولا يوجد مسار برمجي يسمح بذلك.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AdminOrgRow = {
  id: string;
  name: string;
  legal_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  commercial_registration: string | null;
  tax_number: string | null;
  is_active: boolean;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  users_count: number;
  lawyers_count: number;
  cases_count: number;
  clients_count: number;
  documents_count: number;
  storage_bytes: number;
  plan_code: string | null;
  plan_label: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
};

export const listOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        status: z.enum(["all", "active", "suspended", "subscribed", "unsubscribed"]).default("all"),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "organizations.read");
    const db = await g.admin();
    const { data: rows, error } = await db.rpc("admin_organization_directory", {
      _search: data.search || null,
      _status: data.status,
      _limit: data.pageSize,
      _offset: (data.page - 1) * data.pageSize,
    });
    if (error) throw new Error("تعذّر جلب قائمة المكاتب.");
    const list = (rows ?? []) as (AdminOrgRow & { total_count: number })[];
    return { rows: list as AdminOrgRow[], total: Number(list[0]?.total_count ?? 0) };
  });

/** أعضاء المكتب: الأسماء والأدوار فقط — لا بيانات قانونية. */
export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "organizations.read");
    const db = await g.admin();
    const { data: rows } = await db
      .from("organization_members")
      .select("id, role, status, created_at, profiles(full_name, email, is_active)")
      .eq("organization_id", data.organizationId)
      .order("created_at");
    return {
      members: (rows ?? []) as {
        id: string;
        role: string;
        status: string;
        created_at: string;
        profiles: { full_name: string; email: string | null; is_active: boolean } | null;
      }[],
    };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(2, "اسم المكتب مطلوب").max(160),
        legal_name: z.string().trim().max(160).optional().or(z.literal("")),
        city: z.string().trim().max(80).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
        email: z.string().trim().max(160).optional().or(z.literal("")),
        commercial_registration: z.string().trim().max(60).optional().or(z.literal("")),
        tax_number: z.string().trim().max(60).optional().or(z.literal("")),
        address: z.string().trim().max(300).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "organizations.update");
    const db = await g.admin();
    const { organizationId, ...fields } = data;
    const patch = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
    );
    const { data: before } = await db.from("organizations").select("*").eq("id", organizationId).maybeSingle();
    if (!before) throw new Error("المكتب غير موجود.");
    const { error } = await db.from("organizations").update(patch).eq("id", organizationId);
    if (error) throw new Error("تعذّر تحديث بيانات المكتب.");
    await g.writeAudit(db, staff, {
      action: "organization.update",
      entity_type: "organization",
      entity_id: organizationId,
      description: `تعديل بيانات المكتب ${data.name}`,
      before: { name: before.name, city: before.city, phone: before.phone, email: before.email },
      after: patch,
    });
    return { ok: true as const };
  });

export const setOrganizationActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        active: z.boolean(),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "organizations.update");
    const db = await g.admin();
    const { data: before } = await db
      .from("organizations")
      .select("id, name, is_active, suspension_reason")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (!before) throw new Error("المكتب غير موجود.");
    const { error } = await db
      .from("organizations")
      .update({
        is_active: data.active,
        suspended_at: data.active ? null : new Date().toISOString(),
        suspension_reason: data.active ? null : (data.reason ?? null),
      })
      .eq("id", data.organizationId);
    if (error) throw new Error("تعذّر تحديث حالة المكتب.");
    await g.writeAudit(db, staff, {
      action: data.active ? "organization.activate" : "organization.suspend",
      entity_type: "organization",
      entity_id: data.organizationId,
      description: `${data.active ? "إعادة تفعيل" : "إيقاف"} المكتب ${before.name}`,
      before: { is_active: before.is_active },
      after: { is_active: data.active, reason: data.reason ?? null },
    });
    return { ok: true as const };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), confirmName: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "organizations.delete");
    const db = await g.admin();
    const { data: before } = await db
      .from("organizations")
      .select("id, name, city, created_at")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (!before) throw new Error("المكتب غير موجود.");
    if (before.name.trim() !== data.confirmName.trim()) throw new Error("اسم المكتب غير مطابق. لم يتم الحذف.");

    const { error } = await db.from("organizations").delete().eq("id", data.organizationId);
    if (error) throw new Error("تعذّر حذف المكتب. تأكد من عدم وجود ارتباطات محمية.");

    await g.writeAudit(db, staff, {
      action: "organization.delete",
      entity_type: "organization",
      entity_id: data.organizationId,
      description: `حذف المكتب ${before.name} وجميع بياناته`,
      before,
      after: null,
    });
    return { ok: true as const };
  });

/* -------------------------------------------------- وصول الدعم المؤقت */

export const listSupportAccessGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "audit.read");
    const db = await g.admin();
    let q = db
      .from("support_access_grants")
      .select("id, organization_id, staff_email, reason, scope, status, requested_at, approved_at, expires_at, revoked_at, organizations(name)")
      .order("requested_at", { ascending: false })
      .limit(100);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows } = await q;
    return {
      grants: (rows ?? []) as {
        id: string;
        organization_id: string;
        staff_email: string;
        reason: string;
        scope: string;
        status: string;
        requested_at: string;
        approved_at: string | null;
        expires_at: string;
        revoked_at: string | null;
        organizations: { name: string } | null;
      }[],
    };
  });

export const requestSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        reason: z.string().trim().min(10, "اذكر سبباً واضحاً للطلب").max(500),
        scope: z.enum(["cases", "documents", "billing", "technical"]),
        hours: z.number().int().min(1).max(72).default(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "support_access.request");
    const db = await g.admin();
    const expires = new Date(Date.now() + data.hours * 3600_000).toISOString();
    const { data: row, error } = await db
      .from("support_access_grants")
      .insert({
        organization_id: data.organizationId,
        staff_user_id: staff.user_id,
        staff_email: staff.email,
        reason: data.reason,
        scope: data.scope,
        expires_at: expires,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء طلب وصول الدعم.");
    await g.writeAudit(db, staff, {
      action: "support_access.request",
      entity_type: "support_access",
      entity_id: row?.id ?? null,
      description: `طلب وصول دعم مؤقت (${data.scope}) لمدة ${data.hours} ساعة`,
      after: { reason: data.reason, scope: data.scope, expires_at: expires },
      metadata: { organization_id: data.organizationId },
    });
    return { ok: true as const };
  });

export const revokeSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "support_access.request");
    const db = await g.admin();
    const { error } = await db
      .from("support_access_grants")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.grantId);
    if (error) throw new Error("تعذّر إلغاء المنحة.");
    await g.writeAudit(db, staff, {
      action: "support_access.revoke",
      entity_type: "support_access",
      entity_id: data.grantId,
      description: "إلغاء منحة وصول دعم مؤقت",
    });
    return { ok: true as const };
  });
