import type { Db as SupabaseDb } from "@/lib/supabase-db.shared";
import type { Database, Json } from "@/integrations/supabase/types";
/**
 * محرك مركز البريد — خادمي فقط. كل الجداول مغلقة أمام العميل، والوصول يمر
 * من هنا بعد فحص صلاحية الموظف في دوال الخادم.
 */
import { requestMeta } from "@/lib/admin-guard.server";
import {
  buildAttachmentSection,
  quarantineInboundAttachment,
  storeAttachment,
} from "@/lib/email/attachments.server";
import { sanitizeInboundHtml } from "@/lib/email/sanitize.shared";
import {
  previewOf,
  stripHtml,
  type EmailFolder,
  type EmailMessage,
  type Mailbox,
  type ThreadDetail,
  type ThreadSummary,
} from "@/lib/email/email.shared";

type Db = SupabaseDb;

const SENDER_DOMAIN = "mail.mehlalex.com";
const ROOT_DOMAIN = "mehlalex.com";
export const ATTACHMENT_BUCKET = "email-attachments";
/** صلاحية روابط تنزيل المرفقات المُرسلة للمستلم الخارجي (7 أيام). */
const OUTBOUND_ATTACHMENT_TTL = 7 * 24 * 60 * 60;

/* --------------------------------------------------------------- الصناديق */

/**
 * الصناديق المصرّح بها لموظف: مدير المنصة أو حامل `email.manage` يرى الكل،
 * وغيره يرى الصناديق غير المقيّدة بقسم، أو المقيّدة بقسمه فقط.
 */
export type MailboxScope = { isSuper: boolean; canManage: boolean; departmentId: string | null };

export async function allowedMailboxIds(db: Db, scope: MailboxScope): Promise<string[] | null> {
  if (scope.isSuper || scope.canManage) return null; // null = بلا تقييد
  const { data } = await db.from("email_mailboxes").select("id, department_id, type");
  return (
    ((data ?? []) as { id: string; department_id: string | null; type: string }[])
      // صندوق النظام (noreply) لا يظهر لموظف عادي إطلاقاً — إدارة فقط.
      .filter((m) => m.type !== "system")
      .filter(
        (m) =>
          m.department_id === null ||
          (scope.departmentId !== null && m.department_id === scope.departmentId),
      )
      .map((m) => m.id)
  );
}

/** يمنع أي عملية على صندوق غير مصرّح به — يُستدعى في كل دالة خادم. */
export async function assertMailboxAccess(
  db: Db,
  mailboxId: string,
  scope: MailboxScope,
): Promise<void> {
  const ids = await allowedMailboxIds(db, scope);
  if (ids === null) return;
  if (!ids.includes(mailboxId)) throw new Error("لا تملك وصولاً إلى صندوق البريد هذا.");
}

/** يمنع أي عملية على محادثة تنتمي لصندوق غير مصرّح به. */
export async function assertThreadAccess(
  db: Db,
  threadId: string,
  scope: MailboxScope,
): Promise<string> {
  const { data } = await db
    .from("email_threads")
    .select("mailbox_id")
    .eq("id", threadId)
    .maybeSingle();
  const row = data as { mailbox_id: string } | null;
  if (!row) throw new Error("المحادثة غير موجودة.");
  await assertMailboxAccess(db, row.mailbox_id, scope);
  return row.mailbox_id;
}

export async function listMailboxes(db: Db, scope?: MailboxScope): Promise<Mailbox[]> {
  const { data, error } = await db
    .from("email_mailboxes")
    .select(
      "id, address, display_name, type, is_shared, is_active, inbound_enabled, sync_enabled, signature_html, sort_order",
    )
    .order("sort_order", { ascending: true });
  if (error) throw new Error("تعذّر تحميل صناديق البريد.");
  let boxes = (data ?? []) as Omit<Mailbox, "unread">[];
  if (scope) {
    const ids = await allowedMailboxIds(db, scope);
    if (ids !== null) boxes = boxes.filter((b) => ids.includes(b.id));
  }

  const { data: unreadRows } = await db
    .from("email_threads")
    .select("mailbox_id")
    .eq("is_unread", true)
    .eq("folder", "inbox");
  const counts = new Map<string, number>();
  for (const row of (unreadRows ?? []) as { mailbox_id: string }[]) {
    counts.set(row.mailbox_id, (counts.get(row.mailbox_id) ?? 0) + 1);
  }
  return boxes.map((b) => ({ ...b, unread: counts.get(b.id) ?? 0 }));
}

export async function updateMailbox(
  db: Db,
  input: {
    id: string;
    display_name?: string;
    signature_html?: string | null;
    is_active?: boolean;
    inbound_enabled?: boolean;
    sync_enabled?: boolean;
    imap_folders?: string[];
  },
): Promise<void> {
  const patch: Database["public"]["Tables"]["email_mailboxes"]["Update"] = {};
  if (input.display_name !== undefined) patch["display_name"] = input.display_name;
  if (input.signature_html !== undefined) patch["signature_html"] = input.signature_html;
  if (input.is_active !== undefined) patch["is_active"] = input.is_active;
  if (input.inbound_enabled !== undefined) patch["inbound_enabled"] = input.inbound_enabled;
  if (input.sync_enabled !== undefined) patch["sync_enabled"] = input.sync_enabled;
  if (input.imap_folders !== undefined) patch["imap_folders"] = input.imap_folders;
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("email_mailboxes").update(patch).eq("id", input.id);
  if (error) throw new Error("تعذّر حفظ إعدادات الصندوق.");
}

