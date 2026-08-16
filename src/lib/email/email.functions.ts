import type { Db as SupabaseDb } from "@/lib/supabase-db.shared";
/**
 * دوال خادم مركز البريد — غلاف رقيق: فحص صلاحية الموظف ثم استدعاء المحرك.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailFolder, Mailbox, ThreadDetail, ThreadSummary } from "@/lib/email/email.shared";
import {
  ATTACHMENT_MAX_FILE_BYTES,
  ATTACHMENT_MAX_COUNT,
  type AttachmentMeta,
} from "@/lib/email/attachments.shared";

type Guard = typeof import("@/lib/admin-guard.server");
type Engine = typeof import("@/lib/email/workspace.server");
const guard = (): Promise<Guard> => import("@/lib/admin-guard.server");
const engine = (): Promise<Engine> => import("@/lib/email/workspace.server");

const folderEnum = z.enum(["inbox", "sent", "drafts", "outbox", "archive", "spam", "trash"]);
const addressList = z.array(z.string().email()).max(50);

/** نطاق صناديق الموظف — يُشتق خادمياً فقط من صفّه في القاعدة. */
function scopeOf(staff: import("@/lib/admin-guard.server").StaffRow) {
  const permissions = new Set([
    ...(staff.permissions ?? []),
    ...(staff.platform_roles?.permissions ?? []),
  ]);
  return {
    isSuper: staff.role === "super_admin",
    canManage: permissions.has("email.manage"),
    departmentId: staff.department_id ?? null,
  };
}

type Scope = ReturnType<typeof scopeOf>;
type Db = SupabaseDb;

/** صندوق النظام (noreply) لا يُرسل منه بشرياً، والصندوق غير المصرّح مرفوض. */
async function assertSendableMailbox(
  db: Db,
  e: Engine,
  mailboxId: string,
  scope: Scope,
): Promise<void> {
  await e.assertMailboxAccess(db, mailboxId, scope);
  const { data } = await db
    .from("email_mailboxes")
    .select("type, is_active")
    .eq("id", mailboxId)
    .maybeSingle();
  const box = data as { type: string; is_active: boolean } | null;
  if (!box) throw new Error("صندوق البريد غير موجود.");
  if (box.type === "system")
    throw new Error("صندوق النظام مخصص لرسائل المنصة الآلية ولا يُراسل منه.");
  if (!box.is_active) throw new Error("صندوق البريد معطّل.");
}

/** يتحقق من صلاحية الموظف على الرسالة عبر صندوقها. */
async function assertMessageAccess(
  db: Db,
  e: Engine,
  messageId: string,
  scope: Scope,
): Promise<void> {
  const { data } = await db
    .from("email_messages")
    .select("mailbox_id")
    .eq("id", messageId)
    .maybeSingle();
  const row = data as { mailbox_id: string } | null;
  if (!row) throw new Error("الرسالة غير موجودة.");
  await e.assertMailboxAccess(db, row.mailbox_id, scope);
}

/* ------------------------------------------------------------- قراءة */

export const getMailWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      mailboxes: Mailbox[];
      labels: { id: string; name_ar: string; color: string }[];
      staff: { user_id: string; email: string; full_name: string }[];
      canSend: boolean;
      canManage: boolean;
    }> => {
      const g = await guard();
      const staff = await g.requireStaff(context.supabase, context.userId, "email.view");
      const e = await engine();
      const db = await g.admin();
      const [mailboxes, labels, { data: staffRows }] = await Promise.all([
        e.listMailboxes(db, scopeOf(staff)),
        e.listLabels(db),
        db
          .from("platform_staff")
          .select("user_id, email, full_name")
          .eq("status", "active")
          .order("full_name"),
      ]);
      const permissions = new Set([
        ...(staff.permissions ?? []),
        ...(staff.platform_roles?.permissions ?? []),
      ]);
      const isSuper = staff.role === "super_admin";
      return {
        mailboxes,
        labels,
        staff: (staffRows ?? []) as { user_id: string; email: string; full_name: string }[],
        canSend: isSuper || permissions.has("email.send"),
        canManage: isSuper || permissions.has("email.manage"),
      };
    },
  );

const listSchema = z.object({
  mailboxId: z.string().uuid(),
  folder: folderEnum,
  search: z.string().max(120).optional(),
  starred: z.boolean().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  labelId: z.string().uuid().nullable().optional(),
  page: z.number().int().min(1).max(500).optional(),
});

export const listMailThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ threads: ThreadSummary[]; total: number }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.view");
    const e = await engine();
    const db = await g.admin();
    await e.assertMailboxAccess(db, data.mailboxId, scopeOf(staff));
    return e.listThreads(db, { ...data, folder: data.folder as EmailFolder });
  });

export const getMailThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), markRead: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ThreadDetail> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.view");
    const e = await engine();
    const db = await g.admin();
    await e.assertThreadAccess(db, data.threadId, scopeOf(staff));
    if (data.markRead !== false)
      await e.setThreadFlags(db, { threadId: data.threadId, is_unread: false });
    const detail = await e.getThread(db, data.threadId);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.thread.open",
        threadId: data.threadId,
        mailboxId: detail.thread.mailbox_id,
        description: `فتح محادثة: ${detail.thread.subject}`,
      },
    );
    return detail;
  });

export const listMailAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "email.audit");
    const e = await engine();
    return e.listEmailAudit(await g.admin(), { threadId: data.threadId ?? null });
  });

/* ------------------------------------------------------------- كتابة وإرسال */

