/**
 * تكامل بريد Hostinger مع مركز البريد القائم — خادمي فقط.
 *
 * الإرسال: يبني رسالة MIME كاملة بالمرفقات الفعلية ويسلّمها عبر SMTP.
 * الاستقبال: مزامنة تزايدية عبر IMAP باستخدام UIDVALIDITY/UID، ثم تمرير كل
 * رسالة إلى `ingestInbound` القائم (تنقية HTML، تفرّد، مرفقات) وربطها بمركز
 * الدعم عبر `linkInboundToTicket`. لا جداول جديدة ولا محرك بريد بديل.
 */
import { ImapConnection, ImapError, type MailboxStatus } from "./imap.server";
import { base64Encode, parseMimeMessage } from "./mime.server";
import { smtpSend } from "./smtp.server";
import {
  mailboxHasOwnCredentials,
  primaryMailboxAddress,
  secretsStatus,
  transportConfigured,
} from "./config.server";
import { inboundAliasAddresses, routeInboundAddress } from "@/lib/email/routing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** حد أقصى للرسائل في دورة واحدة — يحمي زمن تنفيذ الطلب الخادمي. */
const FETCH_LIMIT = 15;
const MAX_RAW_BYTES = 20 * 1024 * 1024;
const LOCK_STALE_MS = 5 * 60_000;

export type MailboxSyncTarget = {
  id: string;
  address: string;
  type: string;
  folders: string[];
  syncEnabled: boolean;
  inboundEnabled: boolean;
  isActive: boolean;
};

export type SyncOutcome = {
  mailboxId: string;
  address: string;
  folder: string;
  fetched: number;
  ingested: number;
  duplicates: number;
  rejected: number;
  ticketsCreated: number;
  reindexed: boolean;
  durationMs: number;
  error: { code: string; message: string } | null;
};

function foldersOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const list = raw.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
    if (list.length > 0) return list.slice(0, 5);
  }
  return ["INBOX"];
}

/** الصناديق المؤهلة للمزامنة: بشرية، مُفعّلة، والاستقبال والمزامنة مسموحان. */
export async function syncableMailboxes(db: Db, mailboxId?: string): Promise<MailboxSyncTarget[]> {
  let query = db
    .from("email_mailboxes")
    .select("id, address, type, is_active, inbound_enabled, sync_enabled, imap_folders")
    .order("sort_order", { ascending: true });
  if (mailboxId) query = query.eq("id", mailboxId);
  const { data } = await query;
  // الحساب الحقيقي (قد يكون صندوق النظام) مصدر سحب مسموح لأن الأسماء
  // المستعارة تُسلَّم إليه؛ الاستيعاب يبقى تحت الصندوق المنطقي فقط.
  return ((data ?? []) as Record<string, unknown>[])
    .filter(
      (row) => String(row.type) !== "system" || mailboxHasOwnCredentials(String(row.address)),
    )
    .map((row) => ({
    id: String(row.id),
    address: String(row.address),
    type: String(row.type),
    folders: foldersOf(row.imap_folders),
    syncEnabled: row.sync_enabled === true,
    inboundEnabled: row.inbound_enabled === true,
    isActive: row.is_active === true,
  }));
}

async function loadState(
  db: Db,
  mailboxId: string,
  folder: string,
): Promise<{ id: string; uidvalidity: number; last_uid: number } | null> {
  const { data } = await db
    .from("email_sync_state")
    .select("id, uidvalidity, last_uid, locked_at")
    .eq("mailbox_id", mailboxId)
    .eq("folder", folder)
    .maybeSingle();
  const row = data as {
    id: string;
    uidvalidity: number | null;
    last_uid: number | null;
    locked_at: string | null;
  } | null;
  if (row) {
    const locked = row.locked_at ? Date.parse(row.locked_at) : 0;
    if (locked && Date.now() - locked < LOCK_STALE_MS) return null;
    return {
      id: row.id,
      uidvalidity: Number(row.uidvalidity ?? 0),
      last_uid: Number(row.last_uid ?? 0),
    };
  }
  const { data: created, error } = await db
    .from("email_sync_state")
    .insert({ mailbox_id: mailboxId, folder, local_folder: "inbox", status: "idle" })
    .select("id")
    .single();
  if (error) return null;
  return { id: (created as { id: string }).id, uidvalidity: 0, last_uid: 0 };
}