async function requireMailbox(db: Db, id: string) {
  const { data } = await db
    .from("email_mailboxes")
    .select("id, address, display_name, type, is_active, signature_html")
    .eq("id", id)
    .maybeSingle();
  const box = data as {
    id: string;
    address: string;
    display_name: string;
    type: string;
    is_active: boolean;
  } | null;
  if (!box) throw new Error("صندوق البريد غير موجود.");
  if (!box.is_active) throw new Error("هذا الصندوق معطّل حالياً.");
  return box;
}

/* --------------------------------------------------------------- المحادثات */

type ThreadRow = {
  id: string;
  mailbox_id: string;
  subject: string;
  folder: EmailFolder;
  is_unread: boolean;
  is_starred: boolean;
  assigned_to: string | null;
  assigned_to_email: string | null;
  participants: string[];
  message_count: number;
  last_activity_at: string;
  ticket_id: string | null;
  organization_id: string | null;
};

export async function listThreads(
  db: Db,
  input: {
    mailboxId: string;
    folder: EmailFolder;
    search?: string;
    starred?: boolean;
    assignedTo?: string | null;
    labelId?: string | null;
    page?: number;
    pageSize?: number;
  },
): Promise<{ threads: ThreadSummary[]; total: number }> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 5), 100);
  const page = Math.max(input.page ?? 1, 1);

  let allowedIds: string[] | null = null;
  if (input.labelId) {
    const { data } = await db
      .from("email_thread_labels")
      .select("thread_id")
      .eq("label_id", input.labelId);
    allowedIds = ((data ?? []) as { thread_id: string }[]).map((r) => r.thread_id);
    if (allowedIds.length === 0) return { threads: [], total: 0 };
  }

  let query = db
    .from("email_threads")
    .select(
      "id, mailbox_id, subject, folder, is_unread, is_starred, assigned_to, assigned_to_email, participants, message_count, last_activity_at, ticket_id, organization_id",
      { count: "exact" },
    )
    .eq("mailbox_id", input.mailboxId)
    .eq("folder", input.folder);

  if (input.starred) query = query.eq("is_starred", true);
  if (input.assignedTo) query = query.eq("assigned_to", input.assignedTo);
  if (allowedIds) query = query.in("id", allowedIds);
  if (input.search?.trim()) {
    const term = input.search.trim().replace(/[%,]/g, " ");
    query = query.ilike("subject", `%${term}%`);
  }

  const { data, error, count } = await query
    .order("last_activity_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("تعذّر تحميل المحادثات.");
  const rows = (data ?? []) as ThreadRow[];
  if (rows.length === 0) return { threads: [], total: count ?? 0 };

  const ids = rows.map((r) => r.id);
  const [{ data: lastMessages }, { data: labelRows }] = await Promise.all([
    db
      .from("email_messages")
      .select("thread_id, body_text, html, created_at")
      .in("thread_id", ids)
      .order("created_at", { ascending: false }),
    db
      .from("email_thread_labels")
      .select("thread_id, email_labels(id, name_ar, color)")
      .in("thread_id", ids),
  ]);

  const preview = new Map<string, string>();
  for (const m of (lastMessages ?? []) as {
    thread_id: string;
    body_text: string | null;
    html: string | null;
  }[]) {
    if (!preview.has(m.thread_id)) preview.set(m.thread_id, previewOf(m.body_text, m.html));
  }
  const labels = new Map<string, ThreadSummary["labels"]>();
  for (const row of (labelRows ?? []) as {
    thread_id: string;
    email_labels: ThreadSummary["labels"][number] | null;
  }[]) {
    if (!row.email_labels) continue;
    labels.set(row.thread_id, [...(labels.get(row.thread_id) ?? []), row.email_labels]);
  }

  return {
    total: count ?? rows.length,
    threads: rows.map((r) => ({
      ...r,
      preview: preview.get(r.id) ?? "",
      labels: labels.get(r.id) ?? [],
    })),
  };
}

