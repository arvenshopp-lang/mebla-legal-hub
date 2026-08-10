/**
 * تقييم رضا المكتب (CSAT) — خادمي فقط.
 * الرابط يحمل رمزاً عشوائياً لا يُخزَّن إلا مُهشَّراً (SHA-256)، صالح لمرة واحدة
 * وبمدة محددة، ولا يكشف أي بيانات عن المكتب أو التذكرة غير الموضوع والرقم.
 */
import { queueMessage } from "@/lib/email/workspace.server";
import { writeTicketEvent } from "./tickets.server";
import { notifyOffice } from "./notify.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const CSAT_TTL_DAYS = 14;

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function csatUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/csat/${token}`;
}

/** إنشاء دعوة تقييم وإرسالها بالبريد — دعوة واحدة فعّالة لكل تذكرة. */
export async function requestCsat(
  db: Db,
  ticketId: string,
  actor: { userId: string; email: string; name: string },
  origin: string,
): Promise<{ sent: boolean; skipped?: string }> {
  const { data: ticketRow } = await db
    .from("support_tickets")
    .select(
      "id, ticket_number, reference, subject, status, organization_id, user_id, requester_email, team_id, assigned_to, category, csat_requested_at, rated_at",
    )
    .eq("id", ticketId)
    .maybeSingle();
  const ticket = ticketRow as Record<string, unknown> | null;
  if (!ticket) throw new Error("التذكرة غير موجودة.");
  if (ticket["rated_at"]) return { sent: false, skipped: "already_rated" };

  const { data: openInvite } = await db
    .from("support_csat_invitations")
    .select("id")
    .eq("ticket_id", ticketId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (openInvite) return { sent: false, skipped: "invite_active" };

  let recipient = (ticket["requester_email"] as string | null) ?? null;
  if (!recipient && ticket["user_id"]) {
    const { data } = await db
      .from("profiles")
      .select("email")
      .eq("id", ticket["user_id"])
      .maybeSingle();
    recipient = (data as { email: string | null } | null)?.email ?? null;
  }
  if (!recipient) return { sent: false, skipped: "no_recipient" };

  const token = newToken();
  const expiresAt = new Date(Date.now() + CSAT_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await db.from("support_csat_invitations").insert({
    ticket_id: ticketId,
    token_hash: await hashToken(token),
    recipient_email: recipient.toLowerCase(),
    expires_at: expiresAt,
    staff_id: (ticket["assigned_to"] as string | null) ?? actor.userId,
    team_id: (ticket["team_id"] as string | null) ?? null,
    category: (ticket["category"] as string | null) ?? null,
  });
  if (error) throw new Error("تعذّر إنشاء دعوة التقييم.");

  const ref = (ticket["ticket_number"] as string | null) ?? (ticket["reference"] as string);
  const link = csatUrl(token, origin);
  const mailboxId = await supportMailboxId(db, ticket["team_id"] as string | null);
  let sent = false;
  if (mailboxId) {
    const result = await queueMessage(
      db,
      { userId: actor.userId, email: actor.email },
      {
        mailboxId,
        threadId: null,
        to: [recipient],
        cc: [],
        bcc: [],
        subject: `[${ref}] تقييم خدمة الدعم`,
        html: `<div dir="rtl" style="font-family:'Tajawal',Tahoma,Arial,sans-serif;line-height:1.9">
          <p>أُغلقت تذكرة الدعم <strong>${ref}</strong> بشأن: ${escapeHtml(String(ticket["subject"] ?? ""))}.</p>
          <p>تقييمكم يساعدنا على تحسين مستوى الخدمة، ولا يستغرق أكثر من دقيقة:</p>
          <p><a href="${link}" style="background:#123C32;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">تقييم الخدمة</a></p>
          <p style="color:#6b6b6b;font-size:12px">الرابط صالح لمدة ${CSAT_TTL_DAYS} يوماً ولمرة واحدة.</p>
        </div>`,
      },
    );
    sent = result.sent;
  }

  await db
    .from("support_tickets")
    .update({ csat_requested_at: new Date().toISOString() })
    .eq("id", ticketId);
  await writeTicketEvent(db, {
    ticketId,
    eventType: "csat_requested",
    actorId: actor.userId,
    actorName: actor.name,
    after: { recipient_domain: recipient.split("@")[1] ?? null },
  });
  await notifyOffice(
    db,
    {
      id: ticketId,
      ticket_number: ref,
      organization_id: (ticket["organization_id"] as string | null) ?? null,
      user_id: (ticket["user_id"] as string | null) ?? null,
    },
    "csat_requested",
  );
  return { sent };
}

/** قراءة دعوة تقييم عبر الرمز — بيانات عرض محدودة فقط. */
export async function loadCsatInvite(
  db: Db,
  token: string,
): Promise<{
  state: "ok" | "used" | "expired" | "invalid";
  ticketRef?: string;
  subject?: string;
  rating?: number | null;
}> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { state: "invalid" };
  const { data } = await db
    .from("support_csat_invitations")
    .select("id, ticket_id, used_at, expires_at, rating")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  const invite = data as {
    id: string;
    ticket_id: string;
    used_at: string | null;
    expires_at: string;
    rating: number | null;
  } | null;
  if (!invite) return { state: "invalid" };

  const { data: ticketRow } = await db
    .from("support_tickets")
    .select("ticket_number, reference, subject")
    .eq("id", invite.ticket_id)
    .maybeSingle();
  const ticket = ticketRow as {
    ticket_number: string | null;
    reference: string;
    subject: string;
  } | null;
  const shape = {
    ticketRef: ticket?.ticket_number ?? ticket?.reference ?? "—",
    subject: ticket?.subject ?? "—",
    rating: invite.rating,
  };
  if (invite.used_at) return { state: "used", ...shape };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { state: "expired", ...shape };
  return { state: "ok", ...shape };
}

/** تسجيل التقييم — مرة واحدة لكل دعوة. */
export async function submitCsat(
  db: Db,
  token: string,
  rating: number,
  comment: string | null,
): Promise<{ ok: true }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("رابط التقييم غير صالح.");
  const hash = await hashToken(token);
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("support_csat_invitations")
    .update({ rating, comment, used_at: nowIso })
    .eq("token_hash", hash)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("ticket_id, staff_id")
    .maybeSingle();
  if (error) throw new Error("تعذّر تسجيل التقييم.");
  const invite = data as { ticket_id: string; staff_id: string | null } | null;
  if (!invite) throw new Error("انتهت صلاحية رابط التقييم أو استُخدم مسبقاً.");

  let staffName: string | null = null;
  if (invite.staff_id) {
    const { data: staffRow } = await db
      .from("platform_staff")
      .select("full_name")
      .eq("user_id", invite.staff_id)
      .maybeSingle();
    staffName = (staffRow as { full_name: string | null } | null)?.full_name ?? null;
  }

  await db
    .from("support_tickets")
    .update({ rating, rating_comment: comment, rated_at: nowIso, rated_staff_name: staffName })
    .eq("id", invite.ticket_id);
  await writeTicketEvent(db, {
    ticketId: invite.ticket_id,
    eventType: "csat_received",
    actorKind: "customer",
    actorName: "مُقدّم الطلب",
    after: { rating },
  });
  return { ok: true };
}

async function supportMailboxId(db: Db, teamId: string | null): Promise<string | null> {
  if (teamId) {
    const { data } = await db
      .from("support_teams")
      .select("mailbox_id")
      .eq("id", teamId)
      .maybeSingle();
    const id = (data as { mailbox_id: string | null } | null)?.mailbox_id ?? null;
    if (id) return id;
  }
  const { data } = await db
    .from("email_mailboxes")
    .select("id")
    .eq("address", "support@mehlalex.com")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
