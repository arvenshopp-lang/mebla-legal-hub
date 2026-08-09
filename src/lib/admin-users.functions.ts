/**
 * إدارة المستخدمين من لوحة إدارة المنصة.
 * كل دالة تتحقق من الصلاحية على الخادم ثم تكتب سجل تدقيق (قبل/بعد).
 * لا تصل أي دالة هنا إلى القضايا أو المستندات أو ملفات العملاء.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const listSchema = z.object({
  search: z.string().trim().max(120).optional().default(""),
  status: z
    .enum(["all", "active", "suspended", "no_org", "subscribed", "unsubscribed"])
    .default("all"),
  sort: z.enum(["created_desc", "created_asc", "name_asc"]).default("created_desc"),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

export type AdminUserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  organization_id: string | null;
  organization_name: string | null;
  org_member_count: number;
  plan_code: string | null;
  plan_label: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  is_platform_staff: boolean;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
};

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "users.read");
    const db = await g.admin();

    const { data: rows, error } = await db.rpc("admin_user_directory", {
      _search: data.search || undefined,
      _status: data.status,
      _sort: data.sort,
      _limit: data.pageSize,
      _offset: (data.page - 1) * data.pageSize,
    });
    if (error) throw new Error("تعذّر جلب قائمة المستخدمين.");

    const list = (rows ?? []) as (Omit<AdminUserRow, "last_sign_in_at" | "email_confirmed"> & {
      total_count: number;
    })[];

    const enriched: AdminUserRow[] = await Promise.all(
      list.map(async (r) => {
        let lastSignIn: string | null = null;
        let confirmed = false;
        try {
          const { data: authUser } = await db.auth.admin.getUserById(r.id);
          lastSignIn = authUser?.user?.last_sign_in_at ?? null;
          confirmed = Boolean(authUser?.user?.email_confirmed_at ?? authUser?.user?.confirmed_at);
        } catch {
          /* بيانات الدخول غير متاحة لهذا المستخدم */
        }
        return { ...r, last_sign_in_at: lastSignIn, email_confirmed: confirmed };
      }),
    );

    return { rows: enriched, total: Number(list[0]?.total_count ?? 0) };
  });

/* ------------------------------------------------------------- الحالة والحذف */

const toggleSchema = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => toggleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "users.update");
    if (data.userId === context.userId) throw new Error("لا يمكنك إيقاف حسابك بنفسك.");
    const db = await g.admin();

    const { data: before } = await db
      .from("profiles")
      .select("id, email, is_active")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) throw new Error("المستخدم غير موجود.");

    const { error } = await db
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (error) throw new Error("تعذّر تحديث حالة الحساب.");
    try {
      await db.auth.admin.updateUserById(data.userId, {
        ban_duration: data.active ? "none" : "876000h",
      });
    } catch {
      /* تعطيل الجلسة غير متاح — الحساب معلّق على مستوى المنصة */
    }

    await g.writeAudit(db, staff, {
      action: data.active ? "user.activate" : "user.suspend",
      entity_type: "user",
      entity_id: data.userId,
      description: `${data.active ? "تفعيل" : "إيقاف"} حساب ${before.email ?? data.userId}`,
      before: { is_active: before.is_active },
      after: { is_active: data.active },
      metadata: data.reason ? { reason: data.reason } : {},
    });
    return { ok: true as const };
  });

export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "users.delete");
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك بنفسك.");
    const db = await g.admin();

    const { data: before } = await db
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) throw new Error("المستخدم غير موجود.");

    const { data: staffRow } = await db
      .from("platform_staff")
      .select("id, role")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (staffRow?.role === "super_admin") throw new Error("لا يمكن حذف مالك المنصة.");

    const lifecycle = await import("@/lib/admin-users.server");
    const blockers = await lifecycle.ownershipBlockers(db, data.userId);
    if (blockers.length > 0) {
      const names = blockers.map((b) => b.organizationName).join("، ");
      await g.writeAudit(db, staff, {
        action: "user.delete_blocked",
        entity_type: "user",
        entity_id: data.userId,
        description: `منع حذف حساب ${before.email ?? data.userId} لارتباطه بملكية مكتب: ${names}`,
        before,
        metadata: { blockers },
      });
      throw new Error(
        `لا يمكن حذف الحساب لأنه المالك المسؤول عن: ${names}. انقل ملكية المكتب إلى عضو نشط آخر ثم أعد المحاولة.`,
      );
    }

    const inventory = await lifecycle.referenceInventory(db, data.userId);

    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) {
      const detail = `${error.message} ${JSON.stringify((error as { status?: number }).status ?? "")}`;
      if (/23503|foreign key|violates/i.test(detail)) {
        await g.writeAudit(db, staff, {
          action: "user.delete_blocked",
          entity_type: "user",
          entity_id: data.userId,
          description: `منع حذف حساب ${before.email ?? data.userId} لوجود سجلات مرتبطة`,
          before,
          metadata: { inventory },
        });
        throw new Error(
          "تعذّر حذف الحساب لوجود سجلات مرتبطة به لا يمكن فصلها تلقائياً. أوقف الحساب بدلاً من حذفه، أو أعد إسناد سجلاته أولاً.",
        );
      }
      throw new Error("تعذّر حذف الحساب.");
    }

    await g.writeAudit(db, staff, {
      action: "user.delete",
      entity_type: "user",
      entity_id: data.userId,
      description: `حذف حساب ${before.email ?? data.userId}`,
      before: { ...before, reference_inventory: inventory },
      after: null,
      metadata: { reference_inventory: inventory },
    });
    return { ok: true as const };
  });