const composeSchema = z.object({
  mailboxId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  draftId: z.string().uuid().nullable().optional(),
  to: addressList,
  cc: addressList.default([]),
  bcc: addressList.default([]),
  subject: z.string().max(300),
  html: z.string().max(200_000),
  scheduledAt: z.string().datetime().nullable().optional(),
  inReplyTo: z.string().max(300).nullable().optional(),
});

export const saveMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => composeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    await assertSendableMailbox(db, e, data.mailboxId, scopeOf(staff));
    const result = await e.saveDraft(db, { userId: staff.user_id, email: staff.email }, data);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.draft.save",
        threadId: result.threadId,
        messageId: result.messageId,
        mailboxId: data.mailboxId,
        description: `حفظ مسوّدة: ${data.subject}`,
      },
    );
    return result;
  });

export const sendMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => composeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    await assertSendableMailbox(db, e, data.mailboxId, scopeOf(staff));
    const result = await e.queueMessage(db, { userId: staff.user_id, email: staff.email }, data);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: result.sent ? "email.message.sent" : "email.message.queued",
        threadId: result.threadId,
        messageId: result.messageId,
        mailboxId: data.mailboxId,
        description: `${result.sent ? "إرسال" : "جدولة"} رسالة: ${data.subject}`,
        metadata: { recipients: data.to.length, failure_ref: result.failureRef ?? null },
      },
    );
    return result;
  });

export const retryMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    await assertMessageAccess(db, e, data.messageId, scopeOf(staff));
    await e.prepareManualRetry(db, data.messageId);
    const result = await e.dispatchOne(db, data.messageId);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.message.retry",
        messageId: data.messageId,
        description: result.sent ? "نجحت إعادة المحاولة" : "فشلت إعادة المحاولة",
        metadata: { failure_ref: result.failureRef ?? null },
      },
    );
    return result;
  });

export const discardMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    await assertMessageAccess(db, e, data.messageId, scopeOf(staff));
    await e.discardDraft(db, data.messageId);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.draft.discard",
        messageId: data.messageId,
        description: "حذف مسوّدة",
      },
    );
    return { ok: true };
  });

/* ------------------------------------------------- حالة استقبال المستلمين */

/**
 * فحص ما قبل الإرسال: هل أحد المستلمين محجوب لدى خدمة البريد المُدارة؟
 * عند توفّر أسرار SMTP للصندوق يخرج البريد من صندوق المكتب نفسه، فلا تنطبق
 * قوائم الحجب ويُعاد `transport: "smtp"` دون أي استعلام خارجي.
 */
export const checkMailRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mailboxId: z.string().uuid(), addresses: addressList }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      transport: "smtp";
      blocked: string[];
      unknown: string[];
    }> => {
      const g = await guard();
      const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
      const e = await engine();
      const db = await g.admin();
      await e.assertMailboxAccess(db, data.mailboxId, scopeOf(staff));
      const { data: box } = await db
        .from("email_mailboxes")
        .select("address")
        .eq("id", data.mailboxId)
        .maybeSingle();
      const address = (box as { address: string } | null)?.address;
      if (!address) throw new Error("صندوق البريد غير موجود.");

      // الحجب مملوك لمِهلة ومستقل عن المزوّد، فيُفحص دائماً — لا يُتخطّى بحجة
      // أن نقل SMTP مهيأ، وإلا أُرسل بريد لعنوان مرتدّ أو صاحب شكوى.
      const { recipientStates } = await import("@/lib/email/suppression.server");
      const states = await recipientStates(data.addresses, "human_mail");
      return {
        transport: "smtp",
        blocked: states.filter((s) => s.blocked).map((s) => s.address),
        unknown: states.filter((s) => s.unknown).map((s) => s.address),
      };
    },
  );

/**
 * رفع حجب عنوان واحد بعد موافقة موثقة من صاحبه. يتطلب صلاحية إدارة البريد
 * وسبباً نصياً إلزامياً، ويُسجَّل في سجل تدقيق البريد نجاحاً أو فشلاً.
 */
export const liftMailRecipientBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        address: z.string().email(),
        reason: z.string().trim().min(10, "اذكر سبباً واضحاً لا يقل عن 10 أحرف.").max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ lifted: boolean; message: string }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { liftRecipientBlock } = await import("@/lib/email/suppression.server");
    const result = await liftRecipientBlock(data.address);
    const e = await engine();
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.suppression.lift",
        description: `${result.lifted ? "رفع حجب" : "محاولة رفع حجب"} العنوان ${data.address}`,
        metadata: { recipient: data.address, reason: data.reason, lifted: result.lifted },
      },
    );
    return result;
  });

/* ------------------------------------------------------------- تنظيم */

