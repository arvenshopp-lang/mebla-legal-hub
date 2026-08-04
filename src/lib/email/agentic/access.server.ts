/**
 * طبقة تصريح وتدقيق تكامل Hostinger Agentic Mail — خادمية فقط.
 *
 * كل دالة خادم في مركز التكاملات تمر من هنا: تحقق صلاحية فعلي من صفّ الموظف
 * في القاعدة، ونطاق صناديق مشتق خادمياً (لا يُقبل أي نطاق من الواجهة)، ومعرّف
 * طلب ومعرّف ارتباط لكل عملية، ومهلة زمنية، وتنقيح كامل لأي رسالة خطأ قبل
 * إعادتها أو تسجيلها. لا يُعاد أي سر ولا ترويسة تفويض في أي مسار.
 */
import type { AdminPermission } from "@/lib/admin-permissions";
import { redactAgentic } from "./mcp-client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type StaffRow = import("@/lib/admin-guard.server").StaffRow;

export type AgenticContext = {
  staff: StaffRow;
  db: Db;
  requestId: string;
  correlationId: string;
  /** نطاق صناديق الموظف — مشتق من القاعدة فقط. */
  scope: { isSuper: boolean; canManage: boolean; departmentId: string | null };
};

export const AGENTIC_TIMEOUT_MS = 45_000;

function idOf(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

/** تصريح العملية: صلاحية فعلية + عميل إداري + معرّفات تتبّع. */
export async function authorize(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission,
  operation: string,
): Promise<AgenticContext> {
  const { requireStaff, admin } = await import("@/lib/admin-guard.server");
  const { expandPermissions } = await import("@/lib/admin-permissions");
  const staff = await requireStaff(supabase, userId, permission);
  const db = await admin();
  const granted = expandPermissions([
    ...(staff.permissions ?? []),
    ...(staff.platform_roles?.permissions ?? []),
  ]);
  return {
    staff,
    db,
    requestId: idOf("req"),
    correlationId: idOf(operation.slice(0, 6) || "agm"),
    scope: {
      isSuper: staff.role === "super_admin",
      canManage: staff.role === "super_admin" || granted.includes("email.manage_mailboxes"),
      departmentId: staff.department_id ?? null,
    },
  };
}

export type MailboxRow = {
  id: string;
  address: string;
  type: string;
  is_active: boolean;
  sync_enabled: boolean;
  inbound_enabled: boolean;
  department_id: string | null;
  agentic_mailbox_id: string | null;
  agentic_link_status: string;
};

/**
 * وصول الصندوق: يتحقق من نطاق الموظف عبر محرك البريد القائم، ويرفض صندوق
 * النظام (noreply) في المسارات البشرية مثل رسالة الاختبار.
 */
export async function assertMailbox(
  ctx: AgenticContext,
  mailboxId: string,
  options: { humanOnly?: boolean } = {},
): Promise<MailboxRow> {
  const { assertMailboxAccess } = await import("@/lib/email/workspace.server");
  await assertMailboxAccess(ctx.db, mailboxId, ctx.scope);
  const { data } = await ctx.db
    .from("email_mailboxes")
    .select(
      "id, address, type, is_active, sync_enabled, inbound_enabled, department_id, agentic_mailbox_id, agentic_link_status",
    )
    .eq("id", mailboxId)
    .maybeSingle();
  const row = data as MailboxRow | null;
  if (!row) throw new Error("صندوق البريد غير موجود.");
  if (options.humanOnly && row.type === "system") {
    throw new Error("صندوق النظام (noreply) مخصص لرسائل المنصة الآلية ولا يُراسل منه.");
  }
  return row;
}

/** سجل تدقيق لكل عملية، مع معرّف الطلب والارتباط وبلا أي قيمة سر. */
export async function audit(
  ctx: AgenticContext,
  entry: {
    action: string;
    description: string;
    mailboxId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { writeEmailAudit } = await import("@/lib/email/workspace.server");
  await writeEmailAudit(
    ctx.db,
    { userId: ctx.staff.user_id, email: ctx.staff.email },
    {
      action: entry.action,
      mailboxId: entry.mailboxId ?? null,
      description: redactAgentic(entry.description).slice(0, 500),
      metadata: {
        ...(entry.metadata ?? {}),
        request_id: ctx.requestId,
        correlation_id: ctx.correlationId,
        provider: "agentic_mail",
      },
    },
  );
}

/** مهلة صريحة لكل نداء مزوّد حتى لا تتجمّد الواجهة. */
export async function withTimeout<T>(
  work: Promise<T>,
  label: string,
  ms = AGENTIC_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`تجاوزت العملية «${label}» المهلة المسموحة.`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type SafeFailure = { code: string; message: string };

/** تحويل أي خطأ إلى رسالة عربية منقّحة بلا Stack ولا ترويسات ولا أسرار. */
export function toSafeFailure(error: unknown): SafeFailure {
  const record = error as { code?: unknown; message?: unknown } | null;
  const code = typeof record?.code === "string" && record.code ? record.code : "agentic_failed";
  const raw = typeof record?.message === "string" ? record.message : String(error ?? "");
  const message = redactAgentic(raw).replace(/\s+at\s+.*/gs, "").trim();
  return { code, message: message.slice(0, 300) || "تعذّر تنفيذ العملية مع مزوّد البريد." };
}
