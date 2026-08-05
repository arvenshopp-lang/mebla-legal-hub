/**
 * دوال خادم لوحة تشغيل مالك المنصة.
 * كل دالة تتحقق من صلاحية الموظف على الخادم أولاً، وتقرأ الأرقام من قاعدة
 * البيانات مباشرة عبر دوال RPC مؤمّنة (SECURITY DEFINER + فحص داخلي).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  ActivityOverview,
  ContentPage,
  GrowthSeries,
  JobsOverview,
  ServiceHealth,
} from "@/lib/admin-console.shared";

type Guard = typeof import("@/lib/admin-guard.server");
const guard = (): Promise<Guard> => import("@/lib/admin-guard.server");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const rpc = async <T>(supabase: AnyClient, name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as AnyClient).rpc(name, args ?? {});
  if (error) throw new Error("تعذّر قراءة بيانات التشغيل. حاول التحديث بعد لحظات.");
  return data as T;
};

/* --------------------------------------------------------- مؤشرات النشاط */

export const getActivityOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityOverview> => {
    await (await guard()).requireActiveStaff(context.supabase, context.userId);
    return rpc<ActivityOverview>(context.supabase, "admin_activity_overview");
  });

/* ------------------------------------------------------- صحة الخدمات */

export const getServiceHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServiceHealth> => {
    await (await guard()).requireStaff(context.supabase, context.userId, "monitoring.read");
    return rpc<ServiceHealth>(context.supabase, "admin_service_health");
  });

/* ------------------------------------------------------- طوابير المهام */

export const getJobsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JobsOverview> => {
    await (await guard()).requireStaff(context.supabase, context.userId, "monitoring.read");
    return rpc<JobsOverview>(context.supabase, "admin_jobs_overview");
  });

/** إعادة جدولة رسالة فاشلة في صندوق الصادر ثم محاولة إرسالها فعلياً. */
export const retryEmailJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ outboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.retry");
    const db = await g.admin();

    const { data: job } = await db
      .from("email_outbox")
      .select("id, message_id, status, attempts, max_attempts")
      .eq("id", data.outboxId)
      .maybeSingle();
    if (!job) throw new Error("لم يتم العثور على هذه المهمة.");

    await db
      .from("email_outbox")
      .update({
        status: "queued",
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        max_attempts: Math.max(Number(job.max_attempts ?? 3), Number(job.attempts ?? 0) + 1),
      })
      .eq("id", job.id);

    const { dispatchOne } = await import("@/lib/email/workspace.server");
    const result = await dispatchOne(db as never, job.message_id as string);

    await g.writeAudit(db, staff, {
      action: result.sent ? "email_job_retry_sent" : "email_job_retry_failed",
      entity_type: "email_outbox",
      entity_id: job.id as string,
      description: result.sent ? "أُعيد إرسال رسالة فاشلة بنجاح." : "فشلت إعادة إرسال الرسالة.",
      metadata: { failure_ref: result.failureRef ?? null },
    });

    return { sent: result.sent, failureRef: result.failureRef ?? null };
  });

/* ------------------------------------------------------- تحليلات النمو */

export const getGrowthSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<GrowthSeries> => {
    await (await guard()).requireStaff(context.supabase, context.userId, "monitoring.read");
    return rpc<GrowthSeries>(context.supabase, "admin_growth_series", { _days: data.days });
  });

/* --------------------------------------------------- إدارة محتوى الموقع */

const contentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "المعرّف يقبل الحروف اللاتينية الصغيرة والأرقام والشرطة فقط"),
  kind: z.enum(["home", "pricing", "faq", "legal", "banner", "contact", "page"]),
  title: z.string().trim().min(2, "العنوان مطلوب").max(160),
  description: z.string().trim().max(500).optional().nullable(),
  content: z.string().max(60_000),
  isPublished: z.boolean().default(false),
});

export const listContentPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContentPage[]> => {
    await (await guard()).requireStaff(context.supabase, context.userId, "content.read");
    const { data, error } = await (context.supabase as AnyClient)
      .from("platform_content_pages")
      .select("id, slug, kind, title, description, content, is_published, published_at, version, updated_at")
      .order("kind", { ascending: true })
      .order("slug", { ascending: true });
    if (error) throw new Error("تعذّر قراءة محتوى الموقع.");
    return (data ?? []) as ContentPage[];
  });

export const saveContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "content.manage");

    let parsed: Record<string, unknown>;
    try {
      const raw = data.content.trim() === "" ? "{}" : data.content;
      const value = JSON.parse(raw) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("shape");
      }
      parsed = value as Record<string, unknown>;
    } catch {
      throw new Error("صيغة المحتوى غير صحيحة — يجب أن يكون كائن JSON صالحاً.");
    }

    const db = await g.admin();
    const { data: existing } = await db
      .from("platform_content_pages")
      .select("id, slug, kind, title, description, content, is_published, published_at, version")
      .eq("slug", data.slug)
      .maybeSingle();

    const now = new Date().toISOString();
    const payload = {
      slug: data.slug,
      kind: data.kind,
      title: data.title,
      description: data.description?.trim() ? data.description.trim() : null,
      content: parsed,
      is_published: data.isPublished,
      published_at: data.isPublished ? (existing?.published_at ?? now) : null,
      published_by: data.isPublished ? staff.user_id : null,
      updated_by: staff.user_id,
      version: Number(existing?.version ?? 0) + 1,
    };

    const { data: saved, error } = existing
      ? await db.from("platform_content_pages").update(payload).eq("id", existing.id).select("id").maybeSingle()
      : await db.from("platform_content_pages").insert(payload).select("id").maybeSingle();
    if (error) throw new Error("تعذّر حفظ المحتوى. تأكد من صحة المعرّف.");

    await g.writeAudit(db, staff, {
      action: existing ? "content_page_updated" : "content_page_created",
      entity_type: "platform_content_pages",
      entity_id: (saved?.id ?? existing?.id ?? null) as string | null,
      description: `${existing ? "تحديث" : "إنشاء"} محتوى «${data.title}» (${data.slug}).`,
      before: existing ?? null,
      after: payload,
    });

    return { id: (saved?.id ?? existing?.id) as string };
  });

export const deleteContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "content.manage");
    const db = await g.admin();

    const { data: existing } = await db
      .from("platform_content_pages")
      .select("id, slug, title, kind, content, is_published")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("هذا المحتوى غير موجود.");

    const { error } = await db.from("platform_content_pages").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف المحتوى.");

    await g.writeAudit(db, staff, {
      action: "content_page_deleted",
      entity_type: "platform_content_pages",
      entity_id: data.id,
      description: `حذف محتوى «${existing.title}» (${existing.slug}).`,
      before: existing,
    });

    return { ok: true };
  });
