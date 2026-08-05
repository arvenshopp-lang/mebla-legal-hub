/**
 * محرك مركز الدعم — خادمي فقط.
 *
 * مبادئ ثابتة:
 *  - كل انتقال حالة يمر من `transitionTicket` (تحقق صلاحية + تحديث مهل + حدث تدقيق).
 *  - الدعم لا يملك مزوّد إرسال ولا صندوقاً ولا محرك مرفقات: كل بريد يمر من
 *    `src/lib/email/workspace.server.ts`.
 *  - لا حذف: الدمج والتقسيم يحافظان على المراجع، والأحداث إدراج فقط.
 */
import { queueMessage } from "@/lib/email/workspace.server";
import {
  computeDueDates,
  evaluateSlaState,
  selectPolicy,
  shiftDueDates,
  writeSlaEvent,
  type SlaPolicy,
} from "./sla.server";
import {
  PAUSING_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  type TicketChannel,
  type TicketDetail,
  type TicketListRow,
  type TicketPriority,
  type TicketStatus,
} from "./support.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type SupportActor = {
  userId: string;
  email: string;
  name: string;
  isSuper: boolean;
  canViewAllOffices: boolean;
  teamIds: string[];
};

const TICKET_COLUMNS =
  "id, ticket_number, reference, subject, description, status, priority, category, channel, sla_state, escalation_level, team_id, assigned_to, organization_id, subscription_id, requester_email, requester_name, identity_source, needs_identity_review, due_first_response_at, due_resolution_at, first_response_at, resolved_at, closed_at, created_at, updated_at, last_reply_at, last_customer_reply_at, last_staff_reply_at, paused_at, paused_total_seconds, rating, rating_comment, rated_at, rated_staff_name, merged_into_id, split_from_id, reopened_count, sla_policy_id, source_email_thread_id, user_id, csat_requested_at";

/* ------------------------------------------------------------ الفاعل والنطاق */

export async function loadSupportActor(
  db: Db,
  staff: { user_id: string; email: string; full_name: string; role: string },
  effectivePermissions: string[],
): Promise<SupportActor> {
  const { data } = await db
    .from("support_team_members")
    .select("team_id")
    .eq("user_id", staff.user_id);
  const isSuper = staff.role === "super_admin";
  return {
    userId: staff.user_id,
    email: staff.email,
    name: staff.full_name,
    isSuper,
    canViewAllOffices: isSuper || effectivePermissions.includes("support.view_all_offices"),
    teamIds: ((data ?? []) as { team_id: string }[]).map((r) => r.team_id),
  };
}

/** فلترة النطاق تُطبَّق في الاستعلام لا في الواجهة. */
function applyScope(query: Db, actor: SupportActor): Db {
  if (actor.canViewAllOffices) return query;
  const clauses = [`assigned_to.eq.${actor.userId}`];
  if (actor.teamIds.length > 0) clauses.push(`team_id.in.(${actor.teamIds.join(",")})`);
  return query.or(clauses.join(","));
}

/* ------------------------------------------------------------ القراءة */

/** أعداد قوائم العمل (Queues) — تُحسب خادمياً ضمن نطاق رؤية الموظف نفسه. */
export type SupportQueueKey =
  | "all"
  | "mine"
  | "unassigned"
  | "new"
  | "open"
  | "awaiting_reply"
  | "pending_internal"
  | "escalated"
  | "at_risk"
  | "breached"
  | "resolved"
  | "closed"
  | "needs_review";

export async function queueCounts(
  db: Db,
  actor: SupportActor,
): Promise<Record<SupportQueueKey, number>> {
  const base = () =>
    applyScope(
      db
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .is("merged_into_id", null),
      actor,
    );

  const queries: Record<SupportQueueKey, () => Db> = {
    all: () => base(),
    mine: () => base().eq("assigned_to", actor.userId).not("status", "in", "(closed,resolved)"),
    unassigned: () => base().is("assigned_to", null).not("status", "in", "(closed,resolved)"),
    new: () => base().eq("status", "new"),
    open: () => base().not("status", "in", "(closed,resolved)"),
    awaiting_reply: () => base().eq("status", "awaiting_reply"),
    pending_internal: () => base().eq("status", "pending_internal"),
    escalated: () => base().eq("status", "escalated"),
    at_risk: () =>
      base().in("sla_state", ["warning", "critical"]).not("status", "in", "(closed,resolved)"),
    breached: () => base().eq("sla_state", "breached"),
    resolved: () => base().eq("status", "resolved"),
    closed: () => base().eq("status", "closed"),
    needs_review: () => base().eq("needs_identity_review", true),
  };

  const keys = Object.keys(queries) as SupportQueueKey[];
  const results = await Promise.all(keys.map((key) => queries[key]!()));
  const out = {} as Record<SupportQueueKey, number>;
  keys.forEach((key, index) => {
    out[key] = ((results[index] as { count: number | null }).count ?? 0) as number;
  });
  return out;
}

export type TicketFilters = {
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  channel?: string;
  teamId?: string;
  assignedTo?: string;
  slaState?: string;
  organizationId?: string;
  onlyBreached?: boolean;
  onlyUnassigned?: boolean;
  needsReview?: boolean;
  limit?: number;
  offset?: number;
};

