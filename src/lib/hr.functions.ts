/**
 * دوال خادم وحدة الموارد البشرية (HR) — لوحة إدارة المنصة.
 * تدير سجل موظفي الشركة نفسها (لا علاقة بمكاتب العملاء أو بياناتهم).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { HR_EMPLOYMENT_STATUS, HR_EMPLOYMENT_TYPE, type HrEmployeeRow } from "@/lib/hr.shared";

/* ------------------------------------------------------------------ قائمة الموظفين */

export const listHrEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        departmentId: z.string().uuid().optional(),
        employmentStatus: z.enum(["all", ...HR_EMPLOYMENT_STATUS]).default("all"),
        employmentType: z.enum(["all", ...HR_EMPLOYMENT_TYPE]).default("all"),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.read");
    const db = await g.admin();

    let q = db
      .from("hr_employees")
      .select(
        "id, full_name, email, phone, job_title, department_id, manager_employee_id, staff_id, user_id, employment_status, employment_type, work_location, joined_at, ended_at, notes, created_at, updated_at, platform_departments(name_ar), manager:manager_employee_id(full_name)",
        { count: "exact" },
      )
      .order("full_name", { ascending: true });

    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,job_title.ilike.%${s}%`);
    }
    if (data.departmentId) q = q.eq("department_id", data.departmentId);
    if (data.employmentStatus !== "all") q = q.eq("employment_status", data.employmentStatus);
    if (data.employmentType !== "all") q = q.eq("employment_type", data.employmentType);

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة الموظفين.");

    const list = (rows ?? []).map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      job_title: r.job_title,
      department_id: r.department_id,
      department_name: r.platform_departments?.name_ar ?? null,
      manager_employee_id: r.manager_employee_id,
      manager_full_name: r.manager?.full_name ?? null,
      staff_id: r.staff_id,
      user_id: r.user_id,
      employment_status: r.employment_status,
      employment_type: r.employment_type,
      work_location: r.work_location,
      joined_at: r.joined_at,
      ended_at: r.ended_at,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })) satisfies HrEmployeeRow[];

    return { rows: list, total: count ?? 0 };
  });

export const listHrDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.read");
    const db = await g.admin();
    const { data } = await db
      .from("platform_departments")
      .select("id, name_ar")
      .eq("is_active", true)
      .order("name_ar");
    return { departments: (data ?? []) as { id: string; name_ar: string }[] };
  });

/** حسابات platform_staff غير المرتبطة بعد بسجل موظف، لربطها دون إنشاء دور جديد. */
export const listUnlinkedPlatformStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.read");
    const db = await g.admin();
    const { data: linked } = await db
      .from("hr_employees")
      .select("staff_id")
      .not("staff_id", "is", null);
    const linkedIds = new Set((linked ?? []).map((r: any) => r.staff_id));
    const { data: staff } = await db
      .from("platform_staff")
      .select("id, full_name, email")
      .order("full_name");
    return {
      staff: (staff ?? []).filter((s: any) => !linkedIds.has(s.id)) as {
        id: string;
        full_name: string;
        email: string;
      }[],
    };
  });

export const getHrEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.read");
    const db = await g.admin();
    const { data: row, error } = await db
      .from("hr_employees")
      .select(
        "id, full_name, email, phone, job_title, department_id, manager_employee_id, staff_id, user_id, employment_status, employment_type, work_location, joined_at, ended_at, notes, created_at, updated_at, platform_departments(name_ar), manager:manager_employee_id(full_name)",
      )
      .eq("id", data.employeeId)
      .maybeSingle();
    if (error || !row) throw new Error("الموظف غير موجود.");

    let roles: string[] = [];
    let rbacRole: string | null = null;
    if (row.staff_id) {
      const { data: staffRow } = await db
        .from("platform_staff")
        .select("role, permissions, platform_roles(name_ar, permissions)")
        .eq("id", row.staff_id)
        .maybeSingle();
      if (staffRow) {
        rbacRole = staffRow.platform_roles?.name_ar ?? staffRow.role;
        roles = [...(staffRow.permissions ?? []), ...(staffRow.platform_roles?.permissions ?? [])];
      }
    }

    let sessions: {
      id: string;
      created_at: string | null;
      last_seen_at: string | null;
      ip_address: string | null;
      user_agent: string | null;
      revoked_at: string | null;
    }[] = [];
    if (row.user_id) {
      const { data: sess } = await db
        .from("platform_staff_sessions")
        .select(
          "id, device, browser, os, ip, country, first_seen_at, last_seen_at, revoked_at, revoke_reason",
        )
        .eq("user_id", row.user_id)
        .order("last_seen_at", { ascending: false })
        .limit(50);
      sessions = (sess ?? []) as typeof sessions;
    }

    const { data: audit } = await db
      .from("admin_audit_logs")
      .select("id, action, description, entity_type, entity_id, created_at")
      .eq("actor_email", row.email)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: docs } = await db
      .from("hr_documents")
      .select(
        "id, employee_id, kind, title, storage_path, issued_on, expires_on, notes, uploaded_by, created_at, updated_at",
      )
      .eq("employee_id", data.employeeId)
      .order("created_at", { ascending: false });

    return {
      employee: {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        job_title: row.job_title,
        department_id: row.department_id,
        department_name: row.platform_departments?.name_ar ?? null,
        manager_employee_id: row.manager_employee_id,
        manager_full_name: row.manager?.full_name ?? null,
        staff_id: row.staff_id,
        user_id: row.user_id,
        employment_status: row.employment_status,
        employment_type: row.employment_type,
        work_location: row.work_location,
        joined_at: row.joined_at,
        ended_at: row.ended_at,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies HrEmployeeRow,
      rbacRole,
      permissions: Array.from(new Set(roles)),
      sessions,
      auditLogs: audit ?? [],
      documents: docs ?? [],
    };
  });

const employeeInput = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(160),
  email: z.string().trim().email("بريد إلكتروني غير صالح").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  department_id: z.string().uuid().optional().or(z.literal("")),
  manager_employee_id: z.string().uuid().optional().or(z.literal("")),
  staff_id: z.string().uuid().optional().or(z.literal("")),
  employment_status: z.enum(HR_EMPLOYMENT_STATUS).default("active"),
  employment_type: z.enum(HR_EMPLOYMENT_TYPE).default("full_time"),
  work_location: z.string().trim().max(120).optional().or(z.literal("")),
  joined_at: z.string().trim().max(10).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function normalize(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      typeof v === "string" && v.trim() === "" ? null : v,
    ]),
  );
}

export const createHrEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => employeeInput.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "hr.manage");
    const db = await g.admin();

    const { data: existing } = await db
      .from("hr_employees")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existing) throw new Error("يوجد موظف مسجّل بهذا البريد الإلكتروني مسبقاً.");

    const patch = normalize(data);
    const { data: created, error } = await db
      .from("hr_employees")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء سجل الموظف.");

    await g.writeAudit(db, staff, {
      action: "hr.employee.create",
      entity_type: "hr_employee",
      entity_id: created.id,
      description: `إضافة الموظف ${data.full_name}`,
      after: patch,
    });
    return { ok: true as const, id: created.id as string };
  });

async function assertNoManagerCycle(db: any, employeeId: string, managerId: string | null) {
  if (!managerId) return;
  if (managerId === employeeId) throw new Error("لا يمكن أن يكون الموظف مديره المباشر.");
  let current: string | null = managerId;
  const seen = new Set<string>([employeeId]);
  for (let i = 0; i < 50 && current; i++) {
    if (seen.has(current)) throw new Error("هذا التعيين يُنشئ حلقة في تسلسل الإدارة.");
    seen.add(current);
    const { data: row } = (await db
      .from("hr_employees")
      .select("manager_employee_id")
      .eq("id", current)
      .maybeSingle()) as { data: { manager_employee_id: string | null } | null };
    current = row?.manager_employee_id ?? null;
  }
}

export const updateHrEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    employeeInput.extend({ employeeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "hr.manage");
    const db = await g.admin();
    const { employeeId, ...fields } = data;

    const { data: before } = await db
      .from("hr_employees")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();
    if (!before) throw new Error("الموظف غير موجود.");

    const { data: dup } = await db
      .from("hr_employees")
      .select("id")
      .eq("email", fields.email)
      .neq("id", employeeId)
      .maybeSingle();
    if (dup) throw new Error("يوجد موظف آخر مسجّل بهذا البريد الإلكتروني.");

    await assertNoManagerCycle(db, employeeId, fields.manager_employee_id || null);

    const patch = normalize(fields);
    const { error } = await db.from("hr_employees").update(patch).eq("id", employeeId);
    if (error) throw new Error("تعذّر تحديث بيانات الموظف.");

    await g.writeAudit(db, staff, {
      action: "hr.employee.update",
      entity_type: "hr_employee",
      entity_id: employeeId,
      description: `تعديل بيانات الموظف ${fields.full_name}`,
      before: {
        full_name: before.full_name,
        email: before.email,
        department_id: before.department_id,
      },
      after: patch,
    });
    return { ok: true as const };
  });

export const terminateHrEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        reason: z.string().trim().min(5, "اذكر سبب إنهاء الخدمة").max(500),
        endedAt: z.string().trim().min(4).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "hr.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("hr_employees")
      .select("id, full_name, employment_status, notes")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!before) throw new Error("الموظف غير موجود.");

    const note = `${before.notes ? before.notes + "\n" : ""}[إنهاء خدمة ${data.endedAt}] ${data.reason}`;
    const { error } = await db
      .from("hr_employees")
      .update({ employment_status: "terminated", ended_at: data.endedAt, notes: note })
      .eq("id", data.employeeId);
    if (error) throw new Error("تعذّر تسجيل إنهاء الخدمة.");

    await g.writeAudit(db, staff, {
      action: "hr.employee.terminate",
      entity_type: "hr_employee",
      entity_id: data.employeeId,
      description: `إنهاء خدمة ${before.full_name}: ${data.reason}`,
      before: { employment_status: before.employment_status },
      after: { employment_status: "terminated", ended_at: data.endedAt },
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ المستندات */

export const listHrDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.documents.read");
    const db = await g.admin();
    const { data: rows } = await db
      .from("hr_documents")
      .select(
        "id, employee_id, kind, title, storage_path, issued_on, expires_on, notes, uploaded_by, created_at, updated_at",
      )
      .eq("employee_id", data.employeeId)
      .order("created_at", { ascending: false });
    return { documents: rows ?? [] };
  });

const documentInput = z.object({
  employeeId: z.string().uuid(),
  kind: z.string().trim().min(2).max(60),
  title: z.string().trim().min(2).max(160),
  storagePath: z.string().trim().max(300).optional().or(z.literal("")),
  issuedOn: z.string().trim().max(10).optional().or(z.literal("")),
  expiresOn: z.string().trim().max(10).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createHrDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentInput.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "hr.manage");
    const db = await g.admin();
    const { error, data: created } = await db
      .from("hr_documents")
      .insert({
        employee_id: data.employeeId,
        kind: data.kind,
        title: data.title,
        storage_path: data.storagePath || null,
        issued_on: data.issuedOn || null,
        expires_on: data.expiresOn || null,
        notes: data.notes || null,
        uploaded_by: staff.user_id,
      })
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إضافة المستند.");
    await g.writeAudit(db, staff, {
      action: "hr.document.create",
      entity_type: "hr_document",
      entity_id: created.id,
      description: `إضافة مستند «${data.title}» للموظف`,
    });
    return { ok: true as const };
  });

export const deleteHrDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "hr.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("hr_documents")
      .select("id, title, employee_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!before) throw new Error("المستند غير موجود.");
    const { error } = await db.from("hr_documents").delete().eq("id", data.documentId);
    if (error) throw new Error("تعذّر حذف المستند.");
    await g.writeAudit(db, staff, {
      action: "hr.document.delete",
      entity_type: "hr_document",
      entity_id: data.documentId,
      description: `حذف مستند «${before.title}»`,
      before,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ تصدير CSV */

export const exportHrEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "hr.read");
    const db = await g.admin();
    const { data: rows } = await db
      .from("hr_employees")
      .select(
        "full_name, email, phone, job_title, employment_status, employment_type, joined_at, ended_at, platform_departments(name_ar)",
      )
      .order("full_name");
    return {
      rows: (rows ?? []).map((r: any) => ({
        full_name: r.full_name,
        email: r.email,
        phone: r.phone ?? "",
        job_title: r.job_title ?? "",
        department: r.platform_departments?.name_ar ?? "",
        employment_status: r.employment_status,
        employment_type: r.employment_type,
        joined_at: r.joined_at ?? "",
        ended_at: r.ended_at ?? "",
      })),
    };
  });
