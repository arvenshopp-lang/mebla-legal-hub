/**
 * ربط البريد الوارد بمركز الدعم — خادمي فقط.
 *
 * القاعدة: الرسالة الواردة إلى صندوق دعم إما تُنشئ تذكرة جديدة أو تُضاف إلى
 * تذكرة قائمة على نفس المحادثة. التفرّد مضمون بمفتاح `dedupe_key` فلا تُنشأ
 * تذكرة مكررة عند إعادة إرسال الويبهوك، والهوية تُستنتج خادمياً فقط.
 */
import { createTicket, resolveIdentity, writeTicketEvent } from "./tickets.server";
import { notifyOffice, notifyStaff } from "./notify.server";
import type { IngestMatchReason, IngestSource, TicketChannel } from "./support.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** الصناديق التي تُولّد تذاكر دعم (بقية الصناديق تبقى بريداً فقط). */
const TICKETING_MAILBOXES = ["support@mehlalex.com", "info@mehlalex.com"];

export type IngestTicketResult = {
  outcome: "created" | "appended" | "skipped";
  ticketId: string | null;
  ticketNumber: string | null;
  reason?: string;
  matchReason?: IngestMatchReason;
};

/**
 * يستنتج التذكرة القائمة المرتبطة بالرد قبل إنشاء تذكرة جديدة.
 *
 * الترتيب من الأقوى إلى الأضعف: تذكرة المحادثة نفسها، ثم أي رسالة في نفس
 * المحادثة سبق ربطها بتذكرة، ثم تذكرة أُنشئت من نفس المحادثة، ثم المحادثة
 * المشتقة من ترويسات `In-Reply-To` / `References` — وبهذا يُلحق رد الدعم
 * بمحادثته السابقة حتى إذا كانت الرسالة الصادرة الأصلية أُرسلت من مسار آخر
 * لا يمرّ بمركز الدعم.
 */
type TicketMatch = { ticketId: string; reason: IngestMatchReason };