export async function listTickets(
  db: Db,
  actor: SupportActor,
  filters: TicketFilters,
): Promise<{ rows: TicketListRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = db
    .from("support_tickets")
    .select(TICKET_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  query = applyScope(query, actor);
  if (filters.status === "open") query = query.not("status", "in", "(closed,resolved)");
  else if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.priority && filters.priority !== "all")
    query = query.eq("priority", filters.priority);
  if (filters.category && filters.category !== "all")
    query = query.eq("category", filters.category);
  if (filters.channel && filters.channel !== "all") query = query.eq("channel", filters.channel);
  if (filters.teamId && filters.teamId !== "all") query = query.eq("team_id", filters.teamId);
  if (filters.assignedTo === "me") query = query.eq("assigned_to", actor.userId);
  else if (filters.assignedTo && filters.assignedTo !== "all")
    query = query.eq("assigned_to", filters.assignedTo);
  if (filters.onlyUnassigned) query = query.is("assigned_to", null);
  if (filters.slaState === "at_risk") query = query.in("sla_state", ["warning", "critical"]);
  else if (filters.slaState && filters.slaState !== "all")
    query = query.eq("sla_state", filters.slaState);
  if (filters.onlyBreached) query = query.eq("sla_state", "breached");
  if (filters.needsReview) query = query.eq("needs_identity_review", true);
  if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);

  const term = (filters.search ?? "").trim().replace(/[,()]/g, "");
  if (term) {
    query = query.or(
      `subject.ilike.%${term}%,reference.ilike.%${term}%,ticket_number.ilike.%${term}%,requester_email.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error("تعذّر تحميل التذاكر.");
  const rows = (data ?? []) as Record<string, unknown>[];
  return { rows: await decorate(db, rows), total: count ?? rows.length };
}

/** إثراء الصفوف بأسماء الفريق والمكتب والموظف — بلا أي بيانات مكتب حساسة. */
async function decorate(db: Db, rows: Record<string, unknown>[]): Promise<TicketListRow[]> {
  if (rows.length === 0) return [];
  const teamIds = unique(rows.map((r) => r["team_id"] as string | null));
  const orgIds = unique(rows.map((r) => r["organization_id"] as string | null));
  const staffIds = unique(rows.map((r) => r["assigned_to"] as string | null));

  const [teams, orgs, staff] = await Promise.all([
    teamIds.length
      ? db.from("support_teams").select("id, name_ar").in("id", teamIds)
      : { data: [] },
    orgIds.length ? db.from("organizations").select("id, name").in("id", orgIds) : { data: [] },
    staffIds.length
      ? db.from("platform_staff").select("user_id, full_name").in("user_id", staffIds)
      : { data: [] },
  ]);

  const teamMap = new Map(
    ((teams.data ?? []) as { id: string; name_ar: string }[]).map((t) => [t.id, t.name_ar]),
  );
  const orgMap = new Map(
    ((orgs.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
  );
  const staffMap = new Map(
    ((staff.data ?? []) as { user_id: string; full_name: string }[]).map((s) => [
      s.user_id,
      s.full_name,
    ]),
  );

  return rows.map((r) => ({
    ...(r as unknown as TicketListRow),
    team_name: r["team_id"] ? (teamMap.get(r["team_id"] as string) ?? null) : null,
    organization_name: r["organization_id"]
      ? (orgMap.get(r["organization_id"] as string) ?? null)
      : null,
    assignee_name: r["assigned_to"] ? (staffMap.get(r["assigned_to"] as string) ?? null) : null,
    last_activity_at: (r["updated_at"] as string) ?? (r["created_at"] as string),
  }));
}

function unique(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

export async function getTicket(
  db: Db,
  actor: SupportActor,
  ticketId: string,
): Promise<TicketDetail> {
  const { data: row } = await db
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .eq("id", ticketId)
    .maybeSingle();
  if (!row) throw new Error("التذكرة غير موجودة.");
  const ticket = row as Record<string, unknown>;

  if (!actor.canViewAllOffices) {
    const mine =
      ticket["assigned_to"] === actor.userId ||
      (typeof ticket["team_id"] === "string" &&
        actor.teamIds.includes(ticket["team_id"] as string));
    if (!mine) throw new Error("هذه التذكرة خارج نطاق فرقك.");
  }

  const [messages, notes, events, slaEvents, tags, policy, subscription] = await Promise.all([
    db.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at"),
    db.from("support_internal_notes").select("*").eq("ticket_id", ticketId).order("created_at"),
    db
      .from("support_ticket_events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false }),
    db
      .from("support_sla_events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("occurred_at", { ascending: false }),
    db
      .from("support_ticket_tags")
      .select("tag_id, support_tags(id, name_ar, color)")
      .eq("ticket_id", ticketId),
    ticket["sla_policy_id"]
      ? db
          .from("support_sla_policies")
          .select("name_ar")
          .eq("id", ticket["sla_policy_id"])
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ticket["subscription_id"]
      ? db
          .from("subscriptions")
          .select("plan_code")
          .eq("id", ticket["subscription_id"])
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [decorated] = await decorate(db, [ticket]);
  const status = ticket["status"] as TicketStatus;

  return {
    ticket: {
      ...(decorated as TicketDetail["ticket"]),
      description: ticket["description"] as string,
      sla_policy_name: (policy.data as { name_ar: string } | null)?.name_ar ?? null,
      subscription_plan: (subscription.data as { plan_code: string } | null)?.plan_code ?? null,
    },
    messages: ((messages.data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m["id"] as string,
      author_name: m["author_name"] as string,
      is_staff: m["is_staff"] as boolean,
      body: m["body"] as string,
      created_at: m["created_at"] as string,
      attachments: (m["attachments"] ?? []) as {
        id: string;
        file_name: string;
        size_bytes: number;
      }[],
    })),
    notes: ((notes.data ?? []) as Record<string, unknown>[]).map((n) => ({
      id: n["id"] as string,
      author_name: n["author_name"] as string,
      body: n["body"] as string,
      created_at: n["created_at"] as string,
    })),
    events: (events.data ?? []) as TicketDetail["events"],
    slaEvents: (slaEvents.data ?? []) as TicketDetail["slaEvents"],
    tags: (
      (tags.data ?? []) as { support_tags: { id: string; name_ar: string; color: string } | null }[]
    )
      .map((t) => t.support_tags)
      .filter((t): t is { id: string; name_ar: string; color: string } => !!t),
    allowedTransitions: ticket["merged_into_id"]
      ? []
      : (
          [
            "new",
            "in_progress",
            "awaiting_reply",
            "pending_internal",
            "escalated",
            "resolved",
            "closed",
          ] as TicketStatus[]
        ).filter((s) => canTransition(status, s)),
  };
}

/* ------------------------------------------------------------ سجل الأحداث */

export async function writeTicketEvent(
  db: Db,
  entry: {
    ticketId: string;
    eventType: string;
    actorId?: string | null;
    actorName?: string | null;
    actorKind?: "staff" | "customer" | "system";
    before?: unknown;
    after?: unknown;
    reason?: string | null;
    emailMessageId?: string | null;
    internalNoteId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.from("support_ticket_events").insert({
    ticket_id: entry.ticketId,
    event_type: entry.eventType,
    actor_id: entry.actorId ?? null,
    actor_name: entry.actorName ?? null,
    actor_kind: entry.actorKind ?? "staff",
    value_before: entry.before ?? null,
    value_after: entry.after ?? null,
    reason: entry.reason ?? null,
    email_message_id: entry.emailMessageId ?? null,
    internal_note_id: entry.internalNoteId ?? null,
    metadata: entry.metadata ?? {},
  });
}

/* ------------------------------------------------------------ التعرّف على المكتب */

export type ResolvedIdentity = {
  userId: string | null;
  organizationId: string | null;
  subscriptionId: string | null;
  planCode: string | null;
  identitySource: string;
  needsReview: boolean;
  requesterName: string | null;
};

export async function resolveIdentity(
  db: Db,
  input: { email: string | null; userId?: string | null; name?: string | null },
): Promise<ResolvedIdentity> {
  const email = input.email?.trim().toLowerCase() || null;
  let userId = input.userId ?? null;
  let source = input.userId ? "session" : "unknown";
  let name = input.name ?? null;

  if (!userId && email) {
    const { data } = await db
      .from("profiles")
      .select("id, full_name")
      .eq("email", email)
      .maybeSingle();
    const profile = data as { id: string; full_name: string | null } | null;
    if (profile) {
      userId = profile.id;
      name = name ?? profile.full_name;
      source = "email_match";
    }
  }

  let organizationId: string | null = null;
  if (userId) {
    const { data } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at")
      .limit(1);
    organizationId = ((data ?? []) as { organization_id: string }[])[0]?.organization_id ?? null;
  }
  if (!organizationId && email) {
    const domain = email.split("@")[1];
    if (domain && !FREE_MAIL_DOMAINS.includes(domain)) {
      const { data } = await db
        .from("organizations")
        .select("id, email")
        .ilike("email", `%@${domain}`)
        .limit(2);
      const orgs = (data ?? []) as { id: string }[];
      if (orgs.length === 1 && orgs[0]) {
        organizationId = orgs[0].id;
        source = source === "unknown" ? "domain_match" : source;
      }
    }
  }

  let subscriptionId: string | null = null;
  let planCode: string | null = null;
  if (organizationId) {
    const { data } = await db
      .from("subscriptions")
      .select("id, plan_code, status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1);
    const sub = ((data ?? []) as { id: string; plan_code: string }[])[0];
    if (sub) {
      subscriptionId = sub.id;
      planCode = sub.plan_code;
    }
  }

  return {
    userId,
    organizationId,
    subscriptionId,
    planCode,
    identitySource: source,
    needsReview: !userId && !organizationId,
    requesterName: name,
  };
}

const FREE_MAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
];

/* ------------------------------------------------------------ الإنشاء */

export type CreateTicketInput = {
  subject: string;
  description: string;
  category: string;
  priority?: TicketPriority | null;
  channel: TicketChannel;
  requesterEmail?: string | null;
  requesterName?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  sourceEmailThreadId?: string | null;
  splitFromId?: string | null;
  actor?: { userId: string; name: string } | null;
};

export async function createTicket(
  db: Db,
  input: CreateTicketInput,
): Promise<{ id: string; ticketNumber: string }> {
  const subject = input.subject.trim().slice(0, 300) || "(بدون موضوع)";
  const description = input.description.trim() || "—";

  const { data: catRow } = await db
    .from("support_categories")
    .select("code, default_priority, default_team_id, sla_policy_id")
    .eq("code", input.category)
    .maybeSingle();
  const category = (catRow as {
    code: string;
    default_priority: TicketPriority;
    default_team_id: string | null;
    sla_policy_id: string | null;
  } | null) ?? {
    code: "general",
    default_priority: "medium" as TicketPriority,
    default_team_id: null,
    sla_policy_id: null,
  };

  const identity = await resolveIdentity(db, {
    email: input.requesterEmail ?? null,
    userId: input.userId ?? null,
    name: input.requesterName ?? null,
  });
  const organizationId = input.organizationId ?? identity.organizationId;
  const priority = input.priority ?? category.default_priority;

  let teamId = category.default_team_id;
  if (!teamId) {
    const { data } = await db
      .from("support_teams")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();
    teamId = (data as { id: string } | null)?.id ?? null;
  }

  const policy = category.sla_policy_id
    ? await policyById(db, category.sla_policy_id)
    : await selectPolicy(db, {
        planCode: identity.planCode,
        priority,
        channel: input.channel,
        category: category.code,
      });

  const createdAt = new Date().toISOString();
  const dues = await computeDueDates(db, policy, createdAt);

  const { data, error } = await db
    .from("support_tickets")
    .insert({
      subject,
      description,
      category: category.code,
      priority,
      status: "new",
      channel: input.channel,
      user_id: identity.userId,
      organization_id: organizationId,
      subscription_id: identity.subscriptionId,
      requester_email: input.requesterEmail?.trim().toLowerCase() ?? null,
      requester_name: identity.requesterName,
      identity_source: identity.identitySource,
      needs_identity_review: identity.needsReview,
      team_id: teamId,
      sla_policy_id: policy.id,
      due_first_response_at: dues.dueFirstResponseAt,
      due_resolution_at: dues.dueResolutionAt,
      sla_state: "ok",
      source_email_thread_id: input.sourceEmailThreadId ?? null,
      split_from_id: input.splitFromId ?? null,
      last_reply_at: createdAt,
      last_customer_reply_at: input.channel === "internal" ? null : createdAt,
    })
    .select("id, ticket_number")
    .single();
  if (error) throw new Error("تعذّر إنشاء التذكرة.");
  const ticket = data as { id: string; ticket_number: string };

  await writeTicketEvent(db, {
    ticketId: ticket.id,
    eventType: "created",
    actorId: input.actor?.userId ?? identity.userId,
    actorName: input.actor?.name ?? identity.requesterName ?? input.requesterEmail ?? "النظام",
    actorKind: input.actor ? "staff" : input.channel === "email" ? "customer" : "system",
    after: {
      status: "new",
      priority,
      category: category.code,
      channel: input.channel,
      team_id: teamId,
    },
  });
  await writeSlaEvent(db, {
    ticketId: ticket.id,
    eventType: "applied",
    metric: "both",
    policyId: policy.id,
    dueAt: dues.dueResolutionAt,
    reason: `تطبيق سياسة «${policy.name_ar}» عند الإنشاء.`,
  });

  if (input.sourceEmailThreadId) {
    await db
      .from("email_threads")
      .update({ ticket_id: ticket.id })
      .eq("id", input.sourceEmailThreadId);
  }
  return { id: ticket.id, ticketNumber: ticket.ticket_number };
}

async function policyById(db: Db, id: string): Promise<SlaPolicy> {
  const { data } = await db
    .from("support_sla_policies")
    .select(
      "id, code, name_ar, calendar_id, first_response_minutes, resolution_minutes, pause_on_customer_wait, warning_percent, critical_percent",
    )
    .eq("id", id)
    .maybeSingle();
  const policy = data as SlaPolicy | null;
  if (!policy) throw new Error("سياسة المهل غير موجودة.");
  return policy;
}

/* ------------------------------------------------------------ الحالة والمهل */

type TicketRow = Record<string, unknown>;

async function loadTicket(db: Db, ticketId: string): Promise<TicketRow> {
  const { data } = await db
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .eq("id", ticketId)
    .maybeSingle();
  if (!data) throw new Error("التذكرة غير موجودة.");
  const row = data as TicketRow;
  if (row["merged_into_id"]) throw new Error("هذه التذكرة مدموجة ولا تقبل أي تعديل.");
  return row;
}

/** يحسب تحديثات المهل الناتجة عن الانتقال (إيقاف/استئناف/إنجاز). */
async function slaUpdatesForTransition(
  db: Db,
  ticket: TicketRow,
  to: TicketStatus,
): Promise<{
  patch: Record<string, unknown>;
  events: { type: string; reason: string; seconds?: number }[];
}> {
  const patch: Record<string, unknown> = {};
  const events: { type: string; reason: string; seconds?: number }[] = [];
  const from = ticket["status"] as TicketStatus;
  const policy = ticket["sla_policy_id"]
    ? await policyById(db, ticket["sla_policy_id"] as string)
    : null;
  const nowIso = new Date().toISOString();

  const wasPaused = !!ticket["paused_at"];
  const willPause = PAUSING_STATUSES.includes(to) && !TERMINAL_STATUSES.includes(to);

  if (willPause && !wasPaused) {
    patch["paused_at"] = nowIso;
    events.push({ type: "paused", reason: `العدّاد موقوف: الحالة «${to}».` });
  }

  if (!willPause && wasPaused) {
    const pausedSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(ticket["paused_at"] as string).getTime()) / 1000),
    );
    patch["paused_at"] = null;
    patch["paused_total_seconds"] =
      ((ticket["paused_total_seconds"] as number) ?? 0) + pausedSeconds;
    if (policy) {
      const shifted = await shiftDueDates(
        db,
        policy,
        {
          first:
            (ticket["first_response_at"]
              ? null
              : (ticket["due_first_response_at"] as string | null)) ?? null,
          resolution: (ticket["due_resolution_at"] as string | null) ?? null,
        },
        pausedSeconds,
      );
      if (shifted.first) patch["due_first_response_at"] = shifted.first;
      if (shifted.resolution) patch["due_resolution_at"] = shifted.resolution;
    }
    events.push({
      type: "resumed",
      reason: "استئناف العدّاد بعد انتهاء الانتظار.",
      seconds: pausedSeconds,
    });
  }

  if (TERMINAL_STATUSES.includes(to) && !ticket["resolved_at"]) {
    patch["resolved_at"] = nowIso;
    patch["paused_at"] = null;
  }
  if (to === "closed") patch["closed_at"] = nowIso;
  if (from === "closed" || from === "resolved") {
    if (!TERMINAL_STATUSES.includes(to)) {
      patch["resolved_at"] = null;
      patch["closed_at"] = null;
      patch["reopened_count"] = ((ticket["reopened_count"] as number) ?? 0) + 1;
      if (policy) {
        const dues = await computeDueDates(db, policy, nowIso);
        patch["due_resolution_at"] = dues.dueResolutionAt;
        events.push({ type: "recalculated", reason: "إعادة فتح التذكرة بمهلة حل جديدة." });
      }
    }
  }
  return { patch, events };
}

function nextSlaState(
  ticket: TicketRow,
  patch: Record<string, unknown>,
  policy: SlaPolicy | null,
): string {
  const merged = { ...ticket, ...patch } as TicketRow;
  return evaluateSlaState(
    {
      status: merged["status"] as TicketStatus,
      first_response_at: (merged["first_response_at"] as string | null) ?? null,
      resolved_at: (merged["resolved_at"] as string | null) ?? null,
      due_first_response_at: (merged["due_first_response_at"] as string | null) ?? null,
      due_resolution_at: (merged["due_resolution_at"] as string | null) ?? null,
      created_at: merged["created_at"] as string,
      paused_at: (merged["paused_at"] as string | null) ?? null,
    },
    policy ?? { warning_percent: 75, critical_percent: 90 },
  );
}

export async function transitionTicket(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; to: TicketStatus; reason?: string | null },
): Promise<{ status: TicketStatus; slaState: string }> {
  const ticket = await loadTicket(db, input.ticketId);
  const from = ticket["status"] as TicketStatus;
  if (from === input.to) return { status: from, slaState: ticket["sla_state"] as string };
  if (!canTransition(from, input.to))
    throw new Error("هذا الانتقال غير مسموح في دورة حياة التذكرة.");

  const { patch, events } = await slaUpdatesForTransition(db, ticket, input.to);
  patch["status"] = input.to;
  const policy = ticket["sla_policy_id"]
    ? await policyById(db, ticket["sla_policy_id"] as string)
    : null;
  patch["sla_state"] = nextSlaState(ticket, patch, policy);

  const { error } = await db.from("support_tickets").update(patch).eq("id", input.ticketId);
  if (error) throw new Error("تعذّر تحديث حالة التذكرة.");

  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: from === "closed" && input.to === "in_progress" ? "reopened" : "status_changed",
    actorId: actor.userId,
    actorName: actor.name,
    before: { status: from },
    after: { status: input.to },
    reason: input.reason ?? null,
  });
  for (const event of events) {
    await writeSlaEvent(db, {
      ticketId: input.ticketId,
      eventType: event.type,
      metric: "both",
      policyId: policy?.id ?? null,
      pausedSeconds: event.seconds ?? null,
      reason: event.reason,
    });
  }
  return { status: input.to, slaState: patch["sla_state"] as string };
}

/* ------------------------------------------------------------ الردود والملاحظات */

/** رد على المكتب: رسالة في التذكرة + بريد صادر من صندوق الدعم عبر محرك البريد. */
export async function replyToTicket(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; body: string; nextStatus?: TicketStatus | null; sendEmail?: boolean },
): Promise<{ emailSent: boolean; failureRef?: string | null }> {
  const body = input.body.trim();
  if (!body) throw new Error("نص الرد مطلوب.");
  const ticket = await loadTicket(db, input.ticketId);

  const { error } = await db.from("support_ticket_messages").insert({
    ticket_id: input.ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    is_staff: true,
    body,
  });
  if (error) throw new Error("تعذّر حفظ الرد.");

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { last_staff_reply_at: nowIso, last_reply_at: nowIso };
  if (!ticket["first_response_at"]) {
    patch["first_response_at"] = nowIso;
    await writeSlaEvent(db, {
      ticketId: input.ticketId,
      eventType:
        ticket["due_first_response_at"] &&
        new Date(ticket["due_first_response_at"] as string).getTime() < Date.now()
          ? "breached"
          : "met",
      metric: "first_response",
      policyId: (ticket["sla_policy_id"] as string | null) ?? null,
      dueAt: (ticket["due_first_response_at"] as string | null) ?? null,
      reason: "تسجيل أول رد على المكتب.",
    });
  }
  await db.from("support_tickets").update(patch).eq("id", input.ticketId);

  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: "staff_reply",
    actorId: actor.userId,
    actorName: actor.name,
    after: { length: body.length },
  });

  let emailSent = false;
  let failureRef: string | null = null;
  const recipient =
    (ticket["requester_email"] as string | null) ?? (await requesterEmail(db, ticket));
  if ((input.sendEmail ?? true) && recipient) {
    const mailboxId = await teamMailboxId(db, ticket["team_id"] as string | null);
    if (mailboxId) {
      const number = (ticket["ticket_number"] as string | null) ?? (ticket["reference"] as string);
      const result = await queueMessage(
        db,
        { userId: actor.userId, email: actor.email },
        {
          mailboxId,
          threadId: (ticket["source_email_thread_id"] as string | null) ?? null,
          to: [recipient],
          cc: [],
          bcc: [],
          subject: `[${number}] ${ticket["subject"] as string}`,
          html: `<div dir="rtl">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`,
        },
      );
      emailSent = result.sent;
      failureRef = result.failureRef ?? null;
      await db
        .from("email_messages")
        .update({ ticket_id: input.ticketId })
        .eq("id", result.messageId);
      await db
        .from("email_threads")
        .update({ ticket_id: input.ticketId })
        .eq("id", result.threadId);
      if (!ticket["source_email_thread_id"]) {
        await db
          .from("support_tickets")
          .update({ source_email_thread_id: result.threadId })
          .eq("id", input.ticketId);
      }
    }
  }

  const target = input.nextStatus ?? "awaiting_reply";
  if (canTransition(ticket["status"] as TicketStatus, target)) {
    await transitionTicket(db, actor, {
      ticketId: input.ticketId,
      to: target,
      reason: "بعد رد فريق الدعم.",
    });
  }
  return { emailSent, failureRef };
}

async function requesterEmail(db: Db, ticket: TicketRow): Promise<string | null> {
  const userId = ticket["user_id"] as string | null;
  if (!userId) return null;
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  return (data as { email: string | null } | null)?.email ?? null;
}

async function teamMailboxId(db: Db, teamId: string | null): Promise<string | null> {
  if (teamId) {
    const { data } = await db
      .from("support_teams")
      .select("mailbox_id")
      .eq("id", teamId)
      .maybeSingle();
    const mailboxId = (data as { mailbox_id: string | null } | null)?.mailbox_id ?? null;
    if (mailboxId) return mailboxId;
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

/** ملاحظة داخلية: لا تصل المكتب ولا تدخل أي مسار إرسال. */
export async function addInternalNote(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; body: string; mentions?: string[] },
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("نص الملاحظة مطلوب.");
  await loadTicket(db, input.ticketId);
  const { data, error } = await db
    .from("support_internal_notes")
    .insert({
      ticket_id: input.ticketId,
      author_id: actor.userId,
      author_name: actor.name,
      body,
      mentions: input.mentions ?? [],
    })
    .select("id")
    .single();
  if (error) throw new Error("تعذّر حفظ الملاحظة.");
  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: "internal_note",
    actorId: actor.userId,
    actorName: actor.name,
    internalNoteId: (data as { id: string }).id,
  });
}

/* ------------------------------------------------------------ الإسناد والتصعيد */

export async function assignTicket(
  db: Db,
  actor: SupportActor,
  input: {
    ticketId: string;
    assignedTo?: string | null;
    teamId?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const ticket = await loadTicket(db, input.ticketId);
  const patch: Record<string, unknown> = {};
  if (input.assignedTo !== undefined) patch["assigned_to"] = input.assignedTo;
  if (input.teamId !== undefined) patch["team_id"] = input.teamId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await db.from("support_tickets").update(patch).eq("id", input.ticketId);
  if (error) throw new Error("تعذّر تنفيذ الإسناد.");
  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType:
      input.teamId !== undefined && input.assignedTo === undefined ? "team_changed" : "assigned",
    actorId: actor.userId,
    actorName: actor.name,
    before: { assigned_to: ticket["assigned_to"], team_id: ticket["team_id"] },
    after: {
      assigned_to: patch["assigned_to"] ?? ticket["assigned_to"],
      team_id: patch["team_id"] ?? ticket["team_id"],
    },
    reason: input.reason ?? null,
  });

  if ((ticket["status"] as TicketStatus) === "new" && input.assignedTo) {
    await transitionTicket(db, actor, {
      ticketId: input.ticketId,
      to: "in_progress",
      reason: "بدء المعالجة بعد الإسناد.",
    });
  }
}

export async function escalateTicket(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; reason: string },
): Promise<{ level: number; teamId: string | null }> {
  const ticket = await loadTicket(db, input.ticketId);
  const level = ((ticket["escalation_level"] as number) ?? 0) + 1;

  const { data: ruleRow } = await db
    .from("support_escalation_rules")
    .select("target_team_id, target_user_id, to_level")
    .eq("is_active", true)
    .eq("from_level", (ticket["escalation_level"] as number) ?? 0)
    .order("sort_order")
    .limit(1);
  const rule =
    ((ruleRow ?? []) as { target_team_id: string | null; target_user_id: string | null }[])[0] ??
    null;

  let targetTeam = rule?.target_team_id ?? null;
  if (!targetTeam && ticket["team_id"]) {
    const { data } = await db
      .from("support_teams")
      .select("escalation_team_id")
      .eq("id", ticket["team_id"])
      .maybeSingle();
    targetTeam = (data as { escalation_team_id: string | null } | null)?.escalation_team_id ?? null;
  }

  await db
    .from("support_tickets")
    .update({
      escalation_level: level,
      escalated_at: new Date().toISOString(),
      status: "escalated",
      team_id: targetTeam ?? ticket["team_id"],
      assigned_to: rule?.target_user_id ?? ticket["assigned_to"],
    })
    .eq("id", input.ticketId);

  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: "escalated",
    actorId: actor.userId || null,
    actorName: actor.name,
    actorKind: actor.userId ? "staff" : "system",
    before: { level: (ticket["escalation_level"] as number) ?? 0, team_id: ticket["team_id"] },
    after: { level, team_id: targetTeam ?? ticket["team_id"] },
    reason: input.reason,
  });
  await writeSlaEvent(db, {
    ticketId: input.ticketId,
    eventType: "escalated",
    metric: "resolution",
    policyId: (ticket["sla_policy_id"] as string | null) ?? null,
    reason: input.reason,
  });
  return { level, teamId: targetTeam ?? (ticket["team_id"] as string | null) ?? null };
}

/* ------------------------------------------------------------ الدمج والتقسيم */

export async function mergeTickets(
  db: Db,
  actor: SupportActor,
  input: { sourceId: string; targetId: string; reason: string },
): Promise<void> {
  if (input.sourceId === input.targetId) throw new Error("لا يمكن دمج التذكرة مع نفسها.");
  const source = await loadTicket(db, input.sourceId);
  const target = await loadTicket(db, input.targetId);

  await db
    .from("support_ticket_messages")
    .update({ ticket_id: input.targetId })
    .eq("ticket_id", input.sourceId);
  await db
    .from("email_messages")
    .update({ ticket_id: input.targetId })
    .eq("ticket_id", input.sourceId);
  await db
    .from("email_threads")
    .update({ ticket_id: input.targetId })
    .eq("ticket_id", input.sourceId);

  await db
    .from("support_tickets")
    .update({
      merged_into_id: input.targetId,
      status: "closed",
      closed_at: new Date().toISOString(),
      resolved_at: (source["resolved_at"] as string | null) ?? new Date().toISOString(),
      paused_at: null,
      sla_state: "met",
    })
    .eq("id", input.sourceId);

  await writeTicketEvent(db, {
    ticketId: input.sourceId,
    eventType: "merged",
    actorId: actor.userId,
    actorName: actor.name,
    after: { merged_into: target["ticket_number"] ?? input.targetId },
    reason: input.reason,
  });
  await writeTicketEvent(db, {
    ticketId: input.targetId,
    eventType: "merge_target",
    actorId: actor.userId,
    actorName: actor.name,
    after: { merged_from: source["ticket_number"] ?? input.sourceId },
    reason: input.reason,
  });
}

export async function splitTicket(
  db: Db,
  actor: SupportActor,
  input: {
    ticketId: string;
    subject: string;
    description: string;
    category?: string | null;
    reason: string;
  },
): Promise<{ id: string; ticketNumber: string }> {
  const source = await loadTicket(db, input.ticketId);
  const created = await createTicket(db, {
    subject: input.subject,
    description: input.description,
    category: input.category ?? (source["category"] as string),
    priority: source["priority"] as TicketPriority,
    channel: "internal",
    requesterEmail: (source["requester_email"] as string | null) ?? null,
    requesterName: (source["requester_name"] as string | null) ?? null,
    userId: (source["user_id"] as string | null) ?? null,
    organizationId: (source["organization_id"] as string | null) ?? null,
    splitFromId: input.ticketId,
    actor: { userId: actor.userId, name: actor.name },
  });
  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: "split",
    actorId: actor.userId,
    actorName: actor.name,
    after: { split_to: created.ticketNumber },
    reason: input.reason,
  });
  return created;
}

/* ------------------------------------------------------------ الوسوم */

export async function setTicketTags(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; tagIds: string[] },
): Promise<void> {
  await loadTicket(db, input.ticketId);
  const { data } = await db
    .from("support_ticket_tags")
    .select("tag_id")
    .eq("ticket_id", input.ticketId);
  const current = ((data ?? []) as { tag_id: string }[]).map((t) => t.tag_id);
  const added = input.tagIds.filter((t) => !current.includes(t));
  const removed = current.filter((t) => !input.tagIds.includes(t));

  if (removed.length > 0) {
    await db
      .from("support_ticket_tags")
      .delete()
      .eq("ticket_id", input.ticketId)
      .in("tag_id", removed);
  }
  if (added.length > 0) {
    await db.from("support_ticket_tags").insert(
      added.map((tagId) => ({
        ticket_id: input.ticketId,
        tag_id: tagId,
        created_by: actor.userId,
      })),
    );
  }
  for (const tagId of added) {
    await writeTicketEvent(db, {
      ticketId: input.ticketId,
      eventType: "tag_added",
      actorId: actor.userId,
      actorName: actor.name,
      after: { tag_id: tagId },
    });
  }
  for (const tagId of removed) {
    await writeTicketEvent(db, {
      ticketId: input.ticketId,
      eventType: "tag_removed",
      actorId: actor.userId,
      actorName: actor.name,
      before: { tag_id: tagId },
    });
  }
}

/* ------------------------------------------------------------ تحديث الحقول */

export async function updateTicketFields(
  db: Db,
  actor: SupportActor,
  input: { ticketId: string; priority?: TicketPriority; category?: string; reason?: string | null },
): Promise<void> {
  const ticket = await loadTicket(db, input.ticketId);
  const patch: Record<string, unknown> = {};
  if (input.priority && input.priority !== ticket["priority"]) patch["priority"] = input.priority;
  if (input.category && input.category !== ticket["category"]) patch["category"] = input.category;
  if (Object.keys(patch).length === 0) return;

  // تغيير الأولوية أو التصنيف يعيد اختيار سياسة المهل ومواعيدها من تاريخ الإنشاء.
  const identityPlan = ticket["subscription_id"]
    ? ((
        (
          await db
            .from("subscriptions")
            .select("plan_code")
            .eq("id", ticket["subscription_id"])
            .maybeSingle()
        ).data as { plan_code: string } | null
      )?.plan_code ?? null)
    : null;
  const policy = await selectPolicy(db, {
    planCode: identityPlan,
    priority: (patch["priority"] as TicketPriority) ?? (ticket["priority"] as TicketPriority),
    channel: ticket["channel"] as string,
    category: (patch["category"] as string) ?? (ticket["category"] as string),
  });
  const dues = await computeDueDates(db, policy, ticket["created_at"] as string);
  patch["sla_policy_id"] = policy.id;
  if (!ticket["first_response_at"]) patch["due_first_response_at"] = dues.dueFirstResponseAt;
  if (!ticket["resolved_at"]) patch["due_resolution_at"] = dues.dueResolutionAt;
  patch["sla_state"] = nextSlaState(ticket, patch, policy);

  await db.from("support_tickets").update(patch).eq("id", input.ticketId);
  await writeTicketEvent(db, {
    ticketId: input.ticketId,
    eventType: input.priority ? "priority_changed" : "category_changed",
    actorId: actor.userId,
    actorName: actor.name,
    before: { priority: ticket["priority"], category: ticket["category"] },
    after: {
      priority: patch["priority"] ?? ticket["priority"],
      category: patch["category"] ?? ticket["category"],
    },
    reason: input.reason ?? null,
  });
  await writeSlaEvent(db, {
    ticketId: input.ticketId,
    eventType: "recalculated",
    metric: "both",
    policyId: policy.id,
    dueAt:
      (patch["due_resolution_at"] as string | null) ??
      (ticket["due_resolution_at"] as string | null),
    reason: `إعادة حساب المهل بعد تغيير ${input.priority ? "الأولوية" : "التصنيف"}.`,
  });
}

/* ------------------------------------------------------------ مسح المهل الدوري */

/** يُشغَّل دورياً: تحذيرات 75% و90%، تسجيل التجاوز، والتصعيد التلقائي. */
export async function runSlaSweep(
  db: Db,
): Promise<{ scanned: number; warned: number; breached: number; escalated: number }> {
  const { data } = await db
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .not("status", "in", "(closed,resolved)")
    .is("merged_into_id", null)
    .limit(500);
  const tickets = (data ?? []) as TicketRow[];

  let warned = 0;
  let breached = 0;
  let escalated = 0;

  for (const ticket of tickets) {
    const policy = ticket["sla_policy_id"]
      ? await policyById(db, ticket["sla_policy_id"] as string)
      : null;
    const state = nextSlaState(ticket, {}, policy);
    if (state === ticket["sla_state"]) continue;

    await db
      .from("support_tickets")
      .update({ sla_state: state })
      .eq("id", ticket["id"] as string);
    if (state === "warning" || state === "critical") {
      warned += 1;
      await writeSlaEvent(db, {
        ticketId: ticket["id"] as string,
        eventType: state,
        metric: ticket["first_response_at"] ? "resolution" : "first_response",
        policyId: policy?.id ?? null,
        dueAt: (ticket["due_resolution_at"] as string | null) ?? null,
        reason: state === "warning" ? "استهلاك 75% من المهلة." : "استهلاك 90% من المهلة.",
      });
    }
    if (state === "breached") {
      breached += 1;
      await writeSlaEvent(db, {
        ticketId: ticket["id"] as string,
        eventType: "breached",
        metric: ticket["first_response_at"] ? "resolution" : "first_response",
        policyId: policy?.id ?? null,
        dueAt: (ticket["due_resolution_at"] as string | null) ?? null,
        reason: "تجاوز المهلة المحددة.",
      });
      if (((ticket["escalation_level"] as number) ?? 0) === 0) {
        await escalateTicket(
          db,
          {
            userId: "",
            email: "system@mehlalex.com",
            name: "النظام",
            isSuper: true,
            canViewAllOffices: true,
            teamIds: [],
          },
          { ticketId: ticket["id"] as string, reason: "تصعيد تلقائي بعد تجاوز المهلة." },
        ).catch(() => undefined);
        escalated += 1;
      }
    }
  }
  return { scanned: tickets.length, warned, breached, escalated };
}