function isoOf(value: string | null): string {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

/** مزامنة مجلد واحد لصندوق واحد. لا ترمي؛ تعيد نتيجة موصوفة ومسجّلة. */
export async function syncMailboxFolder(
  db: Db,
  mailbox: MailboxSyncTarget,
  folder: string,
  triggerSource: "manual" | "cron",
): Promise<SyncOutcome> {
  const started = Date.now();
  const base: SyncOutcome = {
    mailboxId: mailbox.id,
    address: mailbox.address,
    folder,
    fetched: 0,
    ingested: 0,
    duplicates: 0,
    rejected: 0,
    ticketsCreated: 0,
    reindexed: false,
    durationMs: 0,
    error: null,
  };

  const finish = async (outcome: SyncOutcome): Promise<SyncOutcome> => {
    const result = { ...outcome, durationMs: Date.now() - started };
    await db.from("email_sync_runs").insert({
      mailbox_id: mailbox.id,
      folder,
      trigger_source: triggerSource,
      outcome: result.error ? "failed" : "success",
      fetched: result.fetched,
      ingested: result.ingested,
      duplicates: result.duplicates,
      rejected: result.rejected,
      tickets_created: result.ticketsCreated,
      reindexed: result.reindexed,
      error_code: result.error?.code ?? null,
      error_message: result.error?.message.slice(0, 500) ?? null,
      duration_ms: result.durationMs,
    });
    return result;
  };

  if (!transportConfigured(mailbox.address)) {
    return finish({
      ...base,
      error: { code: "imap_not_configured", message: "أسرار بريد Hostinger غير مكتملة." },
    });
  }
  if (!mailbox.isActive || !mailbox.inboundEnabled || !mailbox.syncEnabled) {
    return finish({
      ...base,
      error: { code: "sync_disabled", message: "المزامنة أو الاستقبال معطّل لهذا الصندوق." },
    });
  }

  const state = await loadState(db, mailbox.id, folder);
  if (!state) {
    return finish({
      ...base,
      error: { code: "sync_locked", message: "توجد دورة مزامنة جارية لهذا المجلد." },
    });
  }

  const lockToken = crypto.randomUUID();
  await db
    .from("email_sync_state")
    .update({ status: "syncing", locked_at: new Date().toISOString(), lock_token: lockToken })
    .eq("id", state.id);

  const release = async (patch: Record<string, unknown>) => {
    await db
      .from("email_sync_state")
      .update({
        locked_at: null,
        lock_token: null,
        last_sync_at: new Date().toISOString(),
        ...patch,
      })
      .eq("id", state.id);
  };

  let connection: ImapConnection | null = null;
  try {
    connection = await ImapConnection.open(mailbox.address);
    const status: MailboxStatus = await connection.select(folder, false);

    // تغيّر UIDVALIDITY يعني إعادة ترقيم كامل على الخادم: نبدأ من الطرف الحالي
    // بدل إعادة سحب الصندوق كله (التفرّد مضمون أصلاً بـ Message-ID).
    let cursor = state.last_uid;
    let reindexed = false;
    if (status.uidValidity !== state.uidvalidity) {
      reindexed = state.uidvalidity !== 0;
      cursor = Math.max(status.uidNext - 1 - FETCH_LIMIT, 0);
    }

    const messages = await connection.fetchSince(cursor, FETCH_LIMIT);
    const { ingestInbound } = await import("@/lib/email/workspace.server");
    const { linkInboundToTicket } = await import("@/lib/support/ingest.server");
    // Aliases منطقية: الرسالة تُستوعب تحت الصندوق المستهدف في ترويسة التسليم.
    const aliases = await inboundAliasAddresses(db);

    let ingested = 0;
    let duplicates = 0;
    let rejected = 0;
    let ticketsCreated = 0;
    let highestUid = cursor;

    for (const message of messages) {
      highestUid = Math.max(highestUid, message.uid);
      if (message.raw.byteLength > MAX_RAW_BYTES) {
        rejected += 1;
        continue;
      }
      try {
        const parsed = parseMimeMessage(message.raw);
        if (!parsed.fromAddress.includes("@")) {
          rejected += 1;
          continue;
        }
        const routed = routeInboundAddress(
          aliases,
          {
            deliveredTo: parsed.deliveredTo,
            originalTo: parsed.originalTo,
            to: parsed.to,
            cc: parsed.cc,
          },
          mailbox.address,
        );
        const result = await ingestInbound(db, {
          to: routed.address,
          from: parsed.fromAddress,
          fromName: parsed.fromName,
          subject: parsed.subject,
          html: parsed.html,
          text: parsed.text,
          messageId: parsed.messageId,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
          receivedAt: isoOf(message.internalDate ?? parsed.date),
          attachments: parsed.attachments
            .filter((a) => !a.inline && a.bytes.byteLength > 0)
            .slice(0, 10)
            .map((a) => ({ file_name: a.fileName, content_base64: base64Encode(a.bytes) })),
        });
        if (result.duplicate) duplicates += 1;
        else ingested += 1;
        rejected += result.attachmentsRejected;

        if (!result.duplicate) {
          const linked = await linkInboundToTicket(db, {
            mailboxId: result.mailboxId,
            threadId: result.threadId,
            emailMessageId: result.messageId,
            recipient: routed.address,
            from: parsed.fromAddress,
            fromName: parsed.fromName,
            subject: parsed.subject,
            body: (parsed.text ?? parsed.html ?? "").slice(0, 20_000),
            providerMessageId: parsed.messageId,
            duplicate: false,
          });
          if (linked.outcome === "created") ticketsCreated += 1;
        }
        // العلَم يُضاف بعد نجاح الاستيعاب فقط حتى لا تُفقد رسالة عند الفشل.
        await connection.setFlag(message.uid, "\\Seen", true).catch(() => undefined);
      } catch {
        rejected += 1;
      }
    }

    await release({
      status: "idle",
      uidvalidity: status.uidValidity,
      last_uid: highestUid,
      attempts: 0,
      last_error: null,
      last_error_code: null,
      last_success_at: new Date().toISOString(),
      new_messages: ingested,
    });

    return finish({
      ...base,
      fetched: messages.length,
      ingested,
      duplicates,
      rejected,
      ticketsCreated,
      reindexed,
    });
  } catch (error) {
    const code = error instanceof ImapError ? error.code : "imap_connect_failed";
    const message = error instanceof Error ? error.message : "تعذّرت المزامنة مع خادم البريد.";
    await release({
      status: "error",
      last_error: message.slice(0, 500),
      last_error_code: code,
      last_error_at: new Date().toISOString(),
      next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    return finish({ ...base, error: { code, message } });
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** مزامنة كل مجلدات صندوق واحد. */
export async function syncMailbox(
  db: Db,
  mailboxId: string,
  triggerSource: "manual" | "cron" = "manual",
): Promise<SyncOutcome[]> {
  const [mailbox] = await syncableMailboxes(db, mailboxId);
  if (!mailbox) throw new Error("الصندوق غير موجود أو غير مؤهل للمزامنة.");
  if (!mailboxHasOwnCredentials(mailbox.address)) {
    throw new Error(
      `«${mailbox.address}» اسم مستعار بلا بيانات دخول؛ تُسحب رسائله عبر الحساب الحقيقي (${primaryMailboxAddress() || "غير مُعرّف"}).`,
    );
  }
  const outcomes: SyncOutcome[] = [];
  for (const folder of mailbox.folders) {
    outcomes.push(await syncMailboxFolder(db, mailbox, folder, triggerSource));
  }
  return outcomes;
}

/** مزامنة كل الصناديق المؤهلة (يستدعيها المسار الدوري). */
export async function syncAllMailboxes(
  db: Db,
  triggerSource: "manual" | "cron" = "cron",
): Promise<SyncOutcome[]> {
  // الحساب الحقيقي فقط يُسجَّل الدخول إليه؛ الأسماء المستعارة تُوجَّه بالترويسات.
  const mailboxes = (await syncableMailboxes(db)).filter(
    (m) =>
      m.syncEnabled && m.inboundEnabled && m.isActive && mailboxHasOwnCredentials(m.address),
  );
  const outcomes: SyncOutcome[] = [];
  for (const mailbox of mailboxes) {
    for (const folder of mailbox.folders) {
      outcomes.push(await syncMailboxFolder(db, mailbox, folder, triggerSource));
    }
  }
  return outcomes;
}

/* ------------------------------------------------------------- الإرسال */

export type SmtpOutboundResult =
  | { ok: true; ref: string }
  | { ok: false; code: string; message: string };

/**
 * إرسال رسالة من قائمة الإرسال عبر SMTP بمرفقاتها الفعلية.
 * تُقرأ بايتات المرفقات من المستودع الخاص ولا تُصدَر أي روابط عامة.
 */
export async function sendViaHostinger(
  db: Db,
  input: {
    messageId: string;
    mailboxAddress: string;
    fromName: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    text: string;
    providerMessageId: string;
    inReplyTo: string | null;
    references: string[];
    replyTo?: string | null;
  },
): Promise<SmtpOutboundResult> {
  if (!transportConfigured(input.mailboxAddress)) {
    return { ok: false, code: "smtp_not_configured", message: "أسرار SMTP غير مكتملة." };
  }

  const { listAttachments, ATTACHMENT_BUCKET } = await import("@/lib/email/attachments.server");
  const stored = await listAttachments(db, input.messageId);
  const attachments: { fileName: string; mimeType: string; bytes: Uint8Array }[] = [];
  for (const item of stored) {
    const download = await db.storage.from(ATTACHMENT_BUCKET).download(item.storage_path);
    if (download.error || !download.data) {
      return { ok: false, code: "attachment_unavailable", message: "تعذّر قراءة أحد المرفقات." };
    }
    attachments.push({
      fileName: item.file_name,
      mimeType: item.mime_type,
      bytes: new Uint8Array(await (download.data as Blob).arrayBuffer()),
    });
  }

  const result = await smtpSend(
    {
      from: input.mailboxAddress,
      fromName: input.fromName,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      html: input.html,
      text: input.text,
      messageId: input.providerMessageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments,
    },
    input.mailboxAddress,
  );

  if (result.ok) return { ok: true, ref: input.providerMessageId };
  return { ok: false, code: result.code, message: result.message };
}

/** حالة التكامل للواجهة: توفر الأسرار فقط، دون أي قيمة سر. */
export function integrationStatus(mailboxAddress?: string | null) {
  return secretsStatus(mailboxAddress ?? null);
}
