/**
 * إشعارات مركز الدعم — خادمية فقط.
 *
 * لا محرك إشعارات جديد: إشعارات المكاتب تُكتب في جدول `notifications` القائم
 * بمفتاح `dedup_key`، وبريد الموظفين يمر من محرك البريد الحالي (صندوق الدعم).
 * كل إشعار يحمل مفتاح تفرّد فلا يُكرَّر عند إعادة المحاولة أو تكرار الحدث.
 */
import { queueMessage } from "@/lib/email/workspace.server";
import { createUserNotification } from "@/lib/notifications/email-channel.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type SupportNotifyEvent =
  | "ticket_created"
  | "assigned"
  | "status_changed"
  | "new_reply"
  | "awaiting_customer"
  | "sla_warning"
  | "sla_breached"
  | "escalated"
  | "resolved"
  | "closed"
  | "reopened"
  | "csat_requested";

const CUSTOMER_COPY: Partial<
  Record<SupportNotifyEvent, { title: string; message: (ref: string) => string }>
> = {
  ticket_created: {
    title: "استلمنا طلب الدعم",
    message: (ref) => `تم فتح التذكرة ${ref} وسيتابعها فريق الدعم.`,
  },
  new_reply: {
    title: "رد جديد من فريق الدعم",
    message: (ref) => `وصلك رد على التذكرة ${ref}.`,
  },
  awaiting_customer: {
    title: "التذكرة بانتظار ردّكم",
    message: (ref) => `فريق الدعم بانتظار معلومات إضافية على التذكرة ${ref}.`,
  },
  resolved: { title: "تم حل التذكرة", message: (ref) => `سجّل فريق الدعم حلاً للتذكرة ${ref}.` },
  closed: { title: "تم إغلاق التذكرة", message: (ref) => `أُغلقت التذكرة ${ref}.` },
  reopened: { title: "أُعيد فتح التذكرة", message: (ref) => `أُعيد فتح التذكرة ${ref} للمتابعة.` },
  csat_requested: {
    title: "قيّم خدمة الدعم",
    message: (ref) => `يسعدنا تقييمك لخدمة الدعم على التذكرة ${ref}.`,
  },
};

const STAFF_SUBJECTS: Partial<Record<SupportNotifyEvent, string>> = {
  assigned: "أُسندت إليك تذكرة دعم",
  escalated: "تصعيد تذكرة دعم",
  sla_warning: "تذكرة قاربت تجاوز المهلة",
  sla_breached: "تذكرة تجاوزت المهلة",
  new_reply: "رد جديد من المكتب على تذكرة",
};

export type NotifyTicket = {
  id: string;
  ticket_number?: string | null;
  reference?: string | null;
  subject?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  assigned_to?: string | null;
  team_id?: string | null;
};

function ticketRef(ticket: NotifyTicket): string {
  return ticket.ticket_number ?? ticket.reference ?? "—";
}

/** إشعار داخل المنصة للمكتب — يُكتب مرة واحدة لكل (تذكرة + حدث + بصمة). */
export async function notifyOffice(
  db: Db,
  ticket: NotifyTicket,
  event: SupportNotifyEvent,
  stamp = "",
): Promise<{ sent: boolean; duplicate: boolean }> {
  const copy = CUSTOMER_COPY[event];
  if (!copy || !ticket.organization_id || !ticket.user_id) return { sent: false, duplicate: false };
  const dedupKey = `support:${ticket.id}:${event}${stamp ? `:${stamp}` : ""}`;

  const { data: existing } = await db
    .from("notifications")
    .select("id")
    .eq("dedup_key", dedupKey)
    .maybeSingle();
  if (existing) return { sent: false, duplicate: true };

  // إنشاء الإشعار داخل التطبيق ثم محاولة إدراجه في قناة البريد؛ فشل البريد
  // معزول تماماً ولا يُبطل الإشعار ولا العملية الأصلية.
  try {
    const result = await createUserNotification(db, {
      organizationId: ticket.organization_id,
      userId: ticket.user_id,
      type: `support_${event}`,
      title: copy.title,
      message: copy.message(ticketRef(ticket)),
      dedupKey,
      sentAt: new Date().toISOString(),
    });
    if (result.duplicate) return { sent: false, duplicate: true };
    return { sent: result.notificationId !== null, duplicate: false };
  } catch {
    return { sent: false, duplicate: false };
  }
}

/** بريد تنبيه لموظف الدعم عبر محرك البريد القائم (صندوق الدعم). */
export async function notifyStaff(
  db: Db,
  ticket: NotifyTicket,
  event: SupportNotifyEvent,
  options: { targetUserId?: string | null; reason?: string; stamp?: string } = {},
): Promise<{ sent: boolean; duplicate: boolean }> {
  const subject = STAFF_SUBJECTS[event];
  const targetUserId = options.targetUserId ?? ticket.assigned_to ?? null;
  if (!subject || !targetUserId) return { sent: false, duplicate: false };

  const dedupeKey = `notify:${ticket.id}:${event}:${targetUserId}${options.stamp ? `:${options.stamp}` : ""}`;
  const { error: claimError } = await db
    .from("support_ticket_ingest")
    .insert({ dedupe_key: dedupeKey.slice(0, 200), ticket_id: ticket.id, outcome: "skipped" });
  if (claimError && String(claimError.code) === "23505") return { sent: false, duplicate: true };

  const { data: staffRow } = await db
    .from("platform_staff")
    .select("email, full_name")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const staff = staffRow as { email: string | null; full_name: string | null } | null;
  if (!staff?.email) return { sent: false, duplicate: false };

  const { data: boxRow } = await db
    .from("email_mailboxes")
    .select("id")
    .eq("address", "support@mehlalex.com")
    .maybeSingle();
  const mailboxId = (boxRow as { id: string } | null)?.id ?? null;
  if (!mailboxId) return { sent: false, duplicate: false };

  const ref = ticketRef(ticket);
  const lines = [
    `<p>التذكرة: <strong>${ref}</strong></p>`,
    `<p>الموضوع: ${escapeHtml(ticket.subject ?? "—")}</p>`,
    options.reason ? `<p>السبب: ${escapeHtml(options.reason)}</p>` : "",
    `<p>يمكنك متابعة التذكرة من لوحة إدارة مِهلة › مركز الدعم.</p>`,
  ].join("");

  try {
    await queueMessage(
      db,
      { userId: targetUserId, email: staff.email },
      {
        mailboxId,
        threadId: null,
        to: [staff.email],
        cc: [],
        bcc: [],
        subject: `[${ref}] ${subject}`,
        html: `<div dir="rtl">${lines}</div>`,
      },
    );
    return { sent: true, duplicate: false };
  } catch {
    return { sent: false, duplicate: false };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
