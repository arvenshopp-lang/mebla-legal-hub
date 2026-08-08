/**
 * أنواع وثوابت مركز الدعم — مشتركة بين الخادم والواجهة.
 * لا يوجد هنا أي منطق خادمي أو أسرار، ولا أي حساب مهل (المهل تُحسب خادمياً فقط).
 */

export const TICKET_STATUSES = [
  "new",
  "in_progress",
  "awaiting_reply",
  "pending_internal",
  "escalated",
  "resolved",
  "closed",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS_AR: Record<TicketStatus, string> = {
  new: "جديدة",
  in_progress: "قيد المعالجة",
  awaiting_reply: "بانتظار المكتب",
  pending_internal: "بانتظار جهة داخلية",
  escalated: "مُصعَّدة",
  resolved: "تم الحل",
  closed: "مغلقة",
};

/** الانتقالات المسموحة — تُفرض خادمياً، والواجهة تعرضها فقط. */
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ["in_progress", "awaiting_reply", "pending_internal", "escalated", "resolved", "closed"],
  in_progress: ["awaiting_reply", "pending_internal", "escalated", "resolved", "closed"],
  awaiting_reply: ["in_progress", "pending_internal", "escalated", "resolved", "closed"],
  pending_internal: ["in_progress", "awaiting_reply", "escalated", "resolved", "closed"],
  escalated: ["in_progress", "awaiting_reply", "pending_internal", "resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (TICKET_TRANSITIONS[from] ?? []).includes(to);
}

/** الحالات التي يتوقف فيها عدّاد المهلة (انتظار طرف خارج فريق الدعم). */
export const PAUSING_STATUSES: TicketStatus[] = ["awaiting_reply", "pending_internal"];

/** الحالات المنتهية — لا مهل جارية عليها. */
export const TERMINAL_STATUSES: TicketStatus[] = ["resolved", "closed"];

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/* ------------------------------------------------------------ مصدر الاستيعاب */

/** مصادر استيعاب البريد الوارد في مركز الدعم. */
export const INGEST_SOURCES = ["imap_sync", "inbound_webhook", "agentic"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const INGEST_SOURCE_LABELS_AR: Record<IngestSource, string> = {
  imap_sync: "مزامنة IMAP",
  inbound_webhook: "ويبهوك بريد وارد",
  agentic: "مزوّد البريد الذكي",
};

/** سبب ارتباط الرسالة الواردة بالتذكرة. */
export const INGEST_MATCH_REASONS = [
  "thread_ticket",
  "message_ticket",
  "thread_source",
  "header_reference",
  "new_ticket",
] as const;
export type IngestMatchReason = (typeof INGEST_MATCH_REASONS)[number];

export const INGEST_MATCH_REASON_LABELS_AR: Record<IngestMatchReason, string> = {
  thread_ticket: "ارتباط بنفس المحادثة",
  message_ticket: "مطابقة رسالة سابقة في المحادثة",
  thread_source: "تذكرة أُنشئت من هذه المحادثة",
  header_reference: "مطابقة ترويسات الرد",
  new_ticket: "تذكرة جديدة من هذه المحادثة",
};

export function ingestSourceLabel(value: string | null): string | null {
  return value && value in INGEST_SOURCE_LABELS_AR
    ? INGEST_SOURCE_LABELS_AR[value as IngestSource]
    : null;
}

export function ingestMatchReasonLabel(value: string | null): string | null {
  return value && value in INGEST_MATCH_REASON_LABELS_AR
    ? INGEST_MATCH_REASON_LABELS_AR[value as IngestMatchReason]
    : null;
}

export const TICKET_PRIORITY_LABELS_AR: Record<TicketPriority, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

export const TICKET_CHANNELS = [
  "email",
  "portal",
  "phone",
  "internal",
  "whatsapp",
  "chat",
] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export const TICKET_CHANNEL_LABELS: Record<TicketChannel, string> = {
  email: "بريد إلكتروني",
  portal: "نموذج المكتب",
  phone: "هاتف",
  internal: "إنشاء داخلي",
  whatsapp: "واتساب",
  chat: "محادثة",
};

export type SlaState = "ok" | "warning" | "critical" | "breached" | "paused" | "met";

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  ok: "داخل المهلة",
  warning: "قارب على التجاوز",
  critical: "على وشك التجاوز",
  breached: "تجاوز المهلة",
  paused: "المهلة موقوفة",
  met: "أُنجزت داخل المهلة",
};

export const SLA_STATE_TONES: Record<
  SlaState,
  "muted" | "green" | "gold" | "warn" | "red" | "info"
> = {
  ok: "green",
  warning: "gold",
  critical: "warn",
  breached: "red",
  paused: "muted",
  met: "green",
};

export const TICKET_EVENT_LABELS: Record<string, string> = {
  created: "إنشاء التذكرة",
  status_changed: "تغيير الحالة",
  assigned: "إسناد",
  unassigned: "إلغاء الإسناد",
  team_changed: "تغيير الفريق",
  priority_changed: "تغيير الأولوية",
  category_changed: "تغيير التصنيف",
  staff_reply: "رد على المكتب",
  customer_reply: "رد المكتب",
  internal_note: "ملاحظة داخلية",
  escalated: "تصعيد",
  merged: "دمج",
  merge_target: "استقبال دمج",
  split: "تقسيم",
  reopened: "إعادة فتح",
  tag_added: "إضافة وسم",
  tag_removed: "إزالة وسم",
  sla_applied: "تطبيق سياسة مهل",
  csat_requested: "طلب تقييم",
  csat_received: "استلام تقييم",
  identity_reviewed: "مراجعة هوية مُقدّم الطلب",
};

export const SLA_EVENT_LABELS: Record<string, string> = {
  applied: "تطبيق السياسة",
  paused: "إيقاف العدّاد",
  resumed: "استئناف العدّاد",
  warning: "تحذير اقتراب المهلة",
  critical: "تحذير حرج",
  breached: "تجاوز المهلة",
  met: "الإنجاز داخل المهلة",
  escalated: "تصعيد بسبب المهلة",
  recalculated: "إعادة حساب المهلة",
};

export const IDENTITY_SOURCE_LABELS: Record<string, string> = {
  session: "جلسة مستخدم مسجّل",
  email_match: "مطابقة بريد",
  domain_match: "مطابقة نطاق المكتب",
  manual: "تحديد يدوي",
  unknown: "غير معروف",
};

export type TicketListRow = {
  id: string;
  ticket_number: string | null;
  reference: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  channel: TicketChannel;
  sla_state: SlaState;
  escalation_level: number;
  team_id: string | null;
  team_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  requester_email: string | null;
  requester_name: string | null;
  needs_identity_review: boolean;
  due_first_response_at: string | null;
  due_resolution_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  last_activity_at: string;
  created_at: string;
  rating: number | null;
  merged_into_id: string | null;
  reopened_count: number;
};

export type SupportJson =
  | string
  | number
  | boolean
  | null
  | SupportJson[]
  | { [key: string]: SupportJson };

export type TicketTimelineEvent = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_kind: string;
  value_before: SupportJson;
  value_after: SupportJson;
  reason: string | null;
  created_at: string;
};

