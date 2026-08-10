/**
 * FEATURE 02 — طبقة الخادم لمؤشرات أداء الفريق.
 * الحساب كامل على الخادم؛ المتصفح يستقبل نتائج جاهزة فقط.
 * الوصول: مالك المكتب ومدير المكتب فقط، ولمكتبهم وحده (فوق RLS لا بدلاً منه).
 */

import {
  DRILLDOWN_PAGE_SIZE,
  MIN_TRACKED_DAYS,
  UPCOMING_DEADLINE_WINDOW_DAYS,
  resolvePeriod,
  scoreBand,
  SCORE_BANDS,
  type DrilldownKind,
  type MemberKpi,
  type PeriodPreset,
  type ResolvedPeriod,
  type TeamKpiResult,
  type TeamKpiSummary,
} from "./kpi.shared";
import {
  computeMemberKpi,
  evaluateItem,
  rankMembers,
  type ItemEvaluation,
  type MemberInput,
  type WorkEvent,
  type WorkItemInput,
} from "./kpi.engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const DAY_MS = 24 * 60 * 60 * 1000;
const MANAGER_ROLES = ["owner", "admin"];

export class KpiAccessError extends Error {}

/** يتحقق أن المستخدم عضو نشط بدور مالك/مدير في المكتب المطلوب. */
export async function requireTeamPerformanceAccess(
  supabase: Client,
  organizationId: string,
  userId: string,
): Promise<"owner" | "admin"> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new KpiAccessError("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!data || data.status !== "active" || !MANAGER_ROLES.includes(data.role)) {
    throw new KpiAccessError("أداء الفريق متاح لمالك المكتب ومدير المكتب فقط.");
  }
  return data.role as "owner" | "admin";
}

type EventRow = {
  item_type: "task" | "deadline";
  item_id: string;
  event: WorkEvent["event"];
  actor_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  from_due_date: string | null;
  to_due_date: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

type ItemRow = {
  id: string;
  title: string;
  case_id: string | null;
  created_by: string | null;
  created_at: string;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  owner: string | null;
  cases: { case_title: string | null } | null;
};

async function fetchItems(
  supabase: Client,
  organizationId: string,
): Promise<{ tasks: ItemRow[]; deadlines: ItemRow[] }> {
  const [tasks, deadlines] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, case_id, created_by, created_at, due_date, status, completed_at, assigned_to, cases(case_title)",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("deadlines")
      .select(
        "id, title, case_id, created_by, created_at, due_date, status, completed_at, responsible_user_id, cases(case_title)",
      )
      .eq("organization_id", organizationId),
  ]);
  if (tasks.error || deadlines.error) throw new Error("تعذّر قراءة بيانات الأعمال لحساب الأداء.");
  return {
    tasks: (tasks.data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as ItemRow),
      owner: (row["assigned_to"] as string | null) ?? null,
    })),
    deadlines: (deadlines.data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as ItemRow),
      owner: (row["responsible_user_id"] as string | null) ?? null,
    })),
  };
}

