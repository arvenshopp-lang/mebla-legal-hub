import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ------------------------------------------------------------------ helpers */

type Guard = typeof import("@/lib/admin-guard.server");
const guard = (): Promise<Guard> => import("@/lib/admin-guard.server");

/* ------------------------------------------------------- subscriber lookup */

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح") });

export const lookupSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => emailSchema.parse(input))
  .handler(async ({ data, context }) => {
    await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (!profile) return { found: false as const };
    const { data: org } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, organizations(name)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    return {
      found: true as const,
      userId: profile.id,
      fullName: profile.full_name,
      email: profile.email ?? data.email,
      organizationId: org?.organization_id ?? null,
      organizationName: (org as { organizations?: { name?: string } } | null)?.organizations?.name ?? null,
    };
  });

/* ------------------------------------------------- subscription activation */

const activateSchema = z.object({
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح"),
  planCode: z.string().trim().min(1, "اختر الباقة"),
  planLabel: z.string().trim().min(1),
  amount: z.number().min(0, "المبلغ غير صالح"),
  currency: z.string().trim().min(1).default("SAR"),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  note: z.string().trim().max(500).optional().nullable(),
});

export const activateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (!profile) {
      return { ok: false as const, reason: "not_registered" as const };
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.");
    }

    const { data: org } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const { data: plan } = await supabaseAdmin
      .from("platform_plans")
      .select("id")
      .eq("code", data.planCode)
      .maybeSingle();

    // أي اشتراك نشط سابق يُعتبر مستبدلاً بالاشتراك الجديد.
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", profile.id)
      .eq("status", "active");

    const { data: created, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: profile.id,
        email: profile.email ?? data.email,
        organization_id: org?.organization_id ?? null,
        plan_id: plan?.id ?? null,
        plan_code: data.planCode,
        plan_label: data.planLabel,
        amount: data.amount,
        currency: data.currency,
        billing_note: data.note ?? null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "active",
        created_by: staff.user_id,
      })
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء الاشتراك.");

    await (await guard()).writeAudit(context.supabase, staff, {
      action: "subscription.activate",
      entity_type: "subscription",
      entity_id: created.id,
      description: `تفعيل ${data.planLabel} للمشترك ${profile.email ?? data.email}`,
      metadata: { amount: data.amount, currency: data.currency, ends_at: endsAt.toISOString() },
    });

    // فاتورة تلقائية لكل تفعيل مدفوع حتى يظهر السجل للمشترك.
    if (data.amount > 0) {
      const stamp = new Date();
      const number = `MEH-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}-${created.id
        .slice(0, 6)
        .toUpperCase()}`;
      await supabaseAdmin.from("invoices").insert({
        organization_id: org?.organization_id ?? null,
        subscription_id: created.id,
        user_id: profile.id,
        number,
        amount: data.amount,
        currency: data.currency,
        status: "paid",
        payment_method: "تحويل بنكي",
        paid_at: stamp.toISOString(),
        issued_at: stamp.toISOString(),
        notes: data.note ?? null,
      });
    }

    return {
      ok: true as const,
      subscriptionId: created.id,
      subscriberName: profile.full_name,
      email: profile.email ?? data.email,
    };
  });

const cancelSchema = z.object({ id: z.string().uuid() });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { error } = await context.supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إلغاء الاشتراك.");
    await (await guard()).writeAudit(context.supabase, staff, {
      action: "subscription.cancel",
      entity_type: "subscription",
      entity_id: data.id,
    });
    return { ok: true as const };
  });

/* -------------------------------------------- suspend / resume / auto-renew */

const suspendSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "اذكر سبب الإيقاف").max(300),
});

