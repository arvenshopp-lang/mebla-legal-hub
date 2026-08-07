/**
 * دوال خادم إدارة بوابة الويب هوك.
 * ملف رقيق: تحقق صلاحية فعلي على الخادم + سجل تدقيق، والمنطق في `.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  WebhookEndpointView,
  WebhookEventStatus,
  WebhookEventView,
} from "@/lib/webhooks/webhooks.shared";

const guard = () => import("@/lib/admin-guard.server");
const engine = () => import("@/lib/webhooks/webhooks-admin.server");

export const listWebhookEndpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebhookEndpointView[]> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "integrations.read");
    const db = await g.admin();
    // الروابط تُعرض دائماً على النطاق العام لأن المزوّد الخارجي لا يصل إلى نطاق التطبيق.
    return (await engine()).readEndpoints(db, PUBLIC_ORIGIN);
  });

export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().trim().max(60).nullable().default(null),
        status: z.string().trim().max(24).default("all"),
        page: z.coerce.number().int().min(1).max(500).default(1),
        pageSize: z.coerce.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: WebhookEventView[]; total: number }> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "integrations.view_logs");
    const db = await g.admin();
    return (await engine()).readEvents(db, data);
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9][a-z0-9_-]{1,40}$/, "المُعرّف يقبل حروفاً لاتينية صغيرة وأرقاماً و - _ فقط."),
        displayName: z.string().trim().min(2).max(120),
        adapterType: z.enum(["whatsline", "generic_json"]),
        verificationMode: z.enum(["hmac_sha256", "shared_secret"]),
        signatureHeader: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]{3,60}$/, "اسم الترويسة يقبل حروفاً لاتينية صغيرة وأرقاماً و - فقط."),
        timestampHeader: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]{3,60}$/)
          .nullable()
          .default(null),
        notes: z.string().trim().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "integrations.manage");
    const db = await g.admin();
    const id = await (await engine()).createEndpoint(db, data);
    await g.writeAudit(db, staff, {
      action: "webhook.endpoint_created",
      entity_type: "webhook_endpoint",
      entity_id: id,
      description: `إضافة مزوّد ويب هوك: ${data.displayName}`,
      after: data,
    });
    return { id };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ secret: string; hint: string; slug: string }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "integrations.manage");
    const db = await g.admin();
    const result = await (await engine()).rotateEndpointSecret(db, data.id, context.userId);
    await g.writeAudit(db, staff, {
      action: "webhook.secret_rotated",
      entity_type: "webhook_endpoint",
      entity_id: data.id,
      description: `تدوير سرّ التحقق للمزوّد ${result.slug}`,
      metadata: { hint: result.hint },
    });
    return result;
  });

export const setWebhookEndpointState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        isEnabled: z.boolean().optional(),
        testMode: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "integrations.manage");
    const db = await g.admin();
    await (await engine()).setEndpointState(db, data);
    await g.writeAudit(db, staff, {
      action: "webhook.endpoint_state_changed",
      entity_type: "webhook_endpoint",
      entity_id: data.id,
      description: "تحديث حالة مزوّد ويب هوك",
      after: data,
    });
    return { ok: true };
  });

export const reprocessWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ status: WebhookEventStatus }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "integrations.manage");
    const db = await g.admin();
    const result = await (await engine()).reprocessEvent(db, data.id);
    await g.writeAudit(db, staff, {
      action: "webhook.event_reprocessed",
      entity_type: "webhook_event",
      entity_id: data.id,
      description: "إعادة معالجة حدث ويب هوك",
      metadata: { status: result.status },
    });
    return result;
  });

export const deadLetterWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(300) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "integrations.manage");
    const db = await g.admin();
    await (await engine()).markEventDeadLetter(db, data.id, data.reason);
    await g.writeAudit(db, staff, {
      action: "webhook.event_dead_lettered",
      entity_type: "webhook_event",
      entity_id: data.id,
      description: "ترحيل حدث ويب هوك إلى الفاشل نهائياً",
      metadata: { reason: data.reason },
    });
    return { ok: true };
  });