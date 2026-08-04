/**
 * سياق عمليات مركز الدعم — يُبنى داخل معالجات دوال الخادم فقط.
 *
 * كل عملية دعم تمر من هنا:
 *  - تحقق صلاحية `support.*` فعلي على الخادم (لا اعتماد على إخفاء الأزرار).
 *  - معرّف طلب ومعرّف ارتباط يُكتبان في سجل التدقيق لتتبّع العملية كاملة.
 *  - عميل خادمي مميّز لأن جداول الدعم مغلقة بالكامل على مستوى RLS،
 *    فنطاق الرؤية يُفرض في الاستعلام عبر `SupportActor` لا عبر السياسات.
 */
import { getRequest } from "@tanstack/react-start/server";
import type { AdminPermission } from "@/lib/admin-permissions";
import { expandPermissions } from "@/lib/admin-permissions";
import { requireStaff, writeAudit, type StaffRow } from "@/lib/admin-guard.server";
import { loadSupportActor, type SupportActor } from "./tickets.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type SupportCtx = {
  db: AnyClient;
  staff: StaffRow;
  actor: SupportActor;
  requestId: string;
  correlationId: string;
  permissions: string[];
};

export function newCorrelationId(prefix = "sup"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function currentRequestId(): string {
  try {
    const req = getRequest();
    const header =
      req.headers.get("cf-ray") ?? req.headers.get("x-request-id") ?? req.headers.get("x-correlation-id");
    if (header) return header.slice(0, 80);
  } catch {
    /* تشغيل مجدول بلا طلب HTTP */
  }
  return newCorrelationId("req");
}

export async function supportCtx(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission,
): Promise<SupportCtx> {
  const staff = await requireStaff(supabase, userId, permission);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;
  const permissions = expandPermissions([
    ...(staff.permissions ?? []),
    ...(staff.platform_roles?.permissions ?? []),
  ]);
  const actor = await loadSupportActor(
    db,
    { user_id: staff.user_id, email: staff.email, full_name: staff.full_name, role: staff.role },
    permissions,
  );
  return { db, staff, actor, permissions, requestId: currentRequestId(), correlationId: newCorrelationId() };
}

/** تحقق صلاحية إضافية داخل نفس العملية (مثل التصعيد بعد الرد). */
export function ensurePermission(ctx: SupportCtx, permission: AdminPermission): void {
  if (ctx.staff.role === "super_admin") return;
  if (!ctx.permissions.includes(permission)) {
    throw new Error("لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.");
  }
}

export function canDo(ctx: SupportCtx, permission: AdminPermission): boolean {
  return ctx.staff.role === "super_admin" || ctx.permissions.includes(permission);
}

/** سجل تدقيق موحّد لكل عملية دعم. */
export async function auditSupport(
  ctx: SupportCtx,
  entry: {
    action: string;
    entityType?: string;
    entityId?: string | null;
    description?: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await writeAudit(ctx.db, ctx.staff, {
    action: entry.action,
    entity_type: entry.entityType ?? "support_ticket",
    entity_id: entry.entityId ?? null,
    ...(entry.description ? { description: entry.description } : {}),
    before: entry.before ?? null,
    after: entry.after ?? null,
    metadata: {
      ...(entry.metadata ?? {}),
      request_id: ctx.requestId,
      correlation_id: ctx.correlationId,
    },
  });
}

/** رسالة عربية آمنة: لا تكشف تفاصيل داخلية أو Stack Trace. */
export function safeMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  const looksInternal =
    /[a-z]{3,}\s*(error|exception|failed|null|undefined)/i.test(message) ||
    /\bat\s+\w+\s*\(/.test(message) ||
    message.length > 220 ||
    !/[\u0600-\u06FF]/.test(message);
  return looksInternal ? fallback : message;
}

/**
 * منع التكرار: مفتاح تفرّد واحد لكل عملية كتابة قادمة من الواجهة.
 * يُخزَّن في `support_ticket_ingest` (جدول التفرّد الموحّد) فلا تُسجّل نفس
 * الضغطة مرتين عند إعادة المحاولة أو ضعف الشبكة.
 */
export async function claimIdempotency(
  db: AnyClient,
  key: string,
  ticketId: string,
): Promise<{ fresh: boolean }> {
  const { error } = await db
    .from("support_ticket_ingest")
    .insert({ dedupe_key: key.slice(0, 200), ticket_id: ticketId, outcome: "appended" });
  if (!error) return { fresh: true };
  if (String(error.code) === "23505") return { fresh: false };
  return { fresh: true };
}