export const suspendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => suspendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { error } = await context.supabase
      .from("subscriptions")
      .update({
        suspended_at: new Date().toISOString(),
        suspension_reason: data.reason,
        last_modified_by: staff.user_id,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إيقاف الاشتراك.");
    await (await guard()).writeAudit(context.supabase, staff, {
      action: "subscription.suspend",
      entity_type: "subscription",
      entity_id: data.id,
      description: `إيقاف الاشتراك: ${data.reason}`,
    });
    return { ok: true as const };
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { error } = await context.supabase
      .from("subscriptions")
      .update({
        suspended_at: null,
        suspension_reason: null,
        last_modified_by: staff.user_id,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إعادة تفعيل الاشتراك.");
    await (await guard()).writeAudit(context.supabase, staff, {
      action: "subscription.resume",
      entity_type: "subscription",
      entity_id: data.id,
    });
    return { ok: true as const };
  });

export const setSubscriptionAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), autoRenew: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { error } = await context.supabase
      .from("subscriptions")
      .update({
        auto_renew: data.autoRenew,
        last_modified_by: staff.user_id,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث التجديد التلقائي.");
    await (await guard()).writeAudit(context.supabase, staff, {
      action: "subscription.auto_renew",
      entity_type: "subscription",
      entity_id: data.id,
      metadata: { auto_renew: data.autoRenew },
    });
    return { ok: true as const };
  });

/**
 * Operational detail for the admin table: plan limits, real usage and the last
 * editor. Deliberately excludes any case, document or client content.
 */
export const getSubscriptionAdminDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    await (await guard()).requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, email, plan_code, plan_label, status, amount, currency, starts_at, ends_at, auto_renew, suspended_at, suspension_reason, cancelled_at, last_modified_at, last_modified_by, organization_id, activation_method",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!sub) throw new Error("الاشتراك غير موجود.");

    const [{ data: plan }, { data: editor }] = await Promise.all([
      supabaseAdmin
        .from("platform_plans")
        .select("name_ar, max_users, max_cases, max_clients, max_documents, storage_gb, ocr_pages_monthly")
        .eq("code", sub.plan_code)
        .maybeSingle(),
      sub.last_modified_by
        ? supabaseAdmin.from("profiles").select("full_name").eq("id", sub.last_modified_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let usage = { users: 0, cases: 0, clients: 0, documents: 0, storage_bytes: 0 };
    let organizationName: string | null = null;
    if (sub.organization_id) {
      const [members, cases, clients, docs, org] = await Promise.all([
        supabaseAdmin
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", sub.organization_id)
          .neq("status", "suspended"),
        supabaseAdmin.from("cases").select("id", { count: "exact", head: true }).eq("organization_id", sub.organization_id),
        supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", sub.organization_id),
        supabaseAdmin.from("documents").select("file_size").eq("organization_id", sub.organization_id),
        supabaseAdmin.from("organizations").select("name").eq("id", sub.organization_id).maybeSingle(),
      ]);
      const files = (docs.data ?? []) as { file_size: number | null }[];
      usage = {
        users: members.count ?? 0,
        cases: cases.count ?? 0,
        clients: clients.count ?? 0,
        documents: files.length,
        storage_bytes: files.reduce((sum, f) => sum + (f.file_size ?? 0), 0),
      };
      organizationName = org.data?.name ?? null;
    }

    return {
      subscription: sub,
      plan: plan ?? null,
      usage,
      organizationName,
      lastModifiedByName: (editor as { full_name?: string } | null)?.full_name ?? null,
    };
  });

/* -------------------------------------------------------- staff management */

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح"),
  fullName: z.string().trim().min(2, "الاسم مطلوب").max(120),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["super_admin", "staff"]),
  permissions: z.array(z.string()).max(40),
});

