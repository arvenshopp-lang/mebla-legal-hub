/**
 * عمليات تشغيل المنصة: الإعدادات، البريد وقوالبه، الإشعارات الجماعية،
 * SEO، مراقبة النظام، سجل التدقيق، والأدوار المخصصة.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCsv } from "@/lib/csv";
import { z } from "zod";

type Guard = typeof import("@/lib/admin-guard.server");
const guard = (): Promise<Guard> => import("@/lib/admin-guard.server");

/* ------------------------------------------------------------- الإعدادات العامة */

export const getPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireActiveStaff(context.supabase, context.userId);
    const db = await g.admin();
    const { data } = await db.from("platform_settings").select("key, value, is_public");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: Record<string, any> = {};
    for (const row of (data ?? []) as { key: string; value: unknown }[]) map[row.key] = row.value;
    return { settings: map };
  });

const settingsPayload = z.object({
  group: z.enum(["general", "seo", "email"]),

  values: z.record(z.string(), z.any()),
});

export const savePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsPayload.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const permission =
      data.group === "seo"
        ? "seo.manage"
        : data.group === "email"
          ? "email.manage"
          : "platform_settings.manage";
    const staff = await g.requireStaff(context.supabase, context.userId, permission);
    const db = await g.admin();

    const keys = Object.keys(data.values);
    const { data: beforeRows } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", keys);
    const before = Object.fromEntries(
      ((beforeRows ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]),
    );

    for (const [key, value] of Object.entries(data.values)) {
      const { error } = await db.from("platform_settings").upsert(
        {
          key,
          value: value as never,
          is_public: data.group === "seo" || data.group === "general",
          updated_by: staff.user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw new Error("تعذّر حفظ الإعدادات.");
    }

    await g.writeAudit(db, staff, {
      action: `settings.${data.group}.update`,
      entity_type: "platform_settings",
      description: `تحديث إعدادات ${data.group === "seo" ? "SEO" : data.group === "email" ? "البريد" : "المنصة"}`,
      before,
      after: data.values,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------- قوالب البريد */

export const listEmailTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { data } = await db
      .from("platform_email_templates")
      .select("id, code, name_ar, subject, body_html, is_active, updated_at")
      .order("name_ar");
    return {
      templates: (data ?? []) as {
        id: string;
        code: string;
        name_ar: string;
        subject: string;
        body_html: string;
        is_active: boolean;
        updated_at: string;
      }[],
    };
  });

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z
          .string()
          .trim()
          .regex(/^[a-z0-9_.-]{2,60}$/, "رمز القالب يجب أن يكون إنجليزياً صغيراً"),
        name_ar: z.string().trim().min(2, "اسم القالب مطلوب").max(120),
        subject: z.string().trim().min(2, "عنوان الرسالة مطلوب").max(200),
        body_html: z.string().trim().min(10, "محتوى الرسالة قصير جداً").max(50_000),
        is_active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { data: before } = data.id
      ? await db.from("platform_email_templates").select("*").eq("id", data.id).maybeSingle()
      : { data: null };
    const { error } = await db.from("platform_email_templates").upsert(
      {
        ...(data.id ? { id: data.id } : {}),
        code: data.code,
        name_ar: data.name_ar,
        subject: data.subject,
        body_html: data.body_html,
        is_active: data.is_active,
        updated_by: staff.user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    );
    if (error) throw new Error("تعذّر حفظ القالب. تأكد أن رمز القالب غير مستخدم.");
    await g.writeAudit(db, staff, {
      action: before ? "email_template.update" : "email_template.create",
      entity_type: "email_template",
      entity_id: data.id ?? null,
      description: `${before ? "تعديل" : "إنشاء"} قالب البريد ${data.name_ar}`,
      before: before ? { subject: before.subject, is_active: before.is_active } : null,
      after: { subject: data.subject, is_active: data.is_active },
    });
    return { ok: true as const };
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("platform_email_templates")
      .select("code, name_ar")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.from("platform_email_templates").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف القالب.");
    await g.writeAudit(db, staff, {
      action: "email_template.delete",
      entity_type: "email_template",
      entity_id: data.id,
      description: `حذف قالب البريد ${before?.name_ar ?? data.id}`,
      before,
      after: null,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------- الإشعارات الجماعية */

const broadcastSchema = z.object({
  audience: z.enum(["all_users", "organization", "user", "subscribers", "expired"]),
  targetUserEmail: z.string().trim().toLowerCase().max(255).optional(),
  targetOrganizationId: z.string().uuid().optional(),
  title: z.string().trim().min(3, "عنوان الإشعار مطلوب").max(160),
  body: z.string().trim().min(5, "نص الإشعار مطلوب").max(2000),
  inApp: z.boolean().default(true),
});

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => broadcastSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "notifications.send");
    const db = await g.admin();

    let recipients: { user_id: string; organization_id: string }[] = [];
    if (data.audience === "user") {
      if (!data.targetUserEmail) throw new Error("أدخل بريد المستخدم المستهدف.");
      const { data: profile } = await db
        .from("profiles")
        .select("id")
        .ilike("email", data.targetUserEmail)
        .maybeSingle();
      if (!profile) throw new Error("لا يوجد مستخدم بهذا البريد.");
      const { data: m } = await db
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", profile.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!m) throw new Error("هذا المستخدم غير مرتبط بمكتب، ولا يمكن إرسال إشعار داخلي له.");
      recipients = [{ user_id: profile.id, organization_id: m.organization_id }];
    } else if (data.audience === "organization") {
      if (!data.targetOrganizationId) throw new Error("اختر المكتب المستهدف.");
      const { data: rows } = await db
        .from("organization_members")
        .select("user_id, organization_id")
        .eq("organization_id", data.targetOrganizationId)
        .eq("status", "active");
      recipients = (rows ?? []) as typeof recipients;
    } else {
      const { data: rows } = await db
        .from("organization_members")
        .select("user_id, organization_id")
        .eq("status", "active");
      let list = (rows ?? []) as typeof recipients;
      if (data.audience === "subscribers" || data.audience === "expired") {
        const { data: subs } = await db.from("subscriptions").select("user_id, status");
        const active = new Set(
          ((subs ?? []) as { user_id: string; status: string }[])
            .filter((s) => s.status === "active")
            .map((s) => s.user_id),
        );
        list = list.filter((r) =>
          data.audience === "subscribers" ? active.has(r.user_id) : !active.has(r.user_id),
        );
      }
      recipients = list;
    }

    if (recipients.length === 0) throw new Error("لا يوجد مستلمون مطابقون لهذا الاستهداف.");

    if (data.inApp) {
      const chunk = 500;
      for (let i = 0; i < recipients.length; i += chunk) {
        const rows = recipients.slice(i, i + chunk).map((r) => ({
          organization_id: r.organization_id,
          user_id: r.user_id,
          type: "platform_broadcast",
          title: data.title,
          message: data.body,
        }));
        const { error } = await db.from("notifications").insert(rows);
        if (error) throw new Error("تعذّر إرسال الإشعارات الداخلية.");
      }
    }

    const { error: bErr } = await db.from("platform_broadcasts").insert({
      audience: data.audience,
      target_organization_id: data.targetOrganizationId ?? null,
      title: data.title,
      body: data.body,
      channels: data.inApp ? ["in_app"] : [],
      recipients_count: recipients.length,
      sent_by: staff.user_id,
      sent_by_name: staff.full_name,
    });
    if (bErr) throw new Error("تم الإرسال لكن تعذّر تسجيل العملية.");

    await g.writeAudit(db, staff, {
      action: "notification.broadcast",
      entity_type: "broadcast",
      description: `إرسال إشعار «${data.title}» إلى ${recipients.length} مستخدماً`,
      after: { audience: data.audience, recipients: recipients.length },
    });
    return { ok: true as const, recipients: recipients.length };
  });

export const listBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "notifications.send");
    const db = await g.admin();
    const { data } = await db
      .from("platform_broadcasts")
      .select("id, audience, title, body, recipients_count, sent_by_name, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      broadcasts: (data ?? []) as {
        id: string;
        audience: string;
        title: string;
        body: string;
        recipients_count: number;
        sent_by_name: string | null;
        created_at: string;
      }[],
    };
  });