/* ------------------------------------------------- ملكية المكتب قبل الحذف */

export const listUserOwnershipBlockers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "users.read");
    const db = await g.admin();
    const lifecycle = await import("@/lib/admin-users.server");
    return { blockers: await lifecycle.ownershipBlockers(db, data.userId) };
  });

export const transferOrganizationOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        fromUserId: z.string().uuid(),
        toUserId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "organizations.update");
    if (data.fromUserId === data.toUserId)
      throw new Error("اختر عضواً مختلفاً عن المالك الحالي.");
    const db = await g.admin();
    const lifecycle = await import("@/lib/admin-users.server");
    const result = await lifecycle.transferOwnership(db, data);
    await g.writeAudit(db, staff, {
      action: "organization.ownership_transfer",
      entity_type: "organization",
      entity_id: data.organizationId,
      description: `نقل ملكية المكتب من ${data.fromUserId} إلى ${data.toUserId}`,
      before: { owner_user_id: data.fromUserId, new_owner_previous_role: result.previousRole },
      after: { owner_user_id: data.toUserId },
    });
    return { ok: true as const };
  });

/* ---------------------------------------------- رسائل التفعيل وكلمة المرور */

function publishableClient() {
  return import("@supabase/supabase-js").then(({ createClient }) => {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    return createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
  });
}

const emailOnly = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});

export const resendUserVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailOnly.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "users.update");
    const db = await g.admin();
    const client = await publishableClient();
    const { error } = await client.auth.resend({
      type: "signup",
      email: data.email,
      options: { emailRedirectTo: g.siteOrigin("/auth/callback") },
    });
    if (error && !/already confirmed/i.test(error.message)) {
      throw new Error("تعذّر إرسال رابط التفعيل. تحقّق من إعداد البريد.");
    }
    await g.writeAudit(db, staff, {
      action: "user.resend_verification",
      entity_type: "user",
      entity_id: data.userId,
      description: `إعادة إرسال رابط التفعيل إلى ${data.email}`,
    });
    return { ok: true as const, alreadyConfirmed: Boolean(error) };
  });

export const sendUserPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailOnly.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "users.update");
    const db = await g.admin();
    const client = await publishableClient();
    const { error } = await client.auth.resetPasswordForEmail(data.email, {
      redirectTo: g.siteOrigin("/reset-password"),
    });
    if (error) throw new Error("تعذّر إرسال رابط إعادة تعيين كلمة المرور.");
    await g.writeAudit(db, staff, {
      action: "user.password_reset",
      entity_type: "user",
      entity_id: data.userId,
      description: `إرسال إعادة تعيين كلمة المرور إلى ${data.email}`,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------- الملاحظات الداخلية */

export const listUserNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "users.read");
    const db = await g.admin();
    const { data: rows } = await db
      .from("platform_user_notes")
      .select("id, body, author_name, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      notes: (rows ?? []) as {
        id: string;
        body: string;
        author_name: string;
        created_at: string;
      }[],
    };
  });

export const addUserNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        userEmail: z.string().trim().max(255),
        body: z.string().trim().min(2, "الملاحظة قصيرة جداً").max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "users.update");
    const db = await g.admin();
    const { error } = await db.from("platform_user_notes").insert({
      user_id: data.userId,
      user_email: data.userEmail,
      body: data.body,
      author_id: staff.user_id,
      author_name: staff.full_name,
    });
    if (error) throw new Error("تعذّر حفظ الملاحظة.");
    await g.writeAudit(db, staff, {
      action: "user.note_add",
      entity_type: "user",
      entity_id: data.userId,
      description: `إضافة ملاحظة داخلية على ${data.userEmail}`,
      after: { body: data.body },
    });
    return { ok: true as const };
  });