async function fetchEvents(supabase: Client, organizationId: string): Promise<EventRow[]> {
  const pageSize = 1000;
  const rows: EventRow[] = [];
  for (let page = 0; page < 60; page += 1) {
    const { data, error } = await supabase
      .from("work_item_events")
      .select(
        "item_type, item_id, event, actor_id, from_user_id, to_user_id, from_due_date, to_due_date, occurred_at, metadata",
      )
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error("تعذّر قراءة سجل أحداث الأعمال.");
    const batch = (data ?? []) as EventRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function toEvent(row: EventRow): WorkEvent {
  const meta = row.metadata ?? {};
  return {
    event: row.event,
    actorId: row.actor_id,
    actorRole: (meta["actor_role"] as string | null) ?? null,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    fromDueDate: row.from_due_date,
    toDueDate: row.to_due_date,
    occurredAt: row.occurred_at,
    baselineStatus: (meta["status"] as string | null) ?? null,
    baselineCompletedAt: (meta["completed_at"] as string | null) ?? null,
  };
}

/** يبني مدخلات المحرك: كل عمل + سجل أحداثه، مع خط أساس اصطناعي إن غاب السجل. */
function buildInputs(
  items: { tasks: ItemRow[]; deadlines: ItemRow[] },
  events: EventRow[],
): WorkItemInput[] {
  const grouped = new Map<string, WorkEvent[]>();
  for (const row of events) {
    const key = `${row.item_type}:${row.item_id}`;
    const list = grouped.get(key);
    if (list) list.push(toEvent(row));
    else grouped.set(key, [toEvent(row)]);
  }

  const build = (row: ItemRow, itemType: "task" | "deadline"): WorkItemInput => {
    const key = `${itemType}:${row.id}`;
    const captured = grouped.get(key) ?? [];
    const events2: WorkEvent[] =
      captured.length > 0
        ? captured
        : [
            {
              event: "baseline",
              actorId: null,
              actorRole: null,
              fromUserId: null,
              toUserId: row.owner,
              fromDueDate: null,
              toDueDate: row.due_date,
              occurredAt: row.created_at,
              baselineStatus: row.status,
              baselineCompletedAt: row.completed_at,
            },
          ];
    return {
      itemType,
      id: row.id,
      title: row.title,
      caseId: row.case_id,
      caseTitle: row.cases?.case_title ?? null,
      createdBy: row.created_by,
      events: events2,
    };
  };

  return [
    ...items.tasks.map((row) => build(row, "task")),
    ...items.deadlines.map((row) => build(row, "deadline")),
  ];
}

type MemberRow = {
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; job_title: string | null } | null;
};

async function fetchMembers(supabase: Client, organizationId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, status, joined_at, created_at, profiles(full_name, job_title)")
    .eq("organization_id", organizationId);
  if (error) throw new Error("تعذّر قراءة أعضاء المكتب.");
  return (data ?? []) as MemberRow[];
}

async function fetchActiveCaseCounts(
  supabase: Client,
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("cases")
    .select("assigned_lawyer_id, status")
    .eq("organization_id", organizationId)
    .not("status", "in", "(closed,archived)");
  if (error) throw new Error("تعذّر قراءة القضايا النشطة.");
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { assigned_lawyer_id: string | null }[]) {
    if (!row.assigned_lawyer_id) continue;
    counts.set(row.assigned_lawyer_id, (counts.get(row.assigned_lawyer_id) ?? 0) + 1);
  }
  return counts;
}

function trackedDaysFor(
  joinedAt: string | null,
  trackingStartedAt: string | null,
  period: ResolvedPeriod,
): number {
  const boundary = new Date(period.boundary).getTime();
  const candidates = [new Date(period.current.from).getTime()];
  if (joinedAt) candidates.push(new Date(joinedAt).getTime());
  const start = Math.max(...candidates);
  if (!Number.isFinite(start) || boundary <= start) return 0;
  // خط الأساس لا يمنع الاحتساب، لكن الفترة السابقة لبدء التتبع تُعرض كتاريخ جزئي.
  void trackingStartedAt;
  return Math.floor((boundary - start) / DAY_MS);
}

function summarize(members: MemberKpi[], all: MemberKpi[]): TeamKpiSummary {
  const scored = members.filter((m) => m.score !== null);
  const avg = (values: number[]): number | null =>
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
      : null;

  const dimensionAvg = (key: string): number | null => {
    let num = 0;
    let den = 0;
    for (const m of members) {
      const d = m.dimensions.find((x) => x.key === key);
      if (!d) continue;
      num += d.numerator;
      den += d.denominator;
    }
    return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
  };

  const distribution = SCORE_BANDS.map((band) => ({
    tone: band.tone,
    label: band.label,
    count: scored.filter((m) => scoreBand(m.score ?? 0).tone === band.tone).length,
  }));

  return {
    averageScore: avg(scored.map((m) => m.score ?? 0)),
    previousAverageScore: avg(
      scored.filter((m) => m.previousScore !== null).map((m) => m.previousScore ?? 0),
    ),
    deadlineCompliance: dimensionAvg("deadline_compliance"),
    onTimeCompletion: dimensionAvg("task_on_time"),
    overdueTasks: all.reduce((s, m) => s + m.context.overdueTasks, 0),
    overdueDeadlines: all.reduce((s, m) => s + m.context.overdueDeadlines, 0),
    totalOpenWork: all.reduce((s, m) => s + m.context.totalOpenWork, 0),
    rankedMembers: members.length,
    distribution,
  };
}

export type TeamKpiOptions = {
  preset: PeriodPreset;
  from?: string | null;
  to?: string | null;
};

