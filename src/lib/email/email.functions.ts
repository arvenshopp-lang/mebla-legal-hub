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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

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
    await db
      .from("email_outbox")
      .update({ status: "queued", next_attempt_at: new Date().toISOString() })
      .eq("message_id", data.messageId);
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
