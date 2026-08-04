/**
 * عمليات RBAC — خادم فقط. كل دالة هنا تبدأ بـ `authorize()` ولا تثق بأي إدخال،
 * وتكتب سجل تدقيق بقيم قبل/بعد. لا توجد أي عملية كتابة بلا صلاحية وبلا سجل.
 */
import { ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-permissions";
import { isSensitivePermission } from "./rbac.shared";
import {
  RbacError,
  adminDb,
  auditRbac,
  authorize,
  holdsBasePermission,
  holdsPermission,
  loadRbacContext,
  requestFacts,
} from "./rbac.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const VALID_PERMISSIONS = new Set<string>(ADMIN_PERMISSIONS.map((p) => p.id));

function assertPermissionKey(permission: string): AdminPermission {
  if (!VALID_PERMISSIONS.has(permission)) {
    throw new Error("مفتاح صلاحية غير معروف.");
  }
  return permission as AdminPermission;
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------- القراءة ------------------------------- */

const RBAC_AUDIT_ACTIONS = [
  "authz.denied",
  "authz.allowed",
  "rbac.role_saved",
  "rbac.role_deleted",
  "rbac.department_saved",
  "rbac.staff_org_updated",
  "rbac.grant_created",
  "rbac.grant_revoked",
  "rbac.approval_requested",
  "rbac.approval_decided",
  "rbac.session_revoked",
  "rbac.restrictions_saved",
  "rbac.impersonation_requested",
  "rbac.impersonation_approved",
  "rbac.impersonation_ended",
  "rbac.impersonation_page",
];


export async function rbacOverview(supabase: AnyClient, userId: string) {
  const ctx = await authorize(supabase, userId, "staff.view", { mutating: false });
  const db = await adminDb();
  const iso = nowIso();

  const [roles, departments, staff, grants, approvals, sessions, restrictions, impersonations, audit] =
    await Promise.all([
      db.from("platform_roles").select("*").order("is_system", { ascending: false }).order("name_ar"),
      db.from("platform_departments").select("*").order("name_ar"),
      db
        .from("platform_staff")
        .select("id, user_id, full_name, email, job_title, role, status, permissions, role_id, department_id, manager_user_id")
        .order("full_name"),
      db
        .from("platform_permission_grants")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("platform_approval_requests").select("*").order("requested_at", { ascending: false }).limit(120),
      db.from("platform_staff_sessions").select("*").order("last_seen_at", { ascending: false }).limit(200),
      db.from("platform_staff_restrictions").select("*"),
      db
        .from("platform_impersonation_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60),
      db
        .from("admin_audit_logs")
        .select("id, actor_email, action, entity_type, entity_id, description, metadata, created_at, ip, device, browser")
        .in("action", RBAC_AUDIT_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

  return {
    me: {
      userId,
      email: ctx.staff.email,
      role: ctx.staff.role,
      basePermissions: ctx.basePermissions,
      effectivePermissions: ctx.effectivePermissions,
      liveGrants: ctx.liveGrants,
      impersonation: ctx.impersonation,
      facts: { ip: ctx.facts.ip, device: ctx.facts.device, browser: ctx.facts.browser, fingerprint: ctx.facts.fingerprint },
    },
    now: iso,
    roles: roles.data ?? [],
    departments: departments.data ?? [],
    staff: staff.data ?? [],
    grants: grants.data ?? [],
    approvals: approvals.data ?? [],
    sessions: sessions.data ?? [],
    restrictions: restrictions.data ?? [],
    impersonations: impersonations.data ?? [],
    audit: audit.data ?? [],
  };
}

/* -------------------------------- الأدوار ------------------------------- */


/** سجل تدقيق RBAC مع ترقيم صفحات خادمي وعدد إجمالي. */
export async function rbacAuditPage(
  supabase: AnyClient,
  userId: string,
  input: { search?: string; action?: string; page: number; pageSize: number },
) {
  await authorize(supabase, userId, "audit.read", { mutating: false });
  const db = await adminDb();
  const from = (input.page - 1) * input.pageSize;

  let query = db
    .from("admin_audit_logs")
    .select(
      "id, actor_email, action, entity_type, entity_id, description, metadata, created_at, ip, device, browser",
      { count: "exact" },
    )
    .in("action", input.action ? [input.action] : RBAC_AUDIT_ACTIONS);

  const search = input.search?.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, " ");
    query = query.or(`actor_email.ilike.%${safe}%,description.ilike.%${safe}%,entity_type.ilike.%${safe}%`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + input.pageSize - 1);
  if (error) throw new Error("تعذّر قراءة سجل التدقيق.");

  return { rows: data ?? [], total: count ?? 0, page: input.page, pageSize: input.pageSize };
}

export async function saveRole(
  supabase: AnyClient,
  userId: string,
  input: {
    id?: string | null;
    code: string;
    name_ar: string;
    description?: string | null;
    permissions: string[];
    is_active?: boolean;
  },
) {
  const ctx = await authorize(supabase, userId, "roles.manage", { entityType: "platform_role" });
  const db = await adminDb();

  const permissions = Array.from(new Set(input.permissions.map(assertPermissionKey)));
  // لا تصعيد: لا يبني الموظف دوراً يحمل صلاحية لا يملكها.
  const beyond = permissions.filter((p) => !holdsPermission(ctx, p));
  if (beyond.length > 0) {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.denied",
      entityType: "platform_role",
      description: "محاولة إنشاء دور بصلاحيات أعلى من صلاحيات المُنشئ",
      metadata: { attempted: beyond, trace_ref: ctx.traceRef },
    });
    throw new RbacError("missing_permission", "لا يمكنك منح صلاحية لا تملكها.");
  }

  let before: unknown = null;
  let id = input.id ?? null;
  if (id) {
    const { data } = await db.from("platform_roles").select("*").eq("id", id).maybeSingle();
    if (!data) throw new Error("الدور غير موجود.");
    before = data;
    const { error } = await db
      .from("platform_roles")
      .update({
        name_ar: input.name_ar.trim(),
        description: input.description?.trim() || null,
        permissions,
        ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
        updated_at: nowIso(),
      })
      .eq("id", id);
    if (error) throw new Error("تعذّر تحديث الدور.");
  } else {
    const { data, error } = await db
      .from("platform_roles")
      .insert({
        code: input.code.trim(),
        name_ar: input.name_ar.trim(),
        description: input.description?.trim() || null,
        permissions,
        is_system: false,
        is_active: input.is_active ?? true,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء الدور. تأكد أن الرمز غير مستخدم.");
    id = (data as { id: string }).id;
  }

  const { data: after } = await db.from("platform_roles").select("*").eq("id", id).maybeSingle();
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.role_saved",
    entityType: "platform_role",
    entityId: id,
    description: `حفظ الدور «${input.name_ar}»`,
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { id };
}

/** استنساخ دور قائم بصلاحياته كاملة — يمرّ بنفس حراسة عدم التصعيد. */
export async function cloneRole(
  supabase: AnyClient,
  userId: string,
  input: { sourceId: string; code: string; name_ar: string },
) {
  const db = await adminDb();
  const { data: source } = await db
    .from("platform_roles")
    .select("permissions, description")
    .eq("id", input.sourceId)
    .maybeSingle();
  if (!source) throw new Error("الدور المصدر غير موجود.");
  const row = source as { permissions: string[] | null; description: string | null };
  return saveRole(supabase, userId, {
    code: input.code,
    name_ar: input.name_ar,
    description: row.description,
    permissions: row.permissions ?? [],
    is_active: true,
  });
}

export async function deleteRole(supabase: AnyClient, userId: string, id: string) {
  const ctx = await authorize(supabase, userId, "roles.manage", { entityType: "platform_role", entityId: id });
  const db = await adminDb();
  const { data: before } = await db.from("platform_roles").select("*").eq("id", id).maybeSingle();
  if (!before) throw new Error("الدور غير موجود.");
  if ((before as { is_system: boolean }).is_system) throw new Error("لا يمكن حذف دور تأسيسي.");
  const { count } = await db
    .from("platform_staff")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id);
  if ((count ?? 0) > 0) throw new Error("لا يمكن حذف دور مرتبط بموظفين. انقلهم إلى دور آخر أولاً.");
  const { error } = await db.from("platform_roles").delete().eq("id", id);
  if (error) throw new Error("تعذّر حذف الدور.");
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.role_deleted",
    entityType: "platform_role",
    entityId: id,
    description: `حذف الدور «${(before as { name_ar: string }).name_ar}»`,
    before,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/* -------------------------------- الأقسام ------------------------------ */

export async function saveDepartment(
  supabase: AnyClient,
  userId: string,
  input: {
    id?: string | null;
    code: string;
    name_ar: string;
    description?: string | null;
    parent_department_id?: string | null;
    manager_user_id?: string | null;
    default_role_id?: string | null;
    is_active?: boolean;
  },
) {
  const ctx = await authorize(supabase, userId, "departments.manage", { entityType: "platform_department" });
  const db = await adminDb();
  const payload = {
    name_ar: input.name_ar.trim(),
    description: input.description?.trim() || null,
    parent_department_id: input.parent_department_id || null,
    manager_user_id: input.manager_user_id || null,
    default_role_id: input.default_role_id || null,
    is_active: input.is_active ?? true,
  };

  let id = input.id ?? null;
  let before: unknown = null;
  if (id) {
    const { data } = await db.from("platform_departments").select("*").eq("id", id).maybeSingle();
    before = data;
    const { error } = await db.from("platform_departments").update(payload).eq("id", id);
    if (error) throw new Error(mapDbError(error.message, "تعذّر تحديث القسم."));
  } else {
    const { data, error } = await db
      .from("platform_departments")
      .insert({ code: input.code.trim(), ...payload })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(mapDbError(error.message, "تعذّر إنشاء القسم. تأكد أن الرمز غير مستخدم."));
    id = (data as { id: string }).id;
  }
  const { data: after } = await db.from("platform_departments").select("*").eq("id", id).maybeSingle();
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.department_saved",
    entityType: "platform_department",
    entityId: id,
    description: `حفظ القسم «${input.name_ar}»`,
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { id };
}

export async function updateStaffOrg(
  supabase: AnyClient,
  userId: string,
  input: { staffUserId: string; department_id?: string | null; manager_user_id?: string | null; role_id?: string | null },
) {
  const ctx = await authorize(supabase, userId, "staff.manage", {
    entityType: "platform_staff",
    entityId: input.staffUserId,
  });
  const db = await adminDb();
  const { data: before } = await db
    .from("platform_staff")
    .select("user_id, full_name, department_id, manager_user_id, role_id")
    .eq("user_id", input.staffUserId)
    .maybeSingle();
  if (!before) throw new Error("الموظف غير موجود.");

  if (input.role_id) {
    const { data: role } = await db.from("platform_roles").select("permissions").eq("id", input.role_id).maybeSingle();
    const rolePermissions = ((role as { permissions: string[] | null } | null)?.permissions ?? []) as string[];
    const beyond = rolePermissions.filter((p) => !holdsPermission(ctx, p));
    if (beyond.length > 0) {
      await auditRbac(supabase, {
        actorEmail: ctx.staff.email,
        action: "authz.denied",
        entityType: "platform_staff",
        entityId: input.staffUserId,
        description: "محاولة إسناد دور يحمل صلاحيات أعلى من صلاحيات المُسند",
        metadata: { attempted: beyond, trace_ref: ctx.traceRef },
      });
      throw new RbacError("missing_permission", "لا يمكنك إسناد دور يحمل صلاحية لا تملكها.");
    }
  }

  const { error } = await db
    .from("platform_staff")
    .update({
      department_id: input.department_id ?? null,
      manager_user_id: input.manager_user_id ?? null,
      ...(input.role_id !== undefined ? { role_id: input.role_id || null } : {}),
      updated_at: nowIso(),
    })
    .eq("user_id", input.staffUserId);
  if (error) throw new Error(mapDbError(error.message, "تعذّر تحديث بيانات الموظف."));

  const { data: after } = await db
    .from("platform_staff")
    .select("user_id, full_name, department_id, manager_user_id, role_id")
    .eq("user_id", input.staffUserId)
    .maybeSingle();
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.staff_org_updated",
    entityType: "platform_staff",
    entityId: input.staffUserId,
    description: `تحديث القسم/المدير المباشر للموظف «${(before as { full_name: string }).full_name}»`,
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/* --------------------- الصلاحيات المؤقتة والتفويض ---------------------- */

export async function createGrant(
  supabase: AnyClient,
  userId: string,
  input: {
    granteeUserId: string;
    permission: string;
    source: "temporary" | "delegation";
    reason: string;
    reference?: string | null;
    startsAt?: string | null;
    expiresAt: string;
  },
) {
  const permission = assertPermissionKey(input.permission);
  const needed = input.source === "delegation" ? "delegation.grant" : "staff.manage";
  const ctx = await authorize(supabase, userId, needed, {
    entityType: "platform_permission_grant",
    description: `منح «${permission}» لموظف`,
  });
  const db = await adminDb();

  if (input.reason.trim().length < 8) throw new Error("السبب مطلوب ولا يقل عن ٨ أحرف.");
  const expires = new Date(input.expiresAt);
  const starts = input.startsAt ? new Date(input.startsAt) : new Date();
  if (!Number.isFinite(expires.getTime()) || expires <= starts) {
    throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.");
  }
  if (input.granteeUserId === userId) throw new Error("لا يمكنك منح نفسك صلاحية.");

  // لا تصعيد
  if (!holdsPermission(ctx, permission)) {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.denied",
      entityType: "platform_permission_grant",
      description: "محاولة منح صلاحية لا يملكها المانح",
      metadata: { permission, trace_ref: ctx.traceRef },
    });
    throw new RbacError("missing_permission", "لا يمكنك منح صلاحية لا تملكها.");
  }
  // لا تسلسل تفويض
  if (input.source === "delegation" && !holdsBasePermission(ctx, permission)) {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.denied",
      entityType: "platform_permission_grant",
      description: "محاولة تفويض صلاحية جاءت أصلاً بتفويض",
      metadata: { permission, trace_ref: ctx.traceRef },
    });
    throw new Error("لا يمكن تفويض صلاحية حصلت عليها بتفويض.");
  }
  // الصلاحيات الحساسة تتطلب اعتماد موظف آخر
  if (isSensitivePermission(permission) && ctx.staff.role !== "super_admin") {
    const { data: approval } = await db
      .from("platform_approval_requests")
      .select("id, status, payload")
      .eq("action", "permissions.grant_sensitive")
      .eq("resource_type", "platform_permission_grant")
      .eq("resource_id", `${input.granteeUserId}:${permission}`)
      .eq("status", "approved")
      .maybeSingle();
    if (!approval) {
      throw new Error("هذه صلاحية حساسة: أنشئ طلب اعتماد ووافق عليه موظف آخر قبل المنح.");
    }
    await db
      .from("platform_approval_requests")
      .update({ status: "executed", executed_at: nowIso() })
      .eq("id", (approval as { id: string }).id);
  }

  const { data, error } = await db
    .from("platform_permission_grants")
    .insert({
      grantee_user_id: input.granteeUserId,
      permission,
      source: input.source,
      granted_by: userId,
      granted_by_email: ctx.staff.email,
      reason: input.reason.trim(),
      reference: input.reference?.trim() || null,
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(mapDbError(error.message, "تعذّر إنشاء المنح."));

  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.grant_created",
    entityType: "platform_permission_grant",
    entityId: (data as { id: string }).id,
    description: `منح «${permission}» بمصدر ${input.source}`,
    after: data,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { id: (data as { id: string }).id };
}

export async function revokeGrant(supabase: AnyClient, userId: string, input: { id: string; reason: string }) {
  const ctx = await authorize(supabase, userId, "delegation.revoke", {
    entityType: "platform_permission_grant",
    entityId: input.id,
  });
  const db = await adminDb();
  const { data: before } = await db.from("platform_permission_grants").select("*").eq("id", input.id).maybeSingle();
  if (!before) throw new Error("المنح غير موجود.");
  if ((before as { revoked_at: string | null }).revoked_at) throw new Error("هذا المنح مسحوب مسبقاً.");
  const { error } = await db
    .from("platform_permission_grants")
    .update({ revoked_at: nowIso(), revoked_by: userId, revoke_reason: input.reason.trim() || null })
    .eq("id", input.id);
  if (error) throw new Error(mapDbError(error.message, "تعذّر سحب المنح."));
  const { data: after } = await db.from("platform_permission_grants").select("*").eq("id", input.id).maybeSingle();
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.grant_revoked",
    entityType: "platform_permission_grant",
    entityId: input.id,
    description: `سحب منح «${(before as { permission: string }).permission}»`,
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/* ---------------------------- طلبات الاعتماد --------------------------- */

export async function createApprovalRequest(
  supabase: AnyClient,
  userId: string,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason: string;
    payload?: Record<string, unknown>;
    expiresInHours?: number;
  },
) {
  const ctx = await authorize(supabase, userId, "approvals.request", {
    entityType: "platform_approval_request",
    description: `طلب اعتماد «${input.action}»`,
  });
  const db = await adminDb();
  if (input.reason.trim().length < 8) throw new Error("السبب مطلوب ولا يقل عن ٨ أحرف.");
  const hours = Math.min(Math.max(input.expiresInHours ?? 72, 1), 720);
  const { data, error } = await db
    .from("platform_approval_requests")
    .insert({
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      payload: input.payload ?? {},
      reason: input.reason.trim(),
      requested_by: userId,
      requested_by_email: ctx.staff.email,
      expires_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(mapDbError(error.message, "تعذّر إنشاء طلب الاعتماد."));
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.approval_requested",
    entityType: "platform_approval_request",
    entityId: (data as { id: string }).id,
    description: `طلب اعتماد «${input.action}»`,
    after: data,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { id: (data as { id: string }).id };
}

export async function decideApprovalRequest(
  supabase: AnyClient,
  userId: string,
  input: { id: string; decision: "approved" | "rejected"; reason: string },
) {
  const ctx = await authorize(supabase, userId, "approvals.decide", {
    entityType: "platform_approval_request",
    entityId: input.id,
  });
  const db = await adminDb();
  const { data: before } = await db.from("platform_approval_requests").select("*").eq("id", input.id).maybeSingle();
  if (!before) throw new Error("الطلب غير موجود.");
  const row = before as { requested_by: string; status: string; expires_at: string };
  if (row.requested_by === userId) {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.denied",
      entityType: "platform_approval_request",
      entityId: input.id,
      description: "محاولة اعتماد الطلب من صاحبه (مبدأ أربع أعين)",
      metadata: { trace_ref: ctx.traceRef },
    });
    throw new Error("لا يمكنك اعتماد طلب أنشأته بنفسك.");
  }
  if (row.status !== "pending") throw new Error("هذا الطلب غير معلّق.");
  if (new Date(row.expires_at) <= new Date()) throw new Error("انتهت صلاحية هذا الطلب.");

  const { error } = await db
    .from("platform_approval_requests")
    .update({
      status: input.decision,
      decided_by: userId,
      decided_by_email: ctx.staff.email,
      decision_reason: input.reason.trim() || null,
    })
    .eq("id", input.id);
  if (error) throw new Error(mapDbError(error.message, "تعذّر تسجيل القرار."));

  const { data: after } = await db.from("platform_approval_requests").select("*").eq("id", input.id).maybeSingle();
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.approval_decided",
    entityType: "platform_approval_request",
    entityId: input.id,
    description: input.decision === "approved" ? "اعتماد طلب عملية حساسة" : "رفض طلب عملية حساسة",
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/* --------------------------- الجلسات والقيود --------------------------- */

export async function revokeStaffSession(supabase: AnyClient, userId: string, input: { id: string; reason: string }) {
  const ctx = await authorize(supabase, userId, "staff.sessions.revoke", {
    entityType: "platform_staff_session",
    entityId: input.id,
  });
  const db = await adminDb();
  const { data: before } = await db.from("platform_staff_sessions").select("*").eq("id", input.id).maybeSingle();
  if (!before) throw new Error("الجلسة غير موجودة.");
  const { error } = await db
    .from("platform_staff_sessions")
    .update({ revoked_at: nowIso(), revoked_by: userId, revoke_reason: input.reason.trim() || null })
    .eq("id", input.id);
  if (error) throw new Error("تعذّر إبطال الجلسة.");
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.session_revoked",
    entityType: "platform_staff_session",
    entityId: input.id,
    description: "إبطال جلسة جهاز لموظف",
    before,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/** إبطال كل جلسات موظف — يخرجه من جميع أجهزته فوراً. */
export async function revokeAllStaffSessions(
  supabase: AnyClient,
  userId: string,
  input: { staffUserId: string; reason: string },
) {
  const ctx = await authorize(supabase, userId, "staff.sessions.revoke", {
    entityType: "platform_staff_session",
    entityId: input.staffUserId,
  });
  const db = await adminDb();
  const { data: rows } = await db
    .from("platform_staff_sessions")
    .select("id")
    .eq("user_id", input.staffUserId)
    .is("revoked_at", null);
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return { revoked: 0 };
  const { error } = await db
    .from("platform_staff_sessions")
    .update({ revoked_at: nowIso(), revoked_by: userId, revoke_reason: input.reason.trim() || null })
    .in("id", ids);
  if (error) throw new Error("تعذّر إبطال الجلسات.");
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.session_revoked",
    entityType: "platform_staff_session",
    entityId: input.staffUserId,
    description: `إبطال جميع جلسات الموظف (${ids.length} جلسة)`,
    metadata: { trace_ref: ctx.traceRef, count: ids.length, session_ids: ids },
  });
  return { revoked: ids.length };
}

export async function saveRestrictions(
  supabase: AnyClient,
  userId: string,
  input: {
    staffUserId: string;
    ip_enforced: boolean;
    allowed_ips: string[];
    denied_ips: string[];
    device_enforced: boolean;
    trusted_devices: string[];
    blocked_devices: string[];
    time_enforced: boolean;
    work_start_minute: number;
    work_end_minute: number;
    allowed_weekdays: number[];
    reason?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
  },
) {
  const ctx = await authorize(supabase, userId, "staff.restrictions.manage", {
    entityType: "platform_staff_restrictions",
    entityId: input.staffUserId,
  });
  const db = await adminDb();
  if (input.work_end_minute <= input.work_start_minute) throw new Error("نهاية نافذة العمل يجب أن تكون بعد بدايتها.");
  if (input.ip_enforced && input.allowed_ips.filter((v) => v.trim()).length === 0) {
    throw new Error("أضف عنواناً واحداً على الأقل قبل تفعيل قيد العناوين.");
  }
  if (input.device_enforced && input.trusted_devices.filter((v) => v.trim()).length === 0) {
    throw new Error("أضف جهازاً موثوقاً واحداً على الأقل قبل تفعيل قيد الأجهزة.");
  }
  if (input.time_enforced && input.allowed_weekdays.length === 0) {
    throw new Error("اختر يوم عمل واحداً على الأقل قبل تفعيل قيد الوقت.");
  }
  if (
    input.effective_from &&
    input.effective_to &&
    new Date(input.effective_to).getTime() <= new Date(input.effective_from).getTime()
  ) {
    throw new Error("نهاية سريان القيد يجب أن تكون بعد بدايتها.");
  }

  const { data: before } = await db
    .from("platform_staff_restrictions")
    .select("*")
    .eq("user_id", input.staffUserId)
    .maybeSingle();

  const payload = {
    user_id: input.staffUserId,
    ip_enforced: input.ip_enforced,
    allowed_ips: input.allowed_ips.map((v) => v.trim()).filter(Boolean),
    denied_ips: input.denied_ips.map((v) => v.trim()).filter(Boolean),
    device_enforced: input.device_enforced,
    trusted_devices: input.trusted_devices.map((v) => v.trim()).filter(Boolean),
    blocked_devices: input.blocked_devices.map((v) => v.trim()).filter(Boolean),
    time_enforced: input.time_enforced,
    work_start_minute: input.work_start_minute,
    work_end_minute: input.work_end_minute,
    allowed_weekdays: input.allowed_weekdays,
    reason: input.reason?.trim() || null,
    effective_from: input.effective_from || null,
    effective_to: input.effective_to || null,
    updated_by: userId,
    updated_at: nowIso(),
  };
  const { error } = await db.from("platform_staff_restrictions").upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(mapDbError(error.message, "تعذّر حفظ القيود."));

  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.restrictions_saved",
    entityType: "platform_staff_restrictions",
    entityId: input.staffUserId,
    description: "تحديث قيود الوصول (العناوين/الأجهزة/الوقت)",
    before,
    after: payload,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/* ------------------------------ الانتحال ------------------------------- */

export async function requestImpersonation(
  supabase: AnyClient,
  userId: string,
  input: { targetUserId: string; reason: string; minutes: number },
) {
  const ctx = await authorize(supabase, userId, "impersonation.request", {
    entityType: "platform_impersonation_session",
  });
  const db = await adminDb();
  if (input.reason.trim().length < 8) throw new Error("السبب مطلوب ولا يقل عن ٨ أحرف.");
  if (input.targetUserId === userId) throw new Error("لا يمكنك انتحال حسابك.");
  const minutes = Math.min(Math.max(input.minutes, 5), 120);

  const { data: target } = await db
    .from("platform_staff")
    .select("user_id, email, status")
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if (!target) throw new Error("الانتحال متاح داخل فريق المنصة فقط.");

  const approval = await createApprovalRequest(supabase, userId, {
    action: "impersonation.start",
    resourceType: "platform_impersonation_session",
    resourceId: input.targetUserId,
    reason: input.reason,
    payload: { minutes },
    expiresInHours: 24,
  });

  const facts = requestFacts();
  const { data, error } = await db
    .from("platform_impersonation_sessions")
    .insert({
      actor_user_id: userId,
      actor_email: ctx.staff.email,
      target_user_id: input.targetUserId,
      target_email: (target as { email: string }).email,
      reason: input.reason.trim(),
      status: "pending",
      approval_request_id: approval.id,
      expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      ip: facts.ip,
      user_agent: facts.userAgent,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(mapDbError(error.message, "تعذّر إنشاء طلب الانتحال."));

  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.impersonation_requested",
    entityType: "platform_impersonation_session",
    entityId: (data as { id: string }).id,
    description: `طلب انتحال قراءة فقط لمدة ${minutes} دقيقة`,
    after: data,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { id: (data as { id: string }).id, approvalId: approval.id };
}

export async function approveImpersonation(
  supabase: AnyClient,
  userId: string,
  input: { id: string; decision: "approved" | "rejected"; reason: string },
) {
  const ctx = await authorize(supabase, userId, "impersonation.approve", {
    entityType: "platform_impersonation_session",
    entityId: input.id,
  });
  const db = await adminDb();
  const { data: before } = await db
    .from("platform_impersonation_sessions")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!before) throw new Error("الطلب غير موجود.");
  const row = before as {
    actor_user_id: string;
    status: string;
    approval_request_id: string | null;
    expires_at: string;
    created_at: string;
  };
  if (row.actor_user_id === userId) throw new Error("لا يمكنك اعتماد طلب انتحال أنشأته بنفسك.");
  if (row.status !== "pending") throw new Error("هذا الطلب غير معلّق.");

  if (row.approval_request_id) {
    await decideApprovalRequest(supabase, userId, {
      id: row.approval_request_id,
      decision: input.decision,
      reason: input.reason,
    });
  }

  // المدة المطلوبة أصلاً = الفرق بين إنشاء الطلب وانتهائه، وتبدأ من لحظة الاعتماد.
  const requestedMinutes = Math.round(
    (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 60_000,
  );
  const minutesLeft = Math.min(Math.max(Number.isFinite(requestedMinutes) ? requestedMinutes : 30, 5), 120);
  const patch =
    input.decision === "approved"
      ? {
          status: "active",
          approved_by: userId,
          approved_at: nowIso(),
          started_at: nowIso(),
          expires_at: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
          updated_at: nowIso(),
        }
      : { status: "rejected", approved_by: null, updated_at: nowIso(), end_reason: input.reason.trim() || null };

  const { error } = await db.from("platform_impersonation_sessions").update(patch).eq("id", input.id);
  if (error) throw new Error(mapDbError(error.message, "تعذّر تسجيل القرار."));

  const { data: after } = await db.from("platform_impersonation_sessions").select("*").eq("id", input.id).maybeSingle();
  if (input.decision === "approved") {
    await db.from("platform_impersonation_events").insert({
      session_id: input.id,
      actor_user_id: row.actor_user_id,
      target_user_id: (before as { target_user_id: string }).target_user_id,
      event: "session_started",
      detail: `اعتماد ${ctx.staff.email}`,
    });
  }
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.impersonation_approved",
    entityType: "platform_impersonation_session",
    entityId: input.id,
    description: input.decision === "approved" ? "اعتماد جلسة انتحال" : "رفض جلسة انتحال",
    before,
    after,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

export async function endImpersonation(supabase: AnyClient, userId: string, input: { id: string; reason?: string }) {
  // الإنهاء مسموح دائماً لصاحب الجلسة أو لمن يملك اعتماد الانتحال.
  const ctx = await loadRbacContext(userId);
  const db = await adminDb();
  const { data: before } = await db
    .from("platform_impersonation_sessions")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!before) throw new Error("الجلسة غير موجودة.");
  const row = before as { actor_user_id: string; target_user_id: string; status: string };
  const mayEnd = row.actor_user_id === userId || holdsPermission(ctx, "impersonation.approve");
  if (!mayEnd) throw new RbacError("missing_permission");
  if (row.status !== "active") throw new Error("هذه الجلسة غير سارية.");

  await db
    .from("platform_impersonation_sessions")
    .update({ status: "ended", ended_at: nowIso(), ended_by: userId, end_reason: input.reason?.trim() || null, updated_at: nowIso() })
    .eq("id", input.id);
  await db.from("platform_impersonation_events").insert({
    session_id: input.id,
    actor_user_id: row.actor_user_id,
    target_user_id: row.target_user_id,
    event: "session_ended",
    detail: input.reason?.trim() || null,
  });
  await auditRbac(supabase, {
    actorEmail: ctx.staff.email,
    action: "rbac.impersonation_ended",
    entityType: "platform_impersonation_session",
    entityId: input.id,
    description: "إنهاء جلسة انتحال",
    before,
    metadata: { trace_ref: ctx.traceRef },
  });
  return { ok: true };
}

/** يسجّل كل صفحة تُزار أثناء الانتحال — لا وصول صامت. */
export async function logImpersonationPage(supabase: AnyClient, userId: string, path: string) {
  const ctx = await loadRbacContext(userId);
  if (!ctx.impersonation) return { logged: false };
  const db = await adminDb();
  const facts = ctx.facts;
  await db.from("platform_impersonation_events").insert({
    session_id: ctx.impersonation.id,
    actor_user_id: userId,
    target_user_id: ctx.impersonation.target_user_id,
    event: "page_view",
    path: path.slice(0, 300),
    ip: facts.ip,
    user_agent: facts.userAgent,
  });
  return { logged: true };
}

export async function currentImpersonation(userId: string) {
  const ctx = await loadRbacContext(userId);
  return ctx.impersonation;
}

/* ------------------------------ مساعدات ------------------------------- */

const DB_MESSAGES: Record<string, string> = {
  PRIVILEGE_ESCALATION_FORBIDDEN: "لا يمكنك منح صلاحية لا تملكها.",
  CHAINED_DELEGATION_FORBIDDEN: "لا يمكن تفويض صلاحية حصلت عليها بتفويض.",
  SELF_APPROVAL_FORBIDDEN: "لا يمكنك اعتماد طلب أنشأته بنفسك.",
  REQUEST_NOT_PENDING: "هذا الطلب غير معلّق.",
  REQUEST_EXPIRED: "انتهت صلاحية هذا الطلب.",
  GRANTEE_NOT_ACTIVE_STAFF: "المستفيد ليس موظفاً نشطاً في فريق المنصة.",
  GRANTER_NOT_ACTIVE_STAFF: "المانح ليس موظفاً نشطاً في فريق المنصة.",
  GRANT_CANNOT_BE_REVIVED: "لا يمكن إعادة تفعيل منح مسحوب.",
  DEPARTMENT_CYCLE: "لا يمكن أن يكون القسم تابعاً لنفسه.",
  MANAGER_CYCLE: "سلسلة المدير المباشر تحتوي على حلقة.",
  RECORD_IMMUTABLE: "هذا السجل غير قابل للتعديل.",
  RECORD_DELETE_FORBIDDEN: "هذا السجل غير قابل للحذف.",
  ppg_unique_live_idx: "يوجد منح سارٍ بنفس الصلاحية لهذا الموظف.",
  par_unique_pending_idx: "يوجد طلب اعتماد معلّق لنفس العملية.",
  grant_no_self_delegation: "لا يمكنك تفويض نفسك.",
  imp_not_self: "لا يمكنك انتحال حسابك.",
};

function mapDbError(message: string, fallback: string): string {
  for (const [needle, arabic] of Object.entries(DB_MESSAGES)) {
    if (message.includes(needle)) return arabic;
  }
  return fallback;
}