/** يحسب أداء كل أعضاء المكتب للفترة المطلوبة وفترة المقارنة السابقة. */
export async function computeTeamPerformance(
  supabase: Client,
  organizationId: string,
  options: TeamKpiOptions,
): Promise<TeamKpiResult> {
  const period = resolvePeriod(options.preset, { from: options.from, to: options.to });
  const [items, events, memberRows, caseCounts] = await Promise.all([
    fetchItems(supabase, organizationId),
    fetchEvents(supabase, organizationId),
    fetchMembers(supabase, organizationId),
    fetchActiveCaseCounts(supabase, organizationId),
  ]);

  const inputs = buildInputs(items, events);
  const current = inputs.map((item) => evaluateItem(item, period.boundary));
  const previous = inputs.map((item) => evaluateItem(item, period.previousBoundary));

  const byOwner = (list: ItemEvaluation[]) => {
    const map = new Map<string, ItemEvaluation[]>();
    for (const item of list) {
      if (!item.ownerId) continue;
      const bucket = map.get(item.ownerId);
      if (bucket) bucket.push(item);
      else map.set(item.ownerId, [item]);
    }
    return map;
  };
  const currentByOwner = byOwner(current);
  const previousByOwner = byOwner(previous);

  const trackingStartedAt = events.length > 0 ? (events[0]?.occurred_at ?? null) : null;

  const memberById = new Map(memberRows.map((m) => [m.user_id, m]));
  const participantIds = new Set<string>([
    ...memberRows.filter((m) => m.status !== "suspended" || true).map((m) => m.user_id),
    ...currentByOwner.keys(),
  ]);

  const unknownIds = [...participantIds].filter((id) => !memberById.has(id));
  const formerProfiles = new Map<string, { full_name: string | null; job_title: string | null }>();
  if (unknownIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, job_title")
      .in("id", unknownIds);
    for (const row of (data ?? []) as {
      id: string;
      full_name: string | null;
      job_title: string | null;
    }[]) {
      formerProfiles.set(row.id, { full_name: row.full_name, job_title: row.job_title });
    }
  }

  const computed: MemberKpi[] = [];
  for (const userId of participantIds) {
    const row = memberById.get(userId);
    const profile = row?.profiles ?? formerProfiles.get(userId) ?? null;
    const memberInput: MemberInput = {
      userId,
      fullName: profile?.full_name?.trim() || "عضو غير معروف",
      jobTitle: profile?.job_title ?? null,
      role: row?.role ?? "—",
      isFormerMember: !row || row.status !== "active",
      trackedDays: trackedDaysFor(
        row?.joined_at ?? row?.created_at ?? null,
        trackingStartedAt,
        period,
      ),
      activeCases: caseCounts.get(userId) ?? 0,
    };
    const prev = computeMemberKpi(
      memberInput,
      previousByOwner.get(userId) ?? [],
      period.previous,
      period.previousBoundary,
      null,
    );
    const now = computeMemberKpi(
      memberInput,
      currentByOwner.get(userId) ?? [],
      period.current,
      period.boundary,
      prev.kpi.score,
    );
    computed.push(now.kpi);
  }

  const eligible = computed.filter((m) => m.eligible);
  const insufficient = computed
    .filter((m) => !m.eligible)
    .sort((a, b) => b.sampleItems - a.sampleItems || a.fullName.localeCompare(b.fullName, "ar"));

  const ranked = rankMembers(eligible);
  const partialHistory =
    trackingStartedAt !== null &&
    new Date(trackingStartedAt).getTime() > new Date(period.current.from).getTime();

  return {
    period,
    trackingStartedAt,
    partialHistory,
    summary: summarize(ranked, computed),
    ranked,
    insufficient,
  };
}

export type MemberDetail = {
  member: MemberKpi;
  breakdown: {
    key: string;
    label: string;
    weight: number;
    value: number | null;
    numerator: number;
    denominator: number;
    contribution: number | null;
  }[];
  items: {
    itemId: string;
    itemType: "task" | "deadline";
    title: string;
    caseId: string | null;
    caseTitle: string | null;
    dueDate: string | null;
    completedAt: string | null;
    state: string;
    counted: boolean;
    dimension: string;
    delayDays: number | null;
    dueExtended: boolean;
    reassigned: boolean;
  }[];
  excluded: {
    itemId: string;
    itemType: "task" | "deadline";
    title: string;
    reason: string;
  }[];
};

const EXCLUSION_REASONS = {
  self_managed: "عمل أنشأه العضو لنفسه ولم يُسند من غيره — لا يُحتسب في الدرجة.",
  future_due: "موعد الاستحقاق لم يحن بعد داخل الفترة.",
  cancelled: "أُلغي قبل تجاوز الموعد.",
  no_due: "لا يوجد موعد استحقاق يمكن القياس عليه.",
  outside_period: "خارج نطاق الفترة المحددة.",
} as const;