/* ------------------------------------------------------------- مراقبة النظام */

export const getSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "monitoring.read");
    const db = await g.admin();

    const t0 = Date.now();
    const { error: dbErr } = await db.from("platform_settings").select("key").limit(1);
    const dbLatency = Date.now() - t0;

    const t1 = Date.now();
    const { error: storageErr } = await db.storage.from("documents").list("", { limit: 1 });
    const storageLatency = Date.now() - t1;

    const { count: docCount } = await db
      .from("documents")
      .select("id", { count: "exact", head: true });
    const { data: sizes } = await db.from("documents").select("file_size").limit(5000);
    const storageBytes = ((sizes ?? []) as { file_size: number | null }[]).reduce(
      (t, r) => t + Number(r.file_size ?? 0),
      0,
    );

    const { count: orgCount } = await db
      .from("organizations")
      .select("id", { count: "exact", head: true });
    const { count: userCount } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const { data: lastAudit } = await db
      .from("admin_audit_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      database: { ok: !dbErr, latencyMs: dbLatency },
      storage: {
        ok: !storageErr,
        latencyMs: storageLatency,
        documents: docCount ?? 0,
        bytes: storageBytes,
      },
      platform: { organizations: orgCount ?? 0, users: userCount ?? 0 },
      lastAuditAt: lastAudit?.created_at ?? null,
      checkedAt: new Date().toISOString(),
    };
  });