export const updateMailThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        is_unread: z.boolean().optional(),
        is_starred: z.boolean().optional(),
        folder: folderEnum.optional(),
        restore: z.boolean().optional(),
        labelIds: z.array(z.string().uuid()).max(20).optional(),
        assignTo: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.view");
    const e = await engine();
    const db = await g.admin();
    await e.assertThreadAccess(db, data.threadId, scopeOf(staff));

    if (data.is_unread !== undefined || data.is_starred !== undefined) {
      await e.setThreadFlags(db, {
        threadId: data.threadId,
        ...(data.is_unread !== undefined ? { is_unread: data.is_unread } : {}),
        ...(data.is_starred !== undefined ? { is_starred: data.is_starred } : {}),
      });
    }
    if (data.restore) await e.restoreThread(db, data.threadId);
    else if (data.folder)
      await e.moveThread(db, { threadId: data.threadId, folder: data.folder as EmailFolder });
    if (data.labelIds)
      await e.setThreadLabels(db, { threadId: data.threadId, labelIds: data.labelIds });
    if (data.assignTo !== undefined) {
      await g.requireStaff(context.supabase, context.userId, "email.assign");
      let email: string | null = null;
      if (data.assignTo) {
        const { data: row } = await db
          .from("platform_staff")
          .select("email")
          .eq("user_id", data.assignTo)
          .maybeSingle();
        email = (row as { email: string } | null)?.email ?? null;
      }
      await e.assignThread(db, {
        threadId: data.threadId,
        staffUserId: data.assignTo,
        staffEmail: email,
      });
    }

    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.thread.update",
        threadId: data.threadId,
        description: "تحديث محادثة",
        metadata: {
          folder: data.folder ?? null,
          restored: Boolean(data.restore),
          assigned: data.assignTo ?? null,
          starred: data.is_starred ?? null,
          unread: data.is_unread ?? null,
          labels: data.labelIds?.length ?? null,
        },
      },
    );
    return { ok: true };
  });

export const addMailNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threadId: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.view");
    const e = await engine();
    const db = await g.admin();
    await e.assertThreadAccess(db, data.threadId, scopeOf(staff));
    await e.addNote(db, {
      threadId: data.threadId,
      authorId: staff.user_id,
      authorEmail: staff.email,
      body: data.body,
    });
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.note.add",
        threadId: data.threadId,
        description: "ملاحظة داخلية (لا تُرسل للمستلم)",
      },
    );
    return { ok: true };
  });

/* ------------------------------------------------------------- إعدادات */

export const updateMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        display_name: z.string().min(2).max(80).optional(),
        signature_html: z.string().max(20_000).nullable().optional(),
        is_active: z.boolean().optional(),
        inbound_enabled: z.boolean().optional(),
        sync_enabled: z.boolean().optional(),
        imap_folders: z.array(z.string().min(1).max(120)).max(5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const e = await engine();
    const db = await g.admin();
    await e.updateMailbox(db, data);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.mailbox.update",
        mailboxId: data.id,
        description: "تحديث إعدادات صندوق بريد",
      },
    );
    return { ok: true };
  });

export const saveMailLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name_ar: z.string().min(1).max(40),
        color: z.string().max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const e = await engine();
    const db = await g.admin();
    await e.upsertLabel(db, data);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.label.save",
        description: `حفظ تسمية: ${data.name_ar}`,
      },
    );
    return { ok: true };
  });

/* ------------------------------------------------- تكامل بريد Hostinger */

type Hostinger = typeof import("@/lib/email/transport/hostinger.server");

type SyncStateRow = {
  mailbox_id: string;
  folder: string;
  uidvalidity: number | null;
  last_uid: number | null;
  status: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  new_messages: number | null;
};

type SyncRunRow = {
  mailbox_id: string;
  folder: string;
  trigger_source: string;
  outcome: string;
  fetched: number;
  ingested: number;
  duplicates: number;
  rejected: number;
  tickets_created: number;
  error_code: string | null;
  duration_ms: number | null;
  created_at: string;
};

/** حالة التكامل: توفر الأسرار وحالة مزامنة كل صندوق — بلا أي قيمة سر. */
export const getMailIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const hostinger = (await import("@/lib/email/transport/hostinger.server")) as Hostinger & {
      senderIdentitySummary: (address?: string | null) => {
        authAccount: string;
        envelopeFrom: string;
        headerFrom: string;
        replyTo: string;
        isAlias: boolean;
        isSystem: boolean;
      };
    };
    const { integrationStatus, syncableMailboxes, senderIdentitySummary } = hostinger;
    const mailboxes = await syncableMailboxes(db);
    const { data: states } = await db
      .from("email_sync_state")
      .select(
        "mailbox_id, folder, uidvalidity, last_uid, status, last_sync_at, last_success_at, last_error, last_error_code, new_messages",
      );
    const { data: runs } = await db
      .from("email_sync_runs")
      .select(
        "mailbox_id, folder, trigger_source, outcome, fetched, ingested, duplicates, rejected, tickets_created, error_code, duration_ms, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(25);
    return {
      secrets: integrationStatus(null),
      // الحساب الحقيقي الوحيد الذي تجري به المصادقة (عنوان فقط، لا كلمة مرور).
      transport: senderIdentitySummary(null),
      mailboxes: mailboxes.map((m) => ({
        id: m.id,
        address: m.address,
        folders: m.folders,
        syncEnabled: m.syncEnabled,
        inboundEnabled: m.inboundEnabled,
        isActive: m.isActive,
        credentials: integrationStatus(m.address),
        identity: senderIdentitySummary(m.address),
      })),
      states: (states ?? []) as SyncStateRow[],
      runs: (runs ?? []) as SyncRunRow[],
    };
  });