async function resolveExistingTicketId(
  db: Db,
  input: { threadId: string; references: string[] },
): Promise<TicketMatch | null> {
  const { data: threadRow } = await db
    .from("email_threads")
    .select("ticket_id")
    .eq("id", input.threadId)
    .maybeSingle();
  const direct = (threadRow as { ticket_id: string | null } | null)?.ticket_id ?? null;
  if (direct) return { ticketId: direct, reason: "thread_ticket" };

  const { data: messageRows } = await db
    .from("email_messages")
    .select("ticket_id")
    .eq("thread_id", input.threadId)
    .not("ticket_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const fromMessage = ((messageRows ?? []) as { ticket_id: string | null }[])[0]?.ticket_id ?? null;
  if (fromMessage) return { ticketId: fromMessage, reason: "message_ticket" };

  const { data: sourceRows } = await db
    .from("support_tickets")
    .select("id")
    .eq("source_email_thread_id", input.threadId)
    .order("created_at", { ascending: false })
    .limit(1);
  const fromSource = ((sourceRows ?? []) as { id: string }[])[0]?.id ?? null;
  if (fromSource) return { ticketId: fromSource, reason: "thread_source" };

  const references = Array.from(new Set(input.references.filter(Boolean))).slice(0, 20);
  if (references.length === 0) return null;

  const { data: referenced } = await db
    .from("email_messages")
    .select("ticket_id, thread_id")
    .in("message_id", references)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (referenced ?? []) as { ticket_id: string | null; thread_id: string | null }[];
  const referencedTicket = rows.find((row) => row.ticket_id)?.ticket_id ?? null;
  if (referencedTicket) return { ticketId: referencedTicket, reason: "header_reference" };

  const threadIds = Array.from(
    new Set(rows.map((row) => row.thread_id).filter((id): id is string => Boolean(id))),
  );
  if (threadIds.length === 0) return null;

  const { data: linkedThreads } = await db
    .from("email_threads")
    .select("ticket_id")
    .in("id", threadIds)
    .not("ticket_id", "is", null)
    .limit(1);
  const fromReferencedThread =
    ((linkedThreads ?? []) as { ticket_id: string | null }[])[0]?.ticket_id ?? null;
  if (fromReferencedThread) return { ticketId: fromReferencedThread, reason: "header_reference" };

  const { data: referencedSource } = await db
    .from("support_tickets")
    .select("id")
    .in("source_email_thread_id", threadIds)
    .order("created_at", { ascending: false })
    .limit(1);
  const fromReferencedSource = ((referencedSource ?? []) as { id: string }[])[0]?.id ?? null;
  return fromReferencedSource
    ? { ticketId: fromReferencedSource, reason: "header_reference" }
    : null;
}

export async function linkInboundToTicket(
  db: Db,
  input: {
    mailboxId: string;
    threadId: string;
    emailMessageId: string;
    recipient: string;
    from: string;
    fromName?: string | null;
    subject?: string | null;
    body: string;
    providerMessageId?: string | null;
    duplicate: boolean;
    inReplyTo?: string | null;
    references?: string[];
    source: IngestSource;
  },
): Promise<IngestTicketResult> {
  if (input.duplicate)
    return { outcome: "skipped", ticketId: null, ticketNumber: null, reason: "duplicate_message" };
  if (!TICKETING_MAILBOXES.includes(input.recipient.trim().toLowerCase())) {
    return {
      outcome: "skipped",
      ticketId: null,
      ticketNumber: null,
      reason: "mailbox_not_ticketing",
    };
  }

  const dedupeKey = `inbound:${input.providerMessageId ?? input.emailMessageId}`.slice(0, 200);
  const { error: claimError } = await db.from("support_ticket_ingest").insert({
    dedupe_key: dedupeKey,
    email_message_id: input.emailMessageId,
    thread_id: input.threadId,
    outcome: "skipped",
    source: input.source,
    provider_message_id: input.providerMessageId ?? null,
  });
  if (claimError && String(claimError.code) === "23505") {
    return { outcome: "skipped", ticketId: null, ticketNumber: null, reason: "already_processed" };
  }

  const finish = async (
    outcome: "created" | "appended",
    ticketId: string,
    matchReason: IngestMatchReason,
  ) => {
    await db
      .from("support_ticket_ingest")
      .update({ outcome, ticket_id: ticketId, match_reason: matchReason })
      .eq("dedupe_key", dedupeKey);
    await db.from("email_messages").update({ ticket_id: ticketId }).eq("id", input.emailMessageId);
    await db.from("email_threads").update({ ticket_id: ticketId }).eq("id", input.threadId);
  };

  // 1) تذكرة قائمة على نفس المحادثة أو على المحادثة المرجعية → ردّ المكتب يُضاف إليها.
  const matched = await resolveExistingTicketId(db, {
    threadId: input.threadId,
    references: [input.inReplyTo ?? "", ...(input.references ?? [])].filter(Boolean),
  });

  if (matched) {
    const { data: ticketRow } = await db
      .from("support_tickets")
      .select(
        "id, ticket_number, reference, subject, status, organization_id, user_id, assigned_to, team_id, merged_into_id",
      )
      .eq("id", matched.ticketId)
      .maybeSingle();
    const ticket = ticketRow as Record<string, unknown> | null;
    const targetId =
      (ticket?.["merged_into_id"] as string | null) ?? (ticket?.["id"] as string | undefined);
    if (ticket && targetId) {
      await appendCustomerReply(db, targetId, {
        authorName: input.fromName ?? input.from,
        body: input.body,
        emailMessageId: input.emailMessageId,
        source: input.source,
        matchReason: matched.reason,
      });
      await finish("appended", targetId, matched.reason);
      await notifyStaff(
        db,
        {
          id: targetId,
          ticket_number: (ticket["ticket_number"] as string | null) ?? null,
          reference: (ticket["reference"] as string | null) ?? null,
          subject: (ticket["subject"] as string | null) ?? null,
          assigned_to: (ticket["assigned_to"] as string | null) ?? null,
        },
        "new_reply",
        { stamp: input.emailMessageId },
      );
      return {
        outcome: "appended",
        ticketId: targetId,
        ticketNumber: (ticket["ticket_number"] as string | null) ?? null,
        matchReason: matched.reason,
      };
    }
  }

  // 2) لا تذكرة على المحادثة → تذكرة جديدة بهوية مُستنتجة خادمياً.
  const identity = await resolveIdentity(db, { email: input.from, name: input.fromName ?? null });
  const created = await createTicket(db, {
    subject: (input.subject ?? "").trim() || "(بدون موضوع)",
    description: input.body || "—",
    category: await guessCategory(db, input.recipient),
    channel: "email" as TicketChannel,
    requesterEmail: input.from,
    requesterName: input.fromName ?? null,
    userId: identity.userId,
    organizationId: identity.organizationId,
    sourceEmailThreadId: input.threadId,
  });
  await finish("created", created.id, "new_ticket");
  await db
    .from("support_ticket_messages")
    .update({ email_message_id: input.emailMessageId })
    .eq("ticket_id", created.id)
    .is("email_message_id", null)
    .eq("is_staff", false);
  await notifyOffice(
    db,
    {
      id: created.id,
      ticket_number: created.ticketNumber,
      organization_id: identity.organizationId,
      user_id: identity.userId,
    },
    "ticket_created",
  );
  return {
    outcome: "created",
    ticketId: created.id,
    ticketNumber: created.ticketNumber,
    matchReason: "new_ticket",
  };
}

/** رد المكتب عبر البريد: رسالة في التذكرة + استئناف عدّاد المهلة. */
export async function appendCustomerReply(
  db: Db,
  ticketId: string,
  input: {
    authorName: string;
    body: string;
    emailMessageId?: string | null;
    source?: IngestSource;
    matchReason?: IngestMatchReason;
  },
): Promise<void> {
  const body = input.body.trim() || "—";
  await db.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    author_name: input.authorName.slice(0, 160),
    is_staff: false,
    body,
    email_message_id: input.emailMessageId ?? null,
  });

  const nowIso = new Date().toISOString();
  const { data: ticketRow } = await db
    .from("support_tickets")
    .select("status, paused_at, paused_total_seconds")
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = ticketRow as {
    status: string;
    paused_at: string | null;
    paused_total_seconds: number;
  } | null;

  const patch: Record<string, unknown> = { last_customer_reply_at: nowIso, last_reply_at: nowIso };
  if (ticket?.paused_at) {
    patch["paused_at"] = null;
    patch["paused_total_seconds"] =
      (ticket.paused_total_seconds ?? 0) +
      Math.max(0, Math.round((Date.now() - new Date(ticket.paused_at).getTime()) / 1000));
  }
  if (ticket && ["awaiting_reply", "resolved", "closed"].includes(ticket.status)) {
    patch["status"] = "in_progress";
    if (ticket.status === "closed") {
      const { data: countRow } = await db
        .from("support_tickets")
        .select("reopened_count")
        .eq("id", ticketId)
        .maybeSingle();
      patch["reopened_count"] =
        ((countRow as { reopened_count: number } | null)?.reopened_count ?? 0) + 1;
      patch["closed_at"] = null;
    }
  }
  await db.from("support_tickets").update(patch).eq("id", ticketId);

  await writeTicketEvent(db, {
    ticketId,
    eventType: "customer_reply",
    actorKind: "customer",
    actorName: input.authorName.slice(0, 160),
    emailMessageId: input.emailMessageId ?? null,
    after: { length: body.length },
    metadata: {
      ...(input.source ? { ingest_source: input.source } : {}),
      ...(input.matchReason ? { match_reason: input.matchReason } : {}),
    },
  });
  if (patch["status"] === "in_progress" && ticket?.status === "closed") {
    await writeTicketEvent(db, {
      ticketId,
      eventType: "reopened",
      actorKind: "system",
      actorName: "النظام",
      reason: "وصول رد جديد من المكتب على تذكرة مغلقة.",
    });
  }
}

async function guessCategory(db: Db, recipient: string): Promise<string> {
  const address = recipient.trim().toLowerCase();
  const preferred = address.startsWith("info@") ? "general" : "technical";
  const { data } = await db
    .from("support_categories")
    .select("code")
    .eq("code", preferred)
    .eq("is_active", true)
    .maybeSingle();
  if (data) return preferred;
  const { data: fallback } = await db
    .from("support_categories")
    .select("code")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1);
  return ((fallback ?? []) as { code: string }[])[0]?.code ?? "general";
}
