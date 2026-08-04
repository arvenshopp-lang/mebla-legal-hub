/**
 * ربط البريد الوارد بمركز الدعم — خادمي فقط.
 *
 * القاعدة: الرسالة الواردة إلى صندوق دعم إما تُنشئ تذكرة جديدة أو تُضاف إلى
 * تذكرة قائمة على نفس المحادثة. التفرّد مضمون بمفتاح `dedupe_key` فلا تُنشأ
 * تذكرة مكررة عند إعادة إرسال الويبهوك، والهوية تُستنتج خادمياً فقط.
 */
import { createTicket, resolveIdentity, writeTicketEvent } from "./tickets.server";
import { notifyOffice, notifyStaff } from "./notify.server";
import type { TicketChannel } from "./support.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** الصناديق التي تُولّد تذاكر دعم (بقية الصناديق تبقى بريداً فقط). */
const TICKETING_MAILBOXES = ["support@mehlalex.com", "info@mehlalex.com"];

export type IngestTicketResult = {
  outcome: "created" | "appended" | "skipped";
  ticketId: string | null;
  ticketNumber: string | null;
  reason?: string;
};

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
  },
): Promise<IngestTicketResult> {
  if (input.duplicate) return { outcome: "skipped", ticketId: null, ticketNumber: null, reason: "duplicate_message" };
  if (!TICKETING_MAILBOXES.includes(input.recipient.trim().toLowerCase())) {
    return { outcome: "skipped", ticketId: null, ticketNumber: null, reason: "mailbox_not_ticketing" };
  }

  const dedupeKey = `inbound:${input.providerMessageId ?? input.emailMessageId}`.slice(0, 200);
  const { error: claimError } = await db
    .from("support_ticket_ingest")
    .insert({
      dedupe_key: dedupeKey,
      email_message_id: input.emailMessageId,
      thread_id: input.threadId,
      outcome: "skipped",
    });
  if (claimError && String(claimError.code) === "23505") {
    return { outcome: "skipped", ticketId: null, ticketNumber: null, reason: "already_processed" };
  }

  const finish = async (outcome: "created" | "appended", ticketId: string) => {
    await db
      .from("support_ticket_ingest")
      .update({ outcome, ticket_id: ticketId })
      .eq("dedupe_key", dedupeKey);
    await db.from("email_messages").update({ ticket_id: ticketId }).eq("id", input.emailMessageId);
    await db.from("email_threads").update({ ticket_id: ticketId }).eq("id", input.threadId);
  };

  // 1) محادثة مرتبطة بتذكرة قائمة → ردّ المكتب يُضاف إليها.
  const { data: threadRow } = await db
    .from("email_threads")
    .select("ticket_id")
    .eq("id", input.threadId)
    .maybeSingle();
  const linkedTicketId = (threadRow as { ticket_id: string | null } | null)?.ticket_id ?? null;

  if (linkedTicketId) {
    const { data: ticketRow } = await db
      .from("support_tickets")
      .select("id, ticket_number, reference, subject, status, organization_id, user_id, assigned_to, team_id, merged_into_id")
      .eq("id", linkedTicketId)
      .maybeSingle();
    const ticket = ticketRow as Record<string, unknown> | null;
    const targetId = (ticket?.["merged_into_id"] as string | null) ?? (ticket?.["id"] as string | undefined);
    if (ticket && targetId) {
      await appendCustomerReply(db, targetId, {
        authorName: input.fromName ?? input.from,
        body: input.body,
        emailMessageId: input.emailMessageId,
      });
      await finish("appended", targetId);
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
  await finish("created", created.id);
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
  return { outcome: "created", ticketId: created.id, ticketNumber: created.ticketNumber };
}

/** رد المكتب عبر البريد: رسالة في التذكرة + استئناف عدّاد المهلة. */
export async function appendCustomerReply(
  db: Db,
  ticketId: string,
  input: { authorName: string; body: string; emailMessageId?: string | null },
): Promise<void> {
  const body = input.body.trim() || "—";
  await db.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    author_name: input.authorName.slice(0, 160),
    is_staff: false,
    body,
  });

  const nowIso = new Date().toISOString();
  const { data: ticketRow } = await db
    .from("support_tickets")
    .select("status, paused_at, paused_total_seconds")
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = ticketRow as { status: string; paused_at: string | null; paused_total_seconds: number } | null;

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
      patch["reopened_count"] = ((countRow as { reopened_count: number } | null)?.reopened_count ?? 0) + 1;
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