export const createStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "staff.manage");
    if (data.role === "super_admin" && staff.role !== "super_admin") {
      throw new Error("لا يمكن منح صلاحية مالك المنصة إلا من مالك المنصة.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (!profile) return { ok: false as const, reason: "not_registered" as const };

    const { error } = await supabaseAdmin.from("platform_staff").upsert(
      {
        user_id: profile.id,
        full_name: data.fullName,
        email: profile.email ?? data.email,
        job_title: data.jobTitle ?? null,
        role: data.role,
        status: "active",
        permissions: data.permissions,
        created_by: staff.user_id,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("تعذّر حفظ بيانات الموظف.");

    await (await guard()).writeAudit(context.supabase, staff, {
      action: "staff.upsert",
      entity_type: "platform_staff",
      description: `إضافة/تحديث الموظف ${data.email}`,
      metadata: { role: data.role, permissions: data.permissions },
    });
    return { ok: true as const };
  });

const staffUpdateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["super_admin", "staff"]),
  status: z.enum(["active", "suspended"]),
  permissions: z.array(z.string()).max(40),
});

export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "staff.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("platform_staff")
      .select("id, user_id, role, email")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) throw new Error("الموظف غير موجود.");
    if (staff.role !== "super_admin" && (target.role === "super_admin" || data.role === "super_admin")) {
      throw new Error("لا يمكن تعديل صلاحيات مالك المنصة إلا من مالك المنصة.");
    }
    if (target.user_id === staff.user_id && (data.status !== "active" || data.role !== staff.role)) {
      throw new Error("لا يمكنك تعديل دورك أو إيقاف حسابك بنفسك.");
    }

    const { error } = await supabaseAdmin
      .from("platform_staff")
      .update({
        full_name: data.fullName,
        job_title: data.jobTitle ?? null,
        role: data.role,
        status: data.status,
        permissions: data.permissions,
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث بيانات الموظف.");

    await (await guard()).writeAudit(context.supabase, staff, {
      action: "staff.update",
      entity_type: "platform_staff",
      entity_id: data.id,
      description: `تحديث صلاحيات ${target.email}`,
      metadata: { role: data.role, status: data.status, permissions: data.permissions },
    });
    return { ok: true as const };
  });