/** تفصيل درجة عضو واحد: كل بُعد بأرقامه الفعلية وقائمة الأعمال التي بُنيت عليها. */
export async function computeMemberDetail(
  supabase: Client,
  organizationId: string,
  memberId: string,
  options: TeamKpiOptions,
): Promise<MemberDetail> {
  const period = resolvePeriod(options.preset, { from: options.from, to: options.to });
  const [items, events, memberRows, caseCounts] = await Promise.all([
    fetchItems(supabase, organizationId),
    fetchEvents(supabase, organizationId),
    fetchMembers(supabase, organizationId),
    fetchActiveCaseCounts(supabase, organizationId),
  ]);

  const inputs = buildInputs(items, events);
  const current = inputs
    .map((item) => evaluateItem(item, period.boundary))
    .filter((item) => item.ownerId === memberId);
  const previous = inputs
    .map((item) => evaluateItem(item, period.previousBoundary))
    .filter((item) => item.ownerId === memberId);

  const row = memberRows.find((m) => m.user_id === memberId) ?? null;
  let profile = row?.profiles ?? null;
  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, job_title")
      .eq("id", memberId)
      .maybeSingle();
    profile = (data as { full_name: string | null; job_title: string | null } | null) ?? null;
  }

  const memberInput: MemberInput = {
    userId: memberId,
    fullName: profile?.full_name?.trim() || "عضو غير معروف",
    jobTitle: profile?.job_title ?? null,
    role: row?.role ?? "—",
    isFormerMember: !row || row.status !== "active",
    trackedDays: trackedDaysFor(row?.joined_at ?? row?.created_at ?? null, null, period),
    activeCases: caseCounts.get(memberId) ?? 0,
  };

  const prev = computeMemberKpi(
    memberInput,
    previous,
    period.previous,
    period.previousBoundary,
    null,
  );
  const now = computeMemberKpi(
    memberInput,
    current,
    period.current,
    period.boundary,
    prev.kpi.score,
  );

  const applicableWeight = now.kpi.dimensions
    .filter((d) => d.value !== null)
    .reduce((s, d) => s + d.weight, 0);

  const { KPI_DIMENSION_LABELS } = await import("./kpi.shared");
  const breakdown = now.kpi.dimensions.map((d) => ({
    key: d.key,
    label: KPI_DIMENSION_LABELS[d.key],
    weight: d.weight,
    value: d.value,
    numerator: d.numerator,
    denominator: d.denominator,
    contribution:
      d.value !== null && applicableWeight > 0
        ? Math.round(((d.value * d.weight) / applicableWeight) * 10) / 10
        : null,
  }));

  const boundaryMs = new Date(period.boundary).getTime();
  const periodFrom = new Date(period.current.from).getTime();
  const periodTo = new Date(period.current.to).getTime();
  const inPeriod = (value: string | null) => {
    const t = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(t) && t >= periodFrom && t < periodTo;
  };

  const excluded: MemberDetail["excluded"] = [];
  const countedIds = new Set(now.scored.map((s) => `${s.dimension}:${s.evaluation.itemId}`));
  for (const item of current) {
    const relevant = inPeriod(item.effectiveDueDate) || inPeriod(item.completedAt);
    if (!relevant) continue;
    const isScored = [...countedIds].some((k) => k.endsWith(`:${item.itemId}`));
    if (isScored) continue;
    let reason: string = EXCLUSION_REASONS.outside_period;
    if (item.selfManaged) reason = EXCLUSION_REASONS.self_managed;
    else if (item.state === "cancelled" && !item.missedBeforeClosure)
      reason = EXCLUSION_REASONS.cancelled;
    else if (!item.effectiveDueDate) reason = EXCLUSION_REASONS.no_due;
    else if (new Date(item.effectiveDueDate).getTime() > boundaryMs)
      reason = EXCLUSION_REASONS.future_due;
    excluded.push({ itemId: item.itemId, itemType: item.itemType, title: item.title, reason });
  }

  return {
    member: now.kpi,
    breakdown,
    items: now.scored.map((entry) => ({
      itemId: entry.evaluation.itemId,
      itemType: entry.evaluation.itemType,
      title: entry.evaluation.title,
      caseId: entry.evaluation.caseId,
      caseTitle: entry.evaluation.caseTitle,
      dueDate: entry.evaluation.effectiveDueDate,
      completedAt: entry.evaluation.completedAt,
      state: entry.evaluation.state,
      counted: entry.counted,
      dimension: entry.dimension,
      delayDays: entry.evaluation.delayDays,
      dueExtended: entry.evaluation.dueExtended,
      reassigned: entry.evaluation.reassignCount > 0,
    })),
    excluded,
  };
}