export type TicketDetail = {
  ticket: TicketListRow & {
    description: string;
    sla_policy_id: string | null;
    sla_policy_name: string | null;
    paused_at: string | null;
    paused_total_seconds: number;
    rating_comment: string | null;
    rated_at: string | null;
    rated_staff_name: string | null;
    source_email_thread_id: string | null;
    split_from_id: string | null;
    identity_source: string | null;
    subscription_plan: string | null;
  };
  messages: {
    id: string;
    author_name: string;
    is_staff: boolean;
    body: string;
    created_at: string;
    attachments: { id: string; file_name: string; size_bytes: number }[];
    email_message_id: string | null;
    email_thread_id: string | null;
    ingest_source: string | null;
    ingest_match_reason: string | null;
  }[];
  notes: { id: string; author_name: string; body: string; created_at: string }[];
  events: TicketTimelineEvent[];
  slaEvents: {
    id: string;
    event_type: string;
    metric: string;
    due_at: string | null;
    occurred_at: string;
    reason: string;
  }[];
  tags: { id: string; name_ar: string; color: string }[];
  ingest: {
    inbound_count: number;
    first_source: string | null;
    first_match_reason: string | null;
    first_thread_id: string | null;
  };
  allowedTransitions: TicketStatus[];
};

/** فرق زمني مقروء بالعربية بين طابعين (للعرض فقط). */
export function humanDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return "—";
  const minutes = Math.max(
    0,
    Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000),
  );
  return humanMinutes(minutes);
}

export function humanMinutes(minutes: number): string {
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} ساعة و${rest} دقيقة` : `${hours} ساعة`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} يوم و${restHours} ساعة` : `${days} يوم`;
}

/** الوقت المتبقي للمهلة كنص مقروء (سلبي = تجاوز). */
export function dueLabel(dueIso: string | null, nowMs = Date.now()): string {
  if (!dueIso) return "—";
  const diff = Math.round((new Date(dueIso).getTime() - nowMs) / 60000);
  return diff >= 0 ? `متبقٍ ${humanMinutes(diff)}` : `تجاوز بـ ${humanMinutes(-diff)}`;
}