/* --------------------------------------------------------- support replies */

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(2, "نص الرد مطلوب").max(5000),
  status: z.enum(["new", "awaiting_reply", "in_progress", "closed"]),
});

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => replySchema.parse(input))
  .handler(async ({ data, context }) => {
    const staff = await (await guard()).requireStaff(context.supabase, context.userId, "tickets.reply");

    const { error: msgError } = await context.supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticketId,
      author_id: staff.user_id,
      author_name: staff.full_name,
      is_staff: true,
      body: data.body,
    });
    if (msgError) throw new Error("تعذّر حفظ الرد.");

    const { error: ticketError } = await context.supabase
      .from("support_tickets")
      .update({
        status: data.status,
        last_reply_at: new Date().toISOString(),
        assigned_to: staff.user_id,
        closed_at: data.status === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", data.ticketId);
    if (ticketError) throw new Error("تعذّر تحديث حالة التذكرة.");

    await (await guard()).writeAudit(context.supabase, staff, {
      action: "ticket.reply",
      entity_type: "support_ticket",
      entity_id: data.ticketId,
      metadata: { status: data.status },
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------ platform overview */

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // لوحة المؤشرات متاحة لأي موظف نشط في إدارة المنصة.
    const { data: me } = await context.supabase
      .from("platform_staff")
      .select("status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me || me.status !== "active") throw new Error("ليس لديك وصول إلى لوحة إدارة المنصة.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const count = async (table: string, build: (q: any) => any) => {
      const { count: c } = await build(db.from(table).select("*", { count: "exact", head: true }));
      return (c as number | null) ?? 0;
    };

    const [totalSubs, activeSubs, expiredSubs, expiringSoon, openTickets, closedTickets, orgs, newUsers] =
      await Promise.all([
        count("subscriptions", (q) => q),
        count("subscriptions", (q) => q.eq("status", "active").gt("ends_at", now.toISOString())),
        count("subscriptions", (q) => q.lte("ends_at", now.toISOString())),
        count("subscriptions", (q) => q.eq("status", "active").gt("ends_at", now.toISOString()).lte("ends_at", in14Days)),
        count("support_tickets", (q) => q.neq("status", "closed")),
        count("support_tickets", (q) => q.eq("status", "closed")),
        count("organizations", (q) => q.eq("is_active", true)),
        count("profiles", (q) => q.gte("created_at", monthStart)),
      ]);

    const { data: monthRevenueRows } = await db
      .from("subscriptions")
      .select("amount")
      .gte("created_at", monthStart)
      .neq("status", "cancelled");
    const { data: yearRevenueRows } = await db
      .from("subscriptions")
      .select("amount")
      .gte("created_at", yearStart)
      .neq("status", "cancelled");
    const sum = (rows: { amount: number | string }[] | null) =>
      (rows ?? []).reduce((t, r) => t + Number(r.amount ?? 0), 0);

    const { data: recentSignups } = await db
      .from("profiles")
      .select("id, full_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(6);
    const { data: recentSubs } = await db
      .from("subscriptions")
      .select("id, email, plan_label, amount, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    return {
      stats: {
        totalSubs,
        activeSubs,
        expiredSubs,
        expiringSoon,
        openTickets,
        closedTickets,
        organizations: orgs,
        newUsers,
        monthRevenue: sum(monthRevenueRows as never),
        yearRevenue: sum(yearRevenueRows as never),
      },
      recentSignups: recentSignups ?? [],
      recentSubs: recentSubs ?? [],
    };
  });
/* ------------------------------------------- تمديد / تعليق / إعادة تفعيل الاشتراك */

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(3650) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("subscriptions")
      .select("id, email, plan_label, ends_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الاشتراك غير موجود.");
    const base = new Date(before.ends_at);
    const from = base.getTime() > Date.now() ? base : new Date();
    const ends = new Date(from.getTime() + data.days * 86400_000).toISOString();
    const { error } = await db
      .from("subscriptions")
      .update({ ends_at: ends, status: "active", cancelled_at: null })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تمديد الاشتراك.");
    await g.writeAudit(db, staff, {
      action: "subscription.extend",
      entity_type: "subscription",
      entity_id: data.id,
      description: `تمديد اشتراك ${before.email} بمقدار ${data.days} يوماً`,
      before: { ends_at: before.ends_at, status: before.status },
      after: { ends_at: ends, status: "active" },
    });
    return { ok: true as const };
  });

export const setSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "expired", "cancelled", "trial"]),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "subscriptions.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("subscriptions")
      .select("id, email, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الاشتراك غير موجود.");
    const { error } = await db
      .from("subscriptions")
      .update({
        status: data.status,
        cancelled_at: data.status === "cancelled" ? new Date().toISOString() : null,
        billing_note: data.note ?? undefined,
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث حالة الاشتراك.");
    await g.writeAudit(db, staff, {
      action: "subscription.status",
      entity_type: "subscription",
      entity_id: data.id,
      description: `تغيير حالة اشتراك ${before.email} إلى ${data.status}`,
      before: { status: before.status },
      after: { status: data.status, note: data.note ?? null },
    });
    return { ok: true as const };
  });

export const getRevenueSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "revenue.read");
    const db = await g.admin();
    const { data, error } = await db.rpc("admin_revenue_summary");
    if (error) throw new Error("تعذّر جلب التقارير المالية.");
    return data as {
      today: number; week: number; month: number; year: number; total: number; active_count: number;
      by_plan: { label: string; count: number; amount: number }[];
      by_month: { month: string; amount: number; count: number }[];
      by_organization: { label: string; amount: number; count: number }[];
    };
  });

/* --------------------------------------------- مؤشرات المنصة (نطاق زمني حقيقي) */

export const getPlatformMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    await g.requireActiveStaff(context.supabase, context.userId);
    const { data: metrics, error } = await context.supabase.rpc("admin_platform_metrics", {
      _from: data.from,
      _to: data.to,
    });
    if (error) throw new Error("تعذّر حساب مؤشرات المنصة.");
    return metrics as unknown as import("@/lib/admin-metrics.shared").PlatformMetrics;
  });