/** اختبار اتصال SMTP وIMAP دون إرسال رسالة أو تعديل الصندوق. */
export const testMailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ mailboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { data: box } = await db
      .from("email_mailboxes")
      .select("address")
      .eq("id", data.mailboxId)
      .maybeSingle();
    const address = (box as { address: string } | null)?.address;
    if (!address) throw new Error("صندوق البريد غير موجود.");

    const { smtpVerify } = await import("@/lib/email/transport/smtp.server");
    const { imapVerify } = await import("@/lib/email/transport/imap.server");
    const smtp = await smtpVerify(address);
    const imap = await imapVerify(address);

    const e = await engine();
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.integration.test",
        mailboxId: data.mailboxId,
        description: `اختبار اتصال البريد لصندوق ${address}`,
      },
    );

    return {
      smtp: smtp.ok
        ? { ok: true as const, latencyMs: smtp.latencyMs, message: smtp.response }
        : { ok: false as const, latencyMs: smtp.latencyMs, code: smtp.code, message: smtp.message },
      imap: imap.ok
        ? {
            ok: true as const,
            latencyMs: imap.latencyMs,
            folders: imap.folders.slice(0, 30),
            uidValidity: imap.inbox.uidValidity,
            exists: imap.inbox.exists,
          }
        : { ok: false as const, latencyMs: imap.latencyMs, code: imap.code, message: imap.message },
    };
  });

/** تشغيل مزامنة يدوية لصندوق واحد. */
export const syncMailboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ mailboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const db = await g.admin();
    const { syncMailbox } = (await import("@/lib/email/transport/hostinger.server")) as Hostinger;
    const outcomes = await syncMailbox(db, data.mailboxId, "manual");
    const e = await engine();
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.integration.sync",
        mailboxId: data.mailboxId,
        description: `مزامنة يدوية: ${outcomes.reduce((sum, o) => sum + o.ingested, 0)} رسالة جديدة`,
      },
    );
    return { outcomes };
  });

export const deleteMailLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.manage");
    const e = await engine();
    const db = await g.admin();
    await e.deleteLabel(db, data.id);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.label.delete",
        description: "حذف تسمية",
      },
    );
    return { ok: true };
  });
/* ------------------------------------------------------------- المرفقات */

const uploadSchema = z.object({
  messageId: z.string().uuid(),
  fileName: z.string().min(1).max(260),
  /** المحتوى Base64 — الحد الأعلى يقارب 10 م.بايت بعد الترميز. */
  contentBase64: z
    .string()
    .min(4)
    .max(15 * 1024 * 1024),
});

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/^data:[^;]*;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length === 0)
    throw new Error("محتوى الملف غير صالح.");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** رفع مرفق إلى مسوّدة — يُتحقق من التوقيع الفعلي للملف خادمياً قبل التخزين. */
export const uploadMailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ attachment: AttachmentMeta }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    await assertMessageAccess(db, e, data.messageId, scopeOf(staff));

    const { data: msg } = await db
      .from("email_messages")
      .select("status")
      .eq("id", data.messageId)
      .maybeSingle();
    const status = (msg as { status: string } | null)?.status ?? "draft";
    if (!["draft", "scheduled", "failed"].includes(status)) {
      throw new Error("لا يمكن تعديل مرفقات رسالة أُرسلت أو في قائمة الإرسال.");
    }

    const bytes = decodeBase64(data.contentBase64);
    if (bytes.byteLength > ATTACHMENT_MAX_FILE_BYTES)
      throw new Error("حجم الملف يتجاوز الحد المسموح.");

    const a = await import("@/lib/email/attachments.server");
    const existing = await a.listAttachments(db, data.messageId);
    if (existing.length >= ATTACHMENT_MAX_COUNT)
      throw new Error("تجاوزت الحد الأقصى لعدد المرفقات.");

    const stored = await a.storeAttachment(db, {
      messageId: data.messageId,
      direction: "outbound",
      fileName: data.fileName,
      bytes,
      uploadedBy: staff.user_id,
      uploadedByEmail: staff.email,
    });

    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.attachment.upload",
        messageId: data.messageId,
        description: `رفع مرفق: ${stored.file_name}`,
        metadata: {
          sha256: stored.sha256,
          size_bytes: stored.size_bytes,
          mime_type: stored.mime_type,
        },
      },
    );

    return {
      attachment: {
        id: stored.id,
        file_name: stored.file_name,
        mime_type: stored.mime_type,
        size_bytes: stored.size_bytes,
        is_inline_safe: stored.is_inline_safe,
      } as AttachmentMeta,
    };
  });

/** حذف مرفق مسوّدة قبل الإرسال. */
export const deleteMailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.send");
    const e = await engine();
    const db = await g.admin();
    const a = await import("@/lib/email/attachments.server");

    const { data: row } = await db
      .from("email_attachments")
      .select("message_id, file_name")
      .eq("id", data.attachmentId)
      .maybeSingle();
    const meta = row as { message_id: string | null; file_name: string } | null;
    if (!meta?.message_id) throw new Error("المرفق غير موجود.");
    await assertMessageAccess(db, e, meta.message_id, scopeOf(staff));

    await a.deleteAttachment(db, data.attachmentId);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.attachment.delete",
        messageId: meta.message_id,
        description: `حذف مرفق: ${meta.file_name}`,
      },
    );
    return { ok: true };
  });

/** رابط تنزيل موقّع قصير الأجل — يتطلب `email.read` ووصولاً للصندوق. */
export const getMailAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string; fileName: string }> => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "email.view"); // email.view = صلاحية القراءة (email.read) في هذا الكتالوج
    const e = await engine();
    const db = await g.admin();
    const a = await import("@/lib/email/attachments.server");

    const { data: row } = await db
      .from("email_attachments")
      .select("message_id")
      .eq("id", data.attachmentId)
      .maybeSingle();
    const meta = row as { message_id: string | null } | null;
    if (!meta?.message_id) throw new Error("المرفق غير موجود.");
    await assertMessageAccess(db, e, meta.message_id, scopeOf(staff));

    const signed = await a.signedAttachmentUrl(db, data.attachmentId);
    await a.bumpDownloadCount(db, data.attachmentId);
    await e.writeEmailAudit(
      db,
      { userId: staff.user_id, email: staff.email },
      {
        action: "email.attachment.download",
        messageId: meta.message_id,
        description: `تنزيل مرفق: ${signed.fileName}`,
      },
    );
    return { url: signed.url, fileName: signed.fileName };
  });