/* ------------------------------------------------------------- سجل التدقيق */

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        action: z.string().trim().max(60).default(""),
        entity: z.string().trim().max(60).default(""),
        actor: z.string().trim().max(160).default(""),
        from: z.string().trim().max(40).default(""),
        to: z.string().trim().max(40).default(""),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "audit.read");
    const db = await g.admin();
    let q = db
      .from("admin_audit_logs")
      .select(
        "id, actor_email, action, entity_type, entity_id, description, metadata, before_data, after_data, ip, device, browser, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);
    if (data.search)
      q = q.or(`description.ilike.%${data.search}%,entity_type.ilike.%${data.search}%`);
    if (data.action) q = q.eq("action", data.action);
    if (data.entity) q = q.eq("entity_type", data.entity);
    if (data.actor) q = q.ilike("actor_email", `%${data.actor}%`);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(`${data.to}T23:59:59`).toISOString());
    const { data: rows, count, error } = await q;
    if (error) throw new Error("تعذّر جلب سجل التدقيق.");
    return { rows: (rows ?? []) as AuditLogRow[], total: count ?? 0 };
  });

export type AuditLogRow = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before_data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after_data: any;
  ip: string | null;
  device: string | null;
  browser: string | null;
  created_at: string;
};

export const exportAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        action: z.string().trim().max(60).default(""),
        entity: z.string().trim().max(60).default(""),
        actor: z.string().trim().max(160).default(""),
        from: z.string().trim().max(40).default(""),
        to: z.string().trim().max(40).default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "audit.export");
    const db = await g.admin();
    let q = db
      .from("admin_audit_logs")
      .select(
        "created_at, actor_email, action, entity_type, entity_id, description, ip, device, browser",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.search)
      q = q.or(`description.ilike.%${data.search}%,entity_type.ilike.%${data.search}%`);
    if (data.action) q = q.eq("action", data.action);
    if (data.entity) q = q.eq("entity_type", data.entity);
    if (data.actor) q = q.ilike("actor_email", `%${data.actor}%`);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(`${data.to}T23:59:59`).toISOString());
    const { data: rows, error } = await q;
    if (error) throw new Error("تعذّر تصدير سجل التدقيق.");
    const csv = buildCsv(
      ["التاريخ", "المنفّذ", "العملية", "النوع", "المعرّف", "الوصف", "IP", "الجهاز", "المتصفح"],
      ((rows ?? []) as Record<string, unknown>[]).map((r) => [
        r.created_at,
        r.actor_email,
        r.action,
        r.entity_type,
        r.entity_id,
        r.description,
        r.ip,
        r.device,
        r.browser,
      ]),
    );
    await g.writeAudit(db, staff, {
      action: "audit.export",
      entity_type: "audit",
      description: `تصدير ${(rows ?? []).length} سجلاً من سجل التدقيق`,
    });
    return { csv };
  });