export async function getThread(db: Db, threadId: string): Promise<ThreadDetail> {
  const { data: threadRow } = await db
    .from("email_threads")
    .select(
      "id, mailbox_id, subject, folder, is_unread, is_starred, assigned_to, assigned_to_email, participants, message_count, last_activity_at, ticket_id, organization_id",
    )
    .eq("id", threadId)
    .maybeSingle();
  const thread = threadRow as ThreadRow | null;
  if (!thread) throw new Error("المحادثة غير موجودة.");

  const [{ data: messageRows }, { data: noteRows }, { data: labelRows }] = await Promise.all([
    db
      .from("email_messages")
      .select(
        "id, thread_id, direction, status, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, subject, html, body_text, received_at, sent_at, scheduled_at, failure_ref, created_by_email, created_at",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    db
      .from("email_notes")
      .select("id, author_email, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at"),
    db
      .from("email_thread_labels")
      .select("email_labels(id, name_ar, color)")
      .eq("thread_id", threadId),
  ]);

  const messages = (messageRows ?? []) as Omit<EmailMessage, "attachments">[];
  let attachments: Record<string, EmailMessage["attachments"]> = {};
  if (messages.length > 0) {
    const { data: attRows } = await db
      .from("email_attachments")
      .select(
        "id, message_id, file_name, mime_type, size_bytes, direction, scan_status, is_quarantined, is_inline_safe",
      )
      .in(
        "message_id",
        messages.map((m) => m.id),
      );
    attachments = (
      (attRows ?? []) as ({ message_id: string } & EmailMessage["attachments"][number])[]
    ).reduce<Record<string, EmailMessage["attachments"]>>((acc, a) => {
      acc[a.message_id] = [...(acc[a.message_id] ?? []), a];
      return acc;
    }, {});
  }

  return {
    thread: {
      ...thread,
      preview: previewOf(messages.at(-1)?.body_text ?? null, messages.at(-1)?.html ?? null),
      labels: ((labelRows ?? []) as { email_labels: ThreadSummary["labels"][number] | null }[])
        .map((r) => r.email_labels)
        .filter((l): l is ThreadSummary["labels"][number] => Boolean(l)),
    },
    messages: messages.map((m) => ({ ...m, attachments: attachments[m.id] ?? [] })),
    notes: (noteRows ?? []) as ThreadDetail["notes"],
  };
}

/* --------------------------------------------------------------- عمليات المحادثة */

export async function setThreadFlags(
  db: Db,
  input: { threadId: string; is_unread?: boolean; is_starred?: boolean },
): Promise<void> {
  const patch: Database["public"]["Tables"]["email_threads"]["Update"] = {};
  if (input.is_unread !== undefined) patch["is_unread"] = input.is_unread;
  if (input.is_starred !== undefined) patch["is_starred"] = input.is_starred;
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("email_threads").update(patch).eq("id", input.threadId);
  if (error) throw new Error("تعذّر تحديث حالة المحادثة.");
}

export async function moveThread(
  db: Db,
  input: { threadId: string; folder: EmailFolder },
): Promise<void> {
  const { data } = await db
    .from("email_threads")
    .select("folder")
    .eq("id", input.threadId)
    .maybeSingle();
  const current = (data as { folder: EmailFolder } | null)?.folder ?? "inbox";
  const { error } = await db
    .from("email_threads")
    .update({ folder: input.folder, previous_folder: current })
    .eq("id", input.threadId);
  if (error) throw new Error("تعذّر نقل المحادثة.");
}

export async function restoreThread(db: Db, threadId: string): Promise<void> {
  const { data } = await db
    .from("email_threads")
    .select("previous_folder")
    .eq("id", threadId)
    .maybeSingle();
  const previous =
    (data as { previous_folder: EmailFolder | null } | null)?.previous_folder ?? "inbox";
  const { error } = await db
    .from("email_threads")
    .update({ folder: previous, previous_folder: null })
    .eq("id", threadId);
  if (error) throw new Error("تعذّر استرجاع المحادثة.");
}

export async function assignThread(
  db: Db,
  input: { threadId: string; staffUserId: string | null; staffEmail: string | null },
): Promise<void> {
  const { error } = await db
    .from("email_threads")
    .update({ assigned_to: input.staffUserId, assigned_to_email: input.staffEmail })
    .eq("id", input.threadId);
  if (error) throw new Error("تعذّر تحويل المحادثة.");
}

export async function addNote(
  db: Db,
  input: { threadId: string; authorId: string; authorEmail: string; body: string },
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("لا يمكن حفظ ملاحظة فارغة.");
  const { error } = await db.from("email_notes").insert({
    thread_id: input.threadId,
    author_id: input.authorId,
    author_email: input.authorEmail,
    body,
  });
  if (error) throw new Error("تعذّر حفظ الملاحظة.");
}

export async function setThreadLabels(
  db: Db,
  input: { threadId: string; labelIds: string[] },
): Promise<void> {
  await db.from("email_thread_labels").delete().eq("thread_id", input.threadId);
  if (input.labelIds.length === 0) return;
  const { error } = await db
    .from("email_thread_labels")
    .insert(input.labelIds.map((label_id) => ({ thread_id: input.threadId, label_id })));
  if (error) throw new Error("تعذّر حفظ التسميات.");
}

/* --------------------------------------------------------------- المسوّدات والإرسال */

export type ComposeInput = {
  mailboxId: string;
  threadId?: string | null;
  draftId?: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  scheduledAt?: string | null;
  inReplyTo?: string | null;
};

function newMessageId(): string {
  return `<${crypto.randomUUID()}@${ROOT_DOMAIN}>`;
}

/** حفظ مسوّدة (إنشاء أو تحديث) وإرجاع معرّف الرسالة والمحادثة. */
export async function saveDraft(
  db: Db,
  actor: { userId: string; email: string },
  input: ComposeInput,
): Promise<{ messageId: string; threadId: string }> {
  const mailbox = await requireMailbox(db, input.mailboxId);
  if (mailbox.type === "system") throw new Error("لا يمكن الإرسال من صندوق النظام.");

  let threadId = input.threadId ?? null;
  if (!threadId) {
    const { data, error } = await db
      .from("email_threads")
      .insert({
        mailbox_id: mailbox.id,
        subject: input.subject,
        folder: "drafts",
        participants: dedupe([...input.to, ...input.cc]),
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء المسوّدة.");
    threadId = (data as { id: string }).id;
  }

  const payload = {
    thread_id: threadId,
    mailbox_id: mailbox.id,
    direction: "outbound" as const,
    kind: "human" as const,
    status: input.scheduledAt ? "scheduled" : "draft",
    from_address: mailbox.address,
    from_name: mailbox.display_name,
    to_addresses: input.to,
    cc_addresses: input.cc,
    bcc_addresses: input.bcc,
    subject: input.subject,
    html: input.html,
    body_text: stripHtml(input.html),
    in_reply_to: input.inReplyTo ?? null,
    scheduled_at: input.scheduledAt ?? null,
    created_by: actor.userId,
    created_by_email: actor.email,
  };

  if (input.draftId) {
    const { error } = await db.from("email_messages").update(payload).eq("id", input.draftId);
    if (error) throw new Error("تعذّر حفظ المسوّدة.");
    await touchThread(db, threadId, input.subject, [...input.to, ...input.cc]);
    return { messageId: input.draftId, threadId };
  }

  const { data, error } = await db
    .from("email_messages")
    .insert({ ...payload, message_id: newMessageId() })
    .select("id")
    .single();
  if (error) throw new Error("تعذّر حفظ المسوّدة.");
  await touchThread(db, threadId, input.subject, [...input.to, ...input.cc]);
  return { messageId: (data as { id: string }).id, threadId };
}

/** إدراج الرسالة في قائمة الإرسال ثم محاولة الإرسال فوراً (أو جدولتها). */
export async function queueMessage(
  db: Db,
  actor: { userId: string; email: string },
  input: ComposeInput,
): Promise<{ messageId: string; threadId: string; sent: boolean; failureRef?: string | null }> {
  if (input.to.length === 0) throw new Error("أضف مستلماً واحداً على الأقل.");
  if (!input.subject.trim()) throw new Error("موضوع الرسالة مطلوب.");
  if (!stripHtml(input.html)) throw new Error("نص الرسالة مطلوب.");

  // منع الإرسال المزدوج: مسوّدة أُرسلت أو قيد الإرسال لا تُعاد إلى القائمة أبداً.
  if (input.draftId) {
    const { data: guardRow } = await db
      .from("email_messages")
      .select("status, thread_id")
      .eq("id", input.draftId)
      .maybeSingle();
    const guard = guardRow as { status: string; thread_id: string } | null;
    if (guard && ["sent", "sending", "queued"].includes(guard.status)) {
      throw new Error("هذه الرسالة أُرسلت أو هي في قائمة الإرسال بالفعل.");
    }
  }

  const { messageId, threadId } = await saveDraft(db, actor, input);
  const scheduled = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const isFuture = scheduled ? scheduled.getTime() > Date.now() + 30_000 : false;

  await db
    .from("email_messages")
    .update({ status: isFuture ? "scheduled" : "queued" })
    .eq("id", messageId);
  await db.from("email_threads").update({ folder: "outbox" }).eq("id", threadId);
  const { error } = await db.from("email_outbox").upsert(
    {
      message_id: messageId,
      idempotency_key: `mail:${messageId}`,
      status: isFuture ? "scheduled" : "queued",
      scheduled_at: scheduled?.toISOString() ?? null,
      next_attempt_at: (scheduled ?? new Date()).toISOString(),
      attempts: 0,
      last_error: null,
      last_error_code: null,
    },
    { onConflict: "message_id" },
  );
  if (error) throw new Error("تعذّر إضافة الرسالة إلى قائمة الإرسال.");

  if (isFuture) return { messageId, threadId, sent: false };
  const result = await dispatchOne(db, messageId);
  return { messageId, threadId, sent: result.sent, failureRef: result.failureRef ?? null };
}

export async function discardDraft(db: Db, messageId: string): Promise<void> {
  const { data } = await db
    .from("email_messages")
    .select("thread_id, status")
    .eq("id", messageId)
    .maybeSingle();
  const row = data as { thread_id: string; status: string } | null;
  if (!row) throw new Error("المسوّدة غير موجودة.");
  if (!["draft", "scheduled", "queued", "failed"].includes(row.status)) {
    throw new Error("لا يمكن حذف رسالة أُرسلت فعلاً.");
  }
  await db.from("email_outbox").delete().eq("message_id", messageId);
  await db.from("email_messages").delete().eq("id", messageId);
  const { count } = await db
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", row.thread_id);
  if ((count ?? 0) === 0) await db.from("email_threads").delete().eq("id", row.thread_id);
}

/* ----------------------------------------------------------------- النقل */

/**
 * نتيجة إرسال موحّدة داخل مركز البريد. المزوّد الوحيد هو Hostinger SMTP:
 * لا مسار احتياطي لأي خدمة بريد مُدارة، و`ok = true` تعني قبول SMTP فعلياً.
 */
type TransportResult =
  | { ok: true; ref: string | null }
  | { ok: false; code: string; message: string; status: number | null; smtpCode: number | null };

type OutboxRow = {
  id: string;
  message_id: string;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
};

/**
 * أخطاء نهائية لا تُصلحها إعادة المحاولة: رفض نهائي للمستلم أو للمُرسل أو
 * لمحتوى الرسالة من مزوّد المستلم. تُعلَّم الرسالة فوراً كفاشلة برسالة عربية
 * واضحة بدل تكرار الإرسال حتى استنفاد المحاولات وتضخيم سجل الأعطال.
 */
const PERMANENT_SEND_CODES = new Set(["recipient_suppressed", "invalid_recipient"]);

/**
 * رفض على مستوى المستلم لا على مستوى المنصة: عنوان موقوف أو غير صالح. الحالة
 * تُحفظ على الرسالة وتظهر للمستخدم، لكنها **ليست** عطل نظام فلا تُسجَّل في سجل
 * الأعطال حتى لا يُشوَّش على فريق التشغيل بأعطال ليست من مسؤوليته.
 */
const RECIPIENT_DENY_CODES = new Set([
  "recipient_suppressed",
  "invalid_recipient",
  "smtp_rejected_recipient",
]);

/** مفتاح تفرّد فريد لكل محاولة: يمنع التكرار داخل المحاولة ولا يحجب الإعادة. */
function attemptIdempotencyKey(baseKey: string, attemptNumber: number): string {
  return `${baseKey}:a${attemptNumber}`;
}

/**
 * أعطال نقل SMTP سببها الإعداد أو البيئة لا الرسالة (سرّ ناقص، بيانات دخول
 * خاطئة، تعذّر اتصال، مهلة، مرفق غير متاح). لا يوجد مزوّد بديل، فلا تُحرق
 * الرسالة: تبقى في قائمة الإرسال بمهلة إعادة قصيرة ويُسجَّل عطل التشغيل.
 */
const SMTP_CONFIG_ERROR_CODES = new Set([
  "smtp_not_configured",
  "smtp_auth_failed",
  "smtp_connect_failed",
  "smtp_timeout",
  "attachment_unavailable",
]);

/** مهلة إعادة ثابتة قصيرة لأعطال الإعداد: وقت كافٍ لإصلاح تشغيلي. */
const CONFIG_RETRY_DELAY_MINUTES = 5;

function classifySendFailure(result: {
  code: string;
  smtpCode: number | null;
}): { permanent: boolean; configuration: boolean; reason: string | null } {
  if (SMTP_CONFIG_ERROR_CODES.has(result.code)) {
    return {
      permanent: false,
      configuration: true,
      reason:
        result.code === "smtp_not_configured"
          ? "إعداد بريد Hostinger غير مكتمل لهذا الصندوق؛ الرسالة محفوظة وستُعاد المحاولة بعد الإصلاح."
          : "تعذّر الاتصال بخدمة بريد Hostinger؛ الرسالة محفوظة وستُعاد المحاولة تلقائياً.",
    };
  }
  if (PERMANENT_SEND_CODES.has(result.code)) {
    return {
      permanent: true,
      configuration: false,
      reason:
        result.code === "recipient_suppressed"
          ? "عنوان المستلم محجوب عن الاستقبال (ارتداد أو شكوى أو إلغاء اشتراك سابق)، فلن تُعاد المحاولة."
          : "عنوان البريد غير مقبول.",
    };
  }
  // رفض نهائي (5xx) من مزوّد المستلم: لا تُصلحه الإعادة. 4xx مؤقت بطبيعته.
  if (result.smtpCode !== null && result.smtpCode >= 500 && result.smtpCode < 600) {
    return {
      permanent: true,
      configuration: false,
      reason:
        result.code === "smtp_rejected_recipient"
          ? "رفض مزوّد المستلم العنوان نهائياً."
          : "رُفضت الرسالة نهائياً من مزوّد المستلم.",
    };
  }
  return { permanent: false, configuration: false, reason: null };
}

/** إرسال رسالة واحدة من قائمة الإرسال. */
/**
 * تهيئة إعادة محاولة يدوية: تُعيد الرسالة إلى قائمة الإرسال وتضمن توفّر محاولة
 * واحدة إضافية على الأقل حتى لو استُنفدت المحاولات سابقاً، مع تنظيف آخر خطأ.
 */
export async function prepareManualRetry(db: Db, messageId: string): Promise<void> {
  const { data } = await db
    .from("email_outbox")
    .select("id, attempts, max_attempts")
    .eq("message_id", messageId)
    .maybeSingle();
  const job = data as { id: string; attempts: number; max_attempts: number } | null;
  if (!job) return;
  await db
    .from("email_outbox")
    .update({
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      max_attempts: Math.max(job.max_attempts, job.attempts + 1),
      last_error: null,
      last_error_code: null,
      locked_at: null,
    })
    .eq("id", job.id);
}

export async function dispatchOne(
  db: Db,
  messageId: string,
): Promise<{ sent: boolean; failureRef?: string }> {
  const { data: outboxRow } = await db
    .from("email_outbox")
    .select("id, message_id, idempotency_key, attempts, max_attempts")
    .eq("message_id", messageId)
    .maybeSingle();
  const job = outboxRow as OutboxRow | null;
  if (!job) return { sent: false };

  const { data: messageRow } = await db
    .from("email_messages")
    .select(
      "id, mailbox_id, message_id, in_reply_to, reference_ids, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, subject, html, body_text, thread_id, organization_id",
    )
    .eq("id", messageId)
    .maybeSingle();
  const message = messageRow as {
    id: string;
    message_id: string | null;
    in_reply_to: string | null;
    reference_ids: string[] | null;
    from_address: string;
    from_name: string | null;
    to_addresses: string[];
    cc_addresses: string[];
    bcc_addresses: string[];
    subject: string;
    html: string | null;
    body_text: string | null;
    thread_id: string;
    organization_id: string | null;
  } | null;
  if (!message) return { sent: false };

  // قفل ذرّي: لا تُرسل الرسالة مرتين لو تزامن استدعاء يدوي مع المسار الدوري.
  const { data: locked } = await db
    .from("email_outbox")
    .update({ status: "sending", locked_at: new Date().toISOString() })
    .eq("id", job.id)
    .in("status", ["queued", "scheduled"])
    .select("id");
  if (!locked || (locked as unknown[]).length === 0) return { sent: false };
  await db.from("email_messages").update({ status: "sending" }).eq("id", messageId);

  const baseHtml = message.html ?? "";
  const baseText = message.body_text ?? stripHtml(baseHtml);

  // مسار النقل الوحيد لبريد المكاتب: Hostinger SMTP بمرفقات MIME فعلية. لا
  // مسار احتياطي لأي خدمة بريد مُدارة — عطل الإعداد يُبقي الرسالة في القائمة.
  const transportUsed = "smtp_hostinger" as const;
  const { sendViaHostinger } = await import("@/lib/email/transport/hostinger.server");
  const smtp = await sendViaHostinger(db, {
    messageId,
    mailboxAddress: message.from_address,
    fromName: message.from_name ?? "MEHLA",
    to: message.to_addresses,
    cc: message.cc_addresses,
    bcc: message.bcc_addresses,
    subject: message.subject,
    html: baseHtml,
    text: baseText,
    providerMessageId: message.message_id ?? newMessageId(),
    inReplyTo: message.in_reply_to,
    references: message.reference_ids ?? [],
  });
  const result: TransportResult = smtp.ok
    ? { ok: true, ref: smtp.ref }
    : {
        ok: false,
        code: smtp.code,
        message: smtp.message,
        status: null,
        smtpCode: smtp.smtpCode ?? null,
      };
  const smtpDetail = smtp.ok
    ? { smtpCode: smtp.smtpCode, envelopeFrom: smtp.envelopeFrom, headerFrom: smtp.headerFrom }
    : null;

  if (result.ok) {
    const now = new Date().toISOString();
    await db
      .from("email_messages")
      .update({
        status: "sent",
        sent_at: now,
        provider: transportUsed,
        provider_ref: result.ref,
        failure_ref: null,
      })
      .eq("id", messageId);
    if (smtpDetail) {
      // إثبات مسار النقل: رمز استجابة SMTP والمظروف والترويسة — بلا أي سرّ.
      console.info("[email-transport] smtp accepted", {
        message_id: messageId,
        smtp_code: smtpDetail.smtpCode,
        envelope_from: smtpDetail.envelopeFrom,
        header_from: smtpDetail.headerFrom,
      });
    }
    await db
      .from("email_outbox")
      .update({ status: "sent", attempts: job.attempts + 1, locked_at: null })
      .eq("id", job.id);
    await db
      .from("email_threads")
      .update({ folder: "sent", last_activity_at: now, is_unread: false })
      .eq("id", message.thread_id);
    return { sent: true };
  }

  const classification = classifySendFailure(result);
  // عطل الإعداد ليس محاولة إرسال فعلية: لا يُستهلك رصيد المحاولات حتى لا تُحرق
  // رسالة صحيحة بسبب نقص سرّ على الخادم.
  const attempts = classification.configuration ? job.attempts : job.attempts + 1;
  const exhausted =
    classification.permanent || (!classification.configuration && attempts >= job.max_attempts);
  // ارتداد صلب مؤكَّد: يُسجَّل في حجب مِهلة كي لا يُعاد الإرسال لهذا العنوان.
  if (!smtp.ok) {
    const { captureHardBounce } = await import("@/lib/email/suppression.server");
    await captureHardBounce({
      addresses: message.to_addresses,
      errorCode: result.code,
      smtpCode: result.smtpCode,
      detail: result.message,
    });
  }
  let failureRef: string | null = null;
  if (!RECIPIENT_DENY_CODES.has(result.code)) {
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    failureRef = await logFailure({
      surface: "email",
      action: "email_workspace_send",
      error: classification.reason ?? result.message,
      errorCode: result.code,
      ...(result.status !== null ? { httpStatus: result.status } : {}),
      organizationId: message.organization_id ?? null,
      metadata: {
        message_id: messageId,
        attempts,
        transport: transportUsed,
        recipients: message.to_addresses.length,
        permanent: classification.permanent,
        configuration_failure: classification.configuration,
        ...(result.smtpCode !== null ? { smtp_code: result.smtpCode } : {}),
        provider_message: result.message.slice(0, 300),
      },
    });
  }
  const backoffMinutes = classification.configuration
    ? CONFIG_RETRY_DELAY_MINUTES
    : Math.min(2 ** attempts, 60);
  await db
    .from("email_outbox")
    .update({
      status: exhausted ? "failed" : "queued",
      attempts,
      last_error: (classification.reason ?? result.message).slice(0, 900),
      last_error_code: result.code,
      failure_ref: failureRef,
      locked_at: null,
      next_attempt_at: classification.permanent
        ? new Date().toISOString()
        : new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
    })
    .eq("id", job.id);
  await db
    .from("email_messages")
    .update({ status: exhausted ? "failed" : "queued", failure_ref: failureRef })
    .eq("id", messageId);
  return { sent: false, ...(failureRef ? { failureRef } : {}) };
}

/** معالجة الرسائل المستحقة (يستدعيها المسار الدوري). */
export async function dispatchDue(
  db: Db,
  limit = 20,
): Promise<{ processed: number; sent: number }> {
  const { data } = await db
    .from("email_outbox")
    .select("message_id")
    .in("status", ["queued", "scheduled"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as { message_id: string }[];
  let sent = 0;
  for (const row of rows) {
    const result = await dispatchOne(db, row.message_id);
    if (result.sent) sent += 1;
  }
  return { processed: rows.length, sent };
}

/* --------------------------------------------------------------- الاستقبال */

export type InboundPayload = {
  to: string;
  from: string;
  fromName?: string | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  receivedAt?: string | null;
  /** المرفق يوصل كمحتوى Base64 — لا نثق بمسار تخزين أو Content-Type من المزوّد. */
  attachments?: { file_name: string; content_base64: string }[];
};

export type InboundResult = {
  threadId: string;
  messageId: string;
  duplicate: boolean;
  mailboxId: string;
  attachmentsAccepted: number;
  attachmentsRejected: number;
  rejectedAttachments: { name: string; reason: string }[];
  blockedImages: number;
  hadActiveContent: boolean;
};

/** إدخال رسالة واردة: يُنشئ المحادثة أو يضيف إلى محادثة قائمة. */
export async function ingestInbound(db: Db, payload: InboundPayload): Promise<InboundResult> {
  const to = payload.to.trim().toLowerCase();
  const { data: boxRow } = await db
    .from("email_mailboxes")
    .select("id, address, inbound_enabled, is_active, type")
    .eq("address", to)
    .maybeSingle();
  const box = boxRow as {
    id: string;
    inbound_enabled: boolean;
    is_active: boolean;
    type: string;
  } | null;
  if (!box) throw new Error("لا يوجد صندوق بريد لهذا العنوان.");
  if (box.type === "system") throw new Error("صندوق النظام لا يستقبل الرسائل.");
  if (!box.is_active || !box.inbound_enabled) throw new Error("الاستقبال معطّل لهذا الصندوق.");

  const providerMessageId =
    payload.messageId?.trim() || `<${crypto.randomUUID()}@inbound.${ROOT_DOMAIN}>`;
  const { data: existing } = await db
    .from("email_messages")
    .select("id, thread_id")
    .eq("message_id", providerMessageId)
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; thread_id: string };
    return {
      threadId: row.thread_id,
      messageId: row.id,
      duplicate: true,
      mailboxId: box.id,
      attachmentsAccepted: 0,
      attachmentsRejected: 0,
      rejectedAttachments: [],
      blockedImages: 0,
      hadActiveContent: false,
    };
  }

  const subject = (payload.subject ?? "").trim() || "(بدون موضوع)";
  const from = payload.from.trim().toLowerCase();
  let threadId: string | null = null;

  const refs = [payload.inReplyTo, ...(payload.references ?? [])].filter(Boolean) as string[];
  if (refs.length > 0) {
    const { data } = await db
      .from("email_messages")
      .select("thread_id")
      .in("message_id", refs)
      .limit(1);
    threadId = ((data ?? []) as { thread_id: string }[])[0]?.thread_id ?? null;
  }
  if (!threadId) {
    const { data } = await db
      .from("email_threads")
      .select("id")
      .eq("mailbox_id", box.id)
      .eq("subject", subject)
      .contains("participants", [from])
      .order("last_activity_at", { ascending: false })
      .limit(1);
    threadId = ((data ?? []) as { id: string }[])[0]?.id ?? null;
  }

  const receivedAt = payload.receivedAt ?? new Date().toISOString();
  if (!threadId) {
    const { data, error } = await db
      .from("email_threads")
      .insert({
        mailbox_id: box.id,
        subject,
        folder: "inbox",
        is_unread: true,
        participants: [from],
        last_activity_at: receivedAt,
      })
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء المحادثة الواردة.");
    threadId = (data as { id: string }).id;
  }

  // تنقية إلزامية: لا يُخزَّن HTML خارجي كما هو إطلاقاً.
  const sanitized = sanitizeInboundHtml(payload.html);
  const html = sanitized.html || null;
  const text = (payload.text ? stripHtml(payload.text) : "") || sanitized.text;
  const { data: inserted, error: insertError } = await db
    .from("email_messages")
    .insert({
      thread_id: threadId,
      mailbox_id: box.id,
      message_id: providerMessageId,
      in_reply_to: payload.inReplyTo ?? null,
      reference_ids: payload.references ?? [],
      direction: "inbound",
      status: "received",
      from_address: from,
      from_name: payload.fromName ?? null,
      to_addresses: [to],
      subject,
      html,
      body_text: text,
      received_at: receivedAt,
    })
    .select("id")
    .single();
  if (insertError) throw new Error("تعذّر حفظ الرسالة الواردة.");
  const messageId = (inserted as { id: string }).id;

  // المرفقات الواردة: تحقق فعلي من التوقيع والحجم، وحجر ما يفشل.
  let accepted = 0;
  const rejected: { name: string; reason: string }[] = [];
  for (const attachment of payload.attachments ?? []) {
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(attachment.content_base64);
    } catch {
      rejected.push({ name: attachment.file_name, reason: "محتوى Base64 غير صحيح." });
      continue;
    }
    try {
      await storeAttachment(db, {
        messageId,
        direction: "inbound",
        fileName: attachment.file_name,
        bytes,
      });
      accepted += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "رُفض المرفق.";
      rejected.push({ name: attachment.file_name, reason });
      await quarantineInboundAttachment(db, {
        messageId,
        fileName: attachment.file_name,
        bytes,
        reason,
      });
    }
  }

  await db
    .from("email_threads")
    .update({ folder: "inbox", is_unread: true, last_activity_at: receivedAt })
    .eq("id", threadId);
  await touchThread(db, threadId, subject, [from]);
  return {
    threadId,
    messageId,
    duplicate: false,
    mailboxId: box.id,
    attachmentsAccepted: accepted,
    attachmentsRejected: rejected.length,
    rejectedAttachments: rejected,
    blockedImages: sanitized.blockedImages,
    hadActiveContent: sanitized.hadActiveContent,
  };
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/^data:[^;]*;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length === 0)
    throw new Error("invalid base64");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* --------------------------------------------------------------- مساعدات */

async function touchThread(
  db: Db,
  threadId: string,
  subject: string,
  participants: string[],
): Promise<void> {
  const { data } = await db
    .from("email_threads")
    .select("participants")
    .eq("id", threadId)
    .maybeSingle();
  const current = ((data as { participants: string[] } | null)?.participants ?? []) as string[];
  const { count } = await db
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  await db
    .from("email_threads")
    .update({
      subject,
      participants: dedupe([...current, ...participants]),
      message_count: count ?? 0,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)));
}

export async function writeEmailAudit(
  db: Db,
  actor: { userId?: string | null; email: string },
  entry: {
    action: string;
    mailboxId?: string | null;
    threadId?: string | null;
    messageId?: string | null;
    description?: string;
    metadata?: Json;
  },
): Promise<void> {
  const { ip, userAgent } = requestMeta();
  await db.from("email_audit_logs").insert({
    actor_id: actor.userId ?? null,
    actor_email: actor.email,
    action: entry.action,
    mailbox_id: entry.mailboxId ?? null,
    thread_id: entry.threadId ?? null,
    message_id: entry.messageId ?? null,
    description: entry.description ?? null,
    metadata: entry.metadata ?? {},
    ip,
    user_agent: userAgent,
  });
}

export async function listEmailAudit(
  db: Db,
  input: { threadId?: string | null; limit?: number },
): Promise<{
  logs: {
    id: string;
    actor_email: string;
    action: string;
    description: string | null;
    created_at: string;
  }[];
}> {
  let query = db
    .from("email_audit_logs")
    .select("id, actor_email, action, description, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(input.limit ?? 100, 200));
  if (input.threadId) query = query.eq("thread_id", input.threadId);
  const { data } = await query;
  return { logs: (data ?? []) as never };
}

export async function listLabels(db: Db) {
  const { data } = await db.from("email_labels").select("id, name_ar, color").order("name_ar");
  return (data ?? []) as { id: string; name_ar: string; color: string }[];
}

export async function upsertLabel(
  db: Db,
  input: { id?: string; name_ar: string; color: string },
): Promise<void> {
  const name = input.name_ar.trim();
  if (!name) throw new Error("اسم التسمية مطلوب.");
  const { error } = input.id
    ? await db.from("email_labels").update({ name_ar: name, color: input.color }).eq("id", input.id)
    : await db.from("email_labels").insert({ name_ar: name, color: input.color });
  if (error) throw new Error("تعذّر حفظ التسمية.");
}

export async function deleteLabel(db: Db, id: string): Promise<void> {
  const { error } = await db.from("email_labels").delete().eq("id", id);
  if (error) throw new Error("تعذّر حذف التسمية.");
}