/* ============================================================
 * تكامل Hostinger Agentic Mail — دوال صريحة، لكل واحدة صلاحيتها
 * وتحققها بـ Zod وسجل تدقيقها. لا مفتاح ولا ترويسة تفويض تعود للواجهة.
 * ============================================================ */

type Access = typeof import("@/lib/email/agentic/access.server");
type AgenticProvider = typeof import("@/lib/email/agentic/provider.server");
type AgenticStateMod = typeof import("@/lib/email/agentic/state.server");
type AgenticOverviewMod = typeof import("@/lib/email/agentic/overview.server");
type AgenticSchedulerMod = typeof import("@/lib/email/agentic/scheduler.server");

const access = (): Promise<Access> => import("@/lib/email/agentic/access.server");
const agProvider = (): Promise<AgenticProvider> => import("@/lib/email/agentic/provider.server");
const agState = (): Promise<AgenticStateMod> => import("@/lib/email/agentic/state.server");
const agOverview = (): Promise<AgenticOverviewMod> => import("@/lib/email/agentic/overview.server");
const agScheduler = (): Promise<AgenticSchedulerMod> =>
  import("@/lib/email/agentic/scheduler.server");

const mailboxIdInput = z.object({ mailboxId: z.string().uuid() });

export type AgenticOverviewPayload = Awaited<ReturnType<AgenticOverviewMod["buildOverview"]>>;

/** حالة التكامل الكاملة: الجاهزية، الأدوات، الصناديق، الجدولة، مسار الإرسال. */
export const getAgenticMailStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgenticOverviewPayload> => {
    const a = await access();
    const ctx = await a.authorize(context.supabase, context.userId, "email.read", "status");
    const o = await agOverview();
    return o.buildOverview(ctx.db, ctx.scope);
  });

/** اختبار اتصال حقيقي بخادم MCP (initialize) دون أي تعديل على البريد. */
export const testAgenticMailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      ok: boolean;
      latencyMs: number;
      server: string | null;
      error: string | null;
    }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_providers",
        "conn",
      );
      const [mcp, s] = await Promise.all([
        import("@/lib/email/agentic/mcp-client.server"),
        agState(),
      ]);
      if (!mcp.agenticSecretPresent()) {
        await s.markCheck(ctx.db, "connection", false, "مفتاح المزوّد غير مُعرّف في أسرار المنصة.");
        await a.audit(ctx, {
          action: "email.agentic.connection_test",
          description: "فشل الاختبار: المفتاح غير مُعرّف.",
        });
        return {
          ok: false,
          latencyMs: 0,
          server: null,
          error: "مفتاح Hostinger غير مُعرّف في أسرار المنصة.",
        };
      }
      const probe = await a.withTimeout(mcp.probeConnection(ctx.correlationId), "اختبار الاتصال");
      await s.markCheck(
        ctx.db,
        "connection",
        probe.ok,
        probe.ok
          ? `${probe.serverName ?? "MCP"} — ${probe.latencyMs}ms`
          : (probe.error?.message ?? null),
      );
      await s.patchAgenticState(ctx.db, (state) => ({
        ...state,
        latencyMs: probe.latencyMs,
        lastTestAt: new Date().toISOString(),
        lastError: probe.ok
          ? state.lastError
          : {
              code: probe.error?.code ?? "connection_failed",
              message: probe.error?.message ?? "",
              at: new Date().toISOString(),
            },
      }));
      await a.audit(ctx, {
        action: "email.agentic.connection_test",
        description: probe.ok
          ? `نجح الاتصال (${probe.latencyMs}ms)`
          : `فشل الاتصال: ${probe.error?.message ?? "سبب غير معروف"}`,
        metadata: { latency_ms: probe.latencyMs, provider_request_id: probe.requestId },
      });
      return {
        ok: probe.ok,
        latencyMs: probe.latencyMs,
        server: probe.serverName,
        error: probe.ok ? null : (probe.error?.message ?? "تعذّر الاتصال بخادم المزوّد."),
      };
    },
  );

/** اكتشاف الأدوات الفعلية وربطها بالعمليات، مع تخزين ما اكتُشف فقط. */
export const discoverAgenticMailTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ tools: string[]; operations: Record<string, string | null> }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_providers",
        "tools",
      );
      const [p, s] = await Promise.all([agProvider(), agState()]);
      try {
        const map = await a.withTimeout(
          p.discoverCapabilities(ctx.correlationId, true),
          "اكتشاف الأدوات",
        );
        const tools = map.tools.map((tool) => tool.name);
        await s.patchAgenticState(ctx.db, (state) => ({
          ...state,
          tools,
          operations: map.operationNames,
        }));
        const usable = Boolean(map.operationNames.listMessages && map.operationNames.getMessage);
        await s.markCheck(
          ctx.db,
          "tools",
          usable,
          usable
            ? `${tools.length} أداة مكتشفة`
            : "أدوات المزوّد لا تغطي قراءة الرسائل المطلوبة للمزامنة.",
        );
        await a.audit(ctx, {
          action: "email.agentic.discover",
          description: `اكتشاف الأدوات: ${tools.length} أداة`,
          metadata: { tools },
        });
        return { tools, operations: map.operationNames };
      } catch (error) {
        const failure = a.toSafeFailure(error);
        await s.markCheck(ctx.db, "tools", false, failure.message);
        await s.recordError(ctx.db, failure.code, failure.message);
        await a.audit(ctx, {
          action: "email.agentic.discover",
          description: `فشل الاكتشاف: ${failure.message}`,
        });
        throw new Error(failure.message);
      }
    },
  );