export const listAuditFacets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "audit.read");
    const db = await g.admin();
    const { data: rows, error } = await db
      .from("admin_audit_logs")
      .select("action, entity_type")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error("تعذّر جلب عوامل تصفية سجل التدقيق.");
    const actions = new Set<string>();
    const entities = new Set<string>();
    for (const r of (rows ?? []) as { action: string; entity_type: string }[]) {
      if (r.action) actions.add(r.action);
      if (r.entity_type) entities.add(r.entity_type);
    }
    return {
      actions: [...actions].sort(),
      entities: [...entities].sort(),
    };
  });

/* ---------------------------------------------------------- الأدوار المخصصة */

export const listPlatformRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "staff.view");
    const db = await g.admin();
    const { data } = await db
      .from("platform_roles")
      .select("id, code, name_ar, description, permissions, is_system")
      .order("is_system", { ascending: false })
      .order("name_ar");
    const { data: staffRows } = await db.from("platform_staff").select("role_id");
    const counts = new Map<string, number>();
    for (const r of (staffRows ?? []) as { role_id: string | null }[]) {
      if (r.role_id) counts.set(r.role_id, (counts.get(r.role_id) ?? 0) + 1);
    }
    return {
      roles: (
        (data ?? []) as {
          id: string;
          code: string;
          name_ar: string;
          description: string | null;
          permissions: string[] | null;
          is_system: boolean;
        }[]
      ).map((r) => ({ ...r, permissions: r.permissions ?? [], members: counts.get(r.id) ?? 0 })),
    };
  });

export const savePlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z
          .string()
          .trim()
          .regex(/^[a-z0-9_]{2,40}$/, "رمز الدور يجب أن يكون إنجليزياً صغيراً"),
        name_ar: z.string().trim().min(2, "اسم الدور مطلوب").max(80),
        description: z.string().trim().max(300).optional().or(z.literal("")),
        permissions: z.array(z.string()).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "roles.manage");
    const db = await g.admin();
    if (data.id) {
      const { data: before } = await db
        .from("platform_roles")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (before?.is_system) throw new Error("لا يمكن تعديل دور نظامي.");
      const { error } = await db
        .from("platform_roles")
        .update({
          name_ar: data.name_ar,
          description: data.description || null,
          permissions: data.permissions,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw new Error("تعذّر تحديث الدور.");
      await g.writeAudit(db, staff, {
        action: "role.update",
        entity_type: "platform_role",
        entity_id: data.id,
        description: `تعديل الدور ${data.name_ar}`,
        before: { permissions: before?.permissions },
        after: { permissions: data.permissions },
      });
    } else {
      const { data: created, error } = await db
        .from("platform_roles")
        .insert({
          code: data.code,
          name_ar: data.name_ar,
          description: data.description || null,
          permissions: data.permissions,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error("تعذّر إنشاء الدور. تأكد أن الرمز غير مستخدم.");
      await g.writeAudit(db, staff, {
        action: "role.create",
        entity_type: "platform_role",
        entity_id: created?.id ?? null,
        description: `إنشاء الدور ${data.name_ar}`,
        after: { permissions: data.permissions },
      });
    }
    return { ok: true as const };
  });

export const deletePlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "roles.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("platform_roles")
      .select("name_ar, is_system")
      .eq("id", data.id)
      .maybeSingle();
    if (before?.is_system) throw new Error("لا يمكن حذف دور نظامي.");
    const { count } = await db
      .from("platform_staff")
      .select("id", { count: "exact", head: true })
      .eq("role_id", data.id);
    if ((count ?? 0) > 0) throw new Error("الدور مرتبط بموظفين. انقلهم إلى دور آخر أولاً.");
    const { error } = await db.from("platform_roles").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف الدور.");
    await g.writeAudit(db, staff, {
      action: "role.delete",
      entity_type: "platform_role",
      entity_id: data.id,
      description: `حذف الدور ${before?.name_ar ?? data.id}`,
      before,
      after: null,
    });
    return { ok: true as const };
  });
