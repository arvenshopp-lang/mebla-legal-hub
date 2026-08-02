import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** أسطح النظام المسموح الإبلاغ عنها من الواجهة. */
const SURFACES = ["secure_view", "support_ticket", "support_message", "support_rating", "print"] as const;

export type SystemFailureRow = {
  id: string;
  ref: string;
  surface: string;
  action: string;
  error_code: string | null;
  error_message: string;
  http_status: number | null;
  organization_id: string | null;
  user_id: string | null;
  document_id: string | null;
  ticket_id: string | null;
  path: string | null;
  ip: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | null;
  created_at: string;
};

/**
 * إبلاغ من الواجهة عن عطل واجهه المستخدم. يُعيد معرّف تعرّف فقط، ولا يعيد
 * أي تفاصيل تقنية.
 */
export const reportFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        surface: z.enum(SURFACES),
        action: z.string().trim().min(1).max(80),
        message: z.string().trim().max(600).default(""),
        organizationId: z.string().uuid().nullish(),
        ticketId: z.string().uuid().nullish(),
        documentId: z.string().uuid().nullish(),
        path: z.string().trim().max(200).default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { logFailure } = await import("./failure-log.server");
    const ref = await logFailure({
      surface: data.surface,
      action: data.action,
      error: data.message || "عطل في الواجهة",
      userId: context.userId,
      organizationId: data.organizationId ?? null,
      ticketId: data.ticketId ?? null,
      documentId: data.documentId ?? null,
      path: data.path || null,
      metadata: { origin: "client" },
    });
    return { ref };
  });

/** بحث الإدارة في سجل الأعطال — يتطلّب صلاحية سجل التدقيق. */
export const listSystemFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        surface: z.string().trim().max(40).default("all"),
        from: z.string().trim().max(40).default(""),
        to: z.string().trim().max(40).default(""),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    await guard.requireStaff(context.supabase, context.userId, "audit.read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("system_failures")
      .select(
        "id, ref, surface, action, error_code, error_message, http_status, organization_id, user_id, document_id, ticket_id, path, ip, browser, os, device, metadata, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);

    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`ref.ilike.%${term}%,error_message.ilike.%${term}%,action.ilike.%${term}%`);
    }
    if (data.surface !== "all") query = query.eq("surface", data.surface);
    if (data.from) query = query.gte("created_at", new Date(data.from).toISOString());
    if (data.to) query = query.lte("created_at", new Date(`${data.to}T23:59:59`).toISOString());

    const { data: rows, count, error } = await query;
    if (error) throw new Error("تعذّر جلب سجل الأعطال.");
    return { rows: (rows ?? []) as unknown as SystemFailureRow[], total: count ?? 0 };
  });