/** مطابقة صناديق المزوّد بصناديق مِهلة بالعنوان — بلا إنشاء صناديق جديدة. */
export const linkAgenticMailboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      linked: number;
      missing: number;
      aliased: number;
      unmatched: string[];
    }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_mailboxes",
        "link",
      );
      const [p, s] = await Promise.all([agProvider(), agState()]);
      try {
        const outcome = await a.withTimeout(
          p.linkMailboxes(ctx.db, ctx.correlationId),
          "ربط الصناديق",
        );
        await s.markCheck(
          ctx.db,
          "mailboxes",
          outcome.linked > 0,
          outcome.linked > 0
            ? `${outcome.linked} حساب حقيقي مرتبط${outcome.aliased ? ` — ${outcome.aliased} اسم مستعار` : ""}${outcome.missing ? ` — ${outcome.missing} غير موجود عند المزوّد` : ""}`
            : "لا يوجد صندوق مطابق بين المزوّد ومِهلة.",
        );
        await s.bumpCounters(ctx.db, { mailboxes: outcome.linked });
        await a.audit(ctx, {
          action: "email.agentic.link_mailboxes",
          description: `ربط الصناديق: ${outcome.linked} مرتبط، ${outcome.aliased} اسم مستعار، ${outcome.missing} غير موجود`,
          metadata: { unmatched: outcome.unmatched },
        });
        return outcome;
      } catch (error) {
        const failure = a.toSafeFailure(error);
        await s.markCheck(ctx.db, "mailboxes", false, failure.message);
        await a.audit(ctx, {
          action: "email.agentic.link_mailboxes",
          description: `فشل الربط: ${failure.message}`,
        });
        throw new Error(failure.message);
      }
    },
  );

/** فك ارتباط صندوق واحد: يوقف مزامنته عبر المزوّد ويُبقي بياناته المحفوظة. */
export const unlinkAgenticMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mailboxIdInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const a = await access();
    const ctx = await a.authorize(
      context.supabase,
      context.userId,
      "email.manage_mailboxes",
      "unlink",
    );
    const box = await a.assertMailbox(ctx, data.mailboxId);
    await ctx.db
      .from("email_mailboxes")
      .update({
        agentic_mailbox_id: null,
        agentic_link_status: "unlinked",
        agentic_unread_count: 0,
      })
      .eq("id", box.id);
    await a.audit(ctx, {
      action: "email.agentic.unlink_mailbox",
      mailboxId: box.id,
      description: `فك ارتباط الصندوق ${box.address} عن المزوّد.`,
    });
    return { ok: true };
  });

/** تشغيل تجريبي: يقرأ من المزوّد ولا يكتب أي رسالة ولا يُنشئ تذكرة. */
export const dryRunAgenticSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mailboxIdInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      fetched: number;
      wouldIngest: number;
      duplicates: number;
      error: string | null;
    }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_providers",
        "dry",
      );
      const box = await a.assertMailbox(ctx, data.mailboxId, { humanOnly: true });
      const [p, s] = await Promise.all([agProvider(), agState()]);
      const [outcome] = await a.withTimeout(
        p.syncAgenticMailbox(ctx.db, box.id, { triggerSource: "manual", dryRun: true }),
        "التشغيل التجريبي",
      );
      const failure = outcome?.error?.message ?? null;
      await s.markCheck(
        ctx.db,
        "dry_run",
        !failure,
        failure ?? `قراءة ${outcome?.fetched ?? 0} رسالة بلا أي كتابة`,
      );
      await a.audit(ctx, {
        action: "email.agentic.dry_run",
        mailboxId: box.id,
        description: failure
          ? `فشل التشغيل التجريبي: ${failure}`
          : `تشغيل تجريبي: ${outcome?.fetched ?? 0} رسالة مقروءة، ${outcome?.ingested ?? 0} مؤهلة للاستيراد`,
      });
      return {
        fetched: outcome?.fetched ?? 0,
        wouldIngest: outcome?.ingested ?? 0,
        duplicates: outcome?.duplicates ?? 0,
        error: failure,
      };
    },
  );