export type DrilldownResult = {
  kind: DrilldownKind;
  total: number;
  rows: {
    itemId: string;
    itemType: "task" | "deadline" | "case";
    title: string;
    caseId: string | null;
    caseTitle: string | null;
    dueDate: string | null;
    completedAt: string | null;
    delayDays: number | null;
  }[];
};

/** قائمة الأعمال خلف رقم واحد في اللوحة — نفس منطق الحساب لا استعلام مستقل. */
export async function computeDrilldown(
  supabase: Client,
  organizationId: string,
  memberId: string,
  kind: DrilldownKind,
  options: TeamKpiOptions,
  page: number,
): Promise<DrilldownResult> {
  const period = resolvePeriod(options.preset, { from: options.from, to: options.to });

  if (kind === "active_cases") {
    const { data, error, count } = await supabase
      .from("cases")
      .select("id, case_title, next_action_date, status", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("assigned_lawyer_id", memberId)
      .not("status", "in", "(closed,archived)")
      .order("next_action_date", { ascending: true, nullsFirst: false })
      .range(page * DRILLDOWN_PAGE_SIZE, page * DRILLDOWN_PAGE_SIZE + DRILLDOWN_PAGE_SIZE - 1);
    if (error) throw new Error("تعذّر قراءة القضايا النشطة.");
    return {
      kind,
      total: count ?? 0,
      rows: (data ?? []).map(
        (row: { id: string; case_title: string; next_action_date: string | null }) => ({
          itemId: row.id,
          itemType: "case" as const,
          title: row.case_title,
          caseId: row.id,
          caseTitle: row.case_title,
          dueDate: row.next_action_date,
          completedAt: null,
          delayDays: null,
        }),
      ),
    };
  }

  const [items, events] = await Promise.all([
    fetchItems(supabase, organizationId),
    fetchEvents(supabase, organizationId),
  ]);
  const evaluations = buildInputs(items, events)
    .map((item) => evaluateItem(item, period.boundary))
    .filter((item) => item.ownerId === memberId);

  const boundary = new Date(period.boundary).getTime();
  const periodFrom = new Date(period.current.from).getTime();
  const periodTo = new Date(period.current.to).getTime();

  const filtered = evaluations.filter((item) => {
    switch (kind) {
      case "overdue_tasks":
        return item.itemType === "task" && item.state === "overdue";
      case "overdue_deadlines":
        return item.itemType === "deadline" && item.state === "overdue";
      case "completed_late": {
        const t = item.completedAt ? new Date(item.completedAt).getTime() : NaN;
        return item.state === "completed_late" && t >= periodFrom && t < periodTo;
      }
      case "open_tasks":
        return item.state === "open" || item.state === "overdue";
      case "upcoming_deadlines": {
        const due = item.effectiveDueDate ? new Date(item.effectiveDueDate).getTime() : NaN;
        return (
          item.itemType === "deadline" &&
          (item.state === "open" || item.state === "overdue") &&
          Number.isFinite(due) &&
          due >= boundary &&
          due <= boundary + UPCOMING_DEADLINE_WINDOW_DAYS * DAY_MS
        );
      }
      default:
        return false;
    }
  });

  const sorted = filtered.sort(
    (a, b) =>
      (a.effectiveDueDate ? new Date(a.effectiveDueDate).getTime() : Infinity) -
      (b.effectiveDueDate ? new Date(b.effectiveDueDate).getTime() : Infinity),
  );

  return {
    kind,
    total: sorted.length,
    rows: sorted
      .slice(page * DRILLDOWN_PAGE_SIZE, page * DRILLDOWN_PAGE_SIZE + DRILLDOWN_PAGE_SIZE)
      .map((item) => ({
        itemId: item.itemId,
        itemType: item.itemType,
        title: item.title,
        caseId: item.caseId,
        caseTitle: item.caseTitle,
        dueDate: item.effectiveDueDate,
        completedAt: item.completedAt,
        delayDays: item.delayDays === null ? null : Math.round(item.delayDays * 10) / 10,
      })),
  };
}

export const KPI_MIN_TRACKED_DAYS = MIN_TRACKED_DAYS;