/** رسالة اختبار حقيقية عبر أداة الإرسال المكتشفة — لا تمر بمسار SMTP. */
export const sendAgenticTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mailboxId: z.string().uuid(), to: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error: string | null }> => {
    const a = await access();
    const ctx = await a.authorize(context.supabase, context.userId, "email.send", "test");
    const box = await a.assertMailbox(ctx, data.mailboxId, { humanOnly: true });
    if (!box.agentic_mailbox_id) throw new Error("الصندوق غير مرتبط بصندوق عند المزوّد.");
    const [p, s] = await Promise.all([agProvider(), agState()]);
    const subject = "رسالة اختبار — تكامل بريد مِهلة";
    const text = "هذه رسالة اختبار من مركز التكاملات في منصة مِهلة للتحقق من مسار الإرسال.";
    try {
      await a.withTimeout(
        p.invoke(
          "sendMessage",
          {
            mailbox: box.agentic_mailbox_id,
            to: [data.to],
            subject,
            text,
            html: `<div dir="rtl" style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif">${text}</div>`,
          },
          ctx.correlationId,
        ),
        "إرسال رسالة الاختبار",
      );
      await s.markCheck(ctx.db, "test_send", true, "نجح إرسال رسالة اختبار عبر المزوّد.");
      await s.patchAgenticState(ctx.db, (state) => ({
        ...state,
        lastSendAt: new Date().toISOString(),
      }));
      await a.audit(ctx, {
        action: "email.agentic.test_send",
        mailboxId: box.id,
        description: "إرسال رسالة اختبار عبر المزوّد.",
      });
      return { ok: true, error: null };
    } catch (error) {
      const failure = a.toSafeFailure(error);
      await s.markCheck(ctx.db, "test_send", false, failure.message);
      await a.audit(ctx, {
        action: "email.agentic.test_send",
        mailboxId: box.id,
        description: `فشل إرسال رسالة الاختبار: ${failure.message}`,
      });
      return { ok: false, error: failure.message };
    }
  });

/** التفعيل: لا يمر إلا باستيفاء كل الشروط فعلياً، وإلا يُعاد سبب المنع. */
export const activateAgenticMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; blockers: string[] }> => {
    const a = await access();
    const ctx = await a.authorize(
      context.supabase,
      context.userId,
      "email.manage_providers",
      "enable",
    );
    const [s, sched, shared] = await Promise.all([
      agState(),
      agScheduler(),
      import("@/lib/email/agentic/agentic.shared"),
    ]);
    const state = await s.readAgenticState(ctx.db);
    const blockers: string[] = [];
    if (!state.secretPresent) blockers.push("مفتاح Hostinger غير مُعرّف في أسرار المنصة.");
    if (!state.checks.connection.ok) blockers.push("اختبار الاتصال لم ينجح بعد.");
    if (!state.checks.tools.ok) blockers.push("لم تُكتشف أدوات المزوّد المطلوبة.");
    if (!state.checks.mailboxes.ok) blockers.push("لا يوجد صندوق مرتبط بالمزوّد.");
    if (!state.checks.dry_run.ok) blockers.push("التشغيل التجريبي لم ينجح بعد.");
    if (state.operations.sendMessage && !state.checks.test_send.ok)
      blockers.push("رسالة الاختبار لم تُرسل بنجاح.");
    if (blockers.length > 0 || !shared.readinessSatisfied(state)) {
      await a.audit(ctx, {
        action: "email.agentic.activate_blocked",
        description: `منع التفعيل: ${blockers.join(" | ") || "شروط الجاهزية غير مستوفاة."}`,
      });
      return {
        ok: false,
        blockers: blockers.length > 0 ? blockers : ["شروط الجاهزية غير مستوفاة."],
      };
    }
    await s.patchAgenticState(ctx.db, (current) => ({
      ...current,
      enabled: true,
      lastError: null,
    }));
    await sched.armScheduler(ctx.db);
    await a.audit(ctx, {
      action: "email.agentic.activate",
      description: "تفعيل تكامل Hostinger Agentic Mail بعد استيفاء كل شروط الجاهزية.",
    });
    return { ok: true, blockers: [] };
  });

/** التعطيل: يوقف الجدولة فوراً ويُبقي البيانات المستوردة كما هي. */
export const deactivateAgenticMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reason: z.string().trim().min(3).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const a = await access();
    const ctx = await a.authorize(
      context.supabase,
      context.userId,
      "email.manage_providers",
      "disable",
    );
    const [s, sched] = await Promise.all([agState(), agScheduler()]);
    await s.patchAgenticState(ctx.db, (current) => ({ ...current, enabled: false }));
    await sched.disarmScheduler(ctx.db, data.reason);
    await a.audit(ctx, {
      action: "email.agentic.deactivate",
      description: `تعطيل التكامل: ${data.reason}`,
    });
    return { ok: true };
  });

/** مزامنة تزايدية فورية لصندوق واحد — تكمل من المؤشر المحفوظ. */
export const syncAgenticMailboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mailboxIdInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      fetched: number;
      ingested: number;
      duplicates: number;
      error: string | null;
    }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_providers",
        "sync1",
      );
      const box = await a.assertMailbox(ctx, data.mailboxId, { humanOnly: true });
      const p = await agProvider();
      const [outcome] = await a.withTimeout(
        p.syncAgenticMailbox(ctx.db, box.id, { triggerSource: "manual" }),
        "المزامنة",
      );
      await a.audit(ctx, {
        action: "email.agentic.sync_mailbox",
        mailboxId: box.id,
        description: outcome?.error
          ? `فشل المزامنة: ${outcome.error.message}`
          : `مزامنة ${box.address}: ${outcome?.ingested ?? 0} رسالة جديدة، ${outcome?.duplicates ?? 0} مكرّرة`,
      });
      return {
        fetched: outcome?.fetched ?? 0,
        ingested: outcome?.ingested ?? 0,
        duplicates: outcome?.duplicates ?? 0,
        error: outcome?.error?.message ?? null,
      };
    },
  );

/** مزامنة فورية لكل الصناديق المرتبطة والمُفعّلة. */
export const syncAllAgenticMailboxesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ mailboxes: number; ingested: number; duplicates: number; failed: number }> => {
      const a = await access();
      const ctx = await a.authorize(
        context.supabase,
        context.userId,
        "email.manage_providers",
        "syncall",
      );
      const p = await agProvider();
      const outcomes = await a.withTimeout(
        p.syncAllAgenticMailboxes(ctx.db, "manual"),
        "مزامنة كل الصناديق",
      );
      const summary = {
        mailboxes: outcomes.length,
        ingested: outcomes.reduce((sum, o) => sum + o.ingested, 0),
        duplicates: outcomes.reduce((sum, o) => sum + o.duplicates, 0),
        failed: outcomes.filter((o) => o.error).length,
      };
      await a.audit(ctx, {
        action: "email.agentic.sync_all",
        description: `مزامنة يدوية شاملة: ${summary.ingested} رسالة جديدة من ${summary.mailboxes} صندوق، ${summary.failed} فشل`,
      });
      return summary;
    },
  );

/** إعادة المحاولة: تُصفّر قاطع الدائرة وتعيد تشغيل الصناديق المتعطّلة فقط. */
export const retryAgenticMailFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ retried: number; recovered: number }> => {
    const a = await access();
    const ctx = await a.authorize(context.supabase, context.userId, "email.retry", "retry");
    const [p, sched] = await Promise.all([agProvider(), agScheduler()]);
    await sched.resetBreaker(ctx.db);
    const { data: rows } = await ctx.db
      .from("email_sync_state")
      .select("mailbox_id")
      .eq("provider", "agentic_mail")
      .not("last_error", "is", null);
    const ids = ((rows ?? []) as { mailbox_id: string }[]).map((row) => row.mailbox_id);
    let recovered = 0;
    for (const id of ids) {
      try {
        await a.assertMailbox(ctx, id, { humanOnly: true });
      } catch {
        continue;
      }
      const [outcome] = await p.syncAgenticMailbox(ctx.db, id, { triggerSource: "manual" });
      if (outcome && !outcome.error) recovered += 1;
    }
    await a.audit(ctx, {
      action: "email.agentic.retry",
      description: `إعادة محاولة ${ids.length} صندوق متعطّل، نجح ${recovered}`,
    });
    return { retried: ids.length, recovered };
  });

/** إعادة تعيين المؤشر: إجراء تصحيحي صريح يُعيد قراءة الصندوق من البداية. */
export const resetAgenticMailboxCursor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mailboxIdInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const a = await access();
    const ctx = await a.authorize(
      context.supabase,
      context.userId,
      "email.manage_providers",
      "cursor",
    );
    const box = await a.assertMailbox(ctx, data.mailboxId);
    await ctx.db
      .from("email_sync_state")
      .update({
        provider_cursor: null,
        last_error: null,
        last_error_code: null,
        attempts: 0,
        next_attempt_at: null,
        status: "idle",
      })
      .eq("mailbox_id", box.id)
      .eq("provider", "agentic_mail");
    await a.audit(ctx, {
      action: "email.agentic.reset_cursor",
      mailboxId: box.id,
      description: `إعادة تعيين مؤشر المزامنة لصندوق ${box.address} — منع التكرار يعتمد على معرّف الرسالة.`,
    });
    return { ok: true };
  });

export type AgenticRunLog = {
  id: string;
  mailboxId: string;
  folder: string;
  outcome: string;
  fetched: number;
  ingested: number;
  duplicates: number;
  ticketsCreated: number;
  durationMs: number;
  triggerSource: string;
  errorMessage: string | null;
  createdAt: string;
};

/** سجل دورات المزامنة الأخيرة — مقيّد بنطاق صناديق الموظف. */
export const getAgenticMailLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ runs: AgenticRunLog[] }> => {
    const a = await access();
    const ctx = await a.authorize(context.supabase, context.userId, "email.view_logs", "logs");
    const o = await agOverview();
    const allowed = (await o.mailboxLinks(ctx.db, ctx.scope)).map((box) => box.id);
    if (allowed.length === 0) return { runs: [] };
    const { data: rows } = await ctx.db
      .from("email_sync_runs")
      .select(
        "id, mailbox_id, folder, outcome, fetched, ingested, duplicates, tickets_created, duration_ms, trigger_source, error_message, created_at",
      )
      .eq("provider", "agentic_mail")
      .in("mailbox_id", allowed)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const runs = ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      mailboxId: String(row.mailbox_id),
      folder: String(row.folder),
      outcome: String(row.outcome),
      fetched: Number(row.fetched ?? 0),
      ingested: Number(row.ingested ?? 0),
      duplicates: Number(row.duplicates ?? 0),
      ticketsCreated: Number(row.tickets_created ?? 0),
      durationMs: Number(row.duration_ms ?? 0),
      triggerSource: String(row.trigger_source ?? "cron"),
      errorMessage: row.error_message ? String(row.error_message) : null,
      createdAt: String(row.created_at),
    }));
    return { runs };
  });

/** تفعيل أو تعطيل مزامنة صندوق محدد دون المساس ببقية الصناديق. */
export const setAgenticMailboxSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mailboxId: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const a = await access();
    const ctx = await a.authorize(
      context.supabase,
      context.userId,
      "email.manage_mailboxes",
      "toggle",
    );
    const box = await a.assertMailbox(ctx, data.mailboxId, { humanOnly: true });
    await ctx.db.from("email_mailboxes").update({ sync_enabled: data.enabled }).eq("id", box.id);
    await a.audit(ctx, {
      action: "email.agentic.toggle_sync",
      mailboxId: box.id,
      description: `${data.enabled ? "تفعيل" : "تعطيل"} مزامنة صندوق ${box.address}.`,
    });
    return { ok: true };
  });
