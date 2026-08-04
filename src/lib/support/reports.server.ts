/**
 * تقارير مركز الدعم — تُحسب خادمياً ضمن نطاق رؤية الموظف.
 * لا حساب مهل في الواجهة: كل المؤشرات تُستمد من الطوابع الخادمية.
 */
import type { SupportActor } from "./tickets.server";
import { TERMINAL_STATUSES } from "./support.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type SupportReportRange = { from?: string; to?: string; teamId?: string | null; organizationId?: string | null };

type Row = {
  id: string;
  ticket_number: string | null;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  channel: string;
  sla_state: string;
  team_id: string | null;
  assigned_to: string | null;
  organization_id: string | null;
  escalation_level: number;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  due_first_response_at: string | null;
  due_resolution_at: string | null;
  rating: number | null;
  reopened_count: number;
};

export type SupportReport = {
  range: { from: string; to: string };
  totals: {
    created: number;
    open: number;
    resolved: number;
    breached: number;
    escalated: number;
    reopened: number;
    unassigned: number;
  };
  sla: {
    firstResponseMet: number;
    firstResponseMissed: number;
    firstResponseCompliance: number;
    resolutionMet: number;
    resolutionMissed: number;
    resolutionCompliance: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
  };
  csat: { responses: number; average: number | null; distribution: Record<"1" | "2" | "3" | "4" | "5", number> };
  byStatus: { key: string; label: string; count: number }[];
  byCategory: { key: string; count: number; breached: number }[];
  byTeam: { key: string; name: string; count: number; open: number; breached: number }[];
  byAgent: { key: string; name: string; open: number; resolved: number; breached: number; avgResolutionMinutes: number | null }[];
  daily: { day: string; created: number; resolved: number }[];
  breachedTickets: {
    id: string;
    ref: string;
    subject: string;
    priority: string;
    status: string;
    dueAt: string | null;
    teamName: string | null;
    assigneeName: string | null;
  }[];
};

function minutesBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export async function buildSupportReport(
  db: Db,
  actor: SupportActor,
  range: SupportReportRange,
): Promise<SupportReport> {
  const to = range.to ?? new Date().toISOString();
  const from = range.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();

  let query = db
    .from("support_tickets")
    .select(
      "id, ticket_number, reference, subject, status, priority, category, channel, sla_state, team_id, assigned_to, organization_id, escalation_level, created_at, first_response_at, resolved_at, closed_at, due_first_response_at, due_resolution_at, rating, reopened_count",
    )
    .gte("created_at", from)
    .lte("created_at", to)
    .is("merged_into_id", null)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (!actor.canViewAllOffices) {
    const clauses = [`assigned_to.eq.${actor.userId}`];
    if (actor.teamIds.length > 0) clauses.push(`team_id.in.(${actor.teamIds.join(",")})`);
    query = query.or(clauses.join(","));
  }
  if (range.teamId) query = query.eq("team_id", range.teamId);
  if (range.organizationId) query = query.eq("organization_id", range.organizationId);

  const { data, error } = await query;
  if (error) throw new Error("تعذّر بناء تقرير الدعم.");
  const rows = (data ?? []) as Row[];

  const [teams, staff] = await Promise.all([
    db.from("support_teams").select("id, name_ar"),
    db.from("platform_staff").select("user_id, full_name"),
  ]);
  const teamRows = ((teams as { data: unknown }).data ?? []) as { id: string; name_ar: string }[];
  const staffRows = ((staff as { data: unknown }).data ?? []) as { user_id: string; full_name: string }[];
  const teamName = new Map<string, string>(teamRows.map((t) => [t.id, t.name_ar]));
  const staffName = new Map<string, string>(staffRows.map((s) => [s.user_id, s.full_name]));

  const totals = {
    created: rows.length,
    open: rows.filter((r) => !TERMINAL_STATUSES.includes(r.status as never)).length,
    resolved: rows.filter((r) => r.resolved_at).length,
    breached: rows.filter((r) => r.sla_state === "breached").length,
    escalated: rows.filter((r) => (r.escalation_level ?? 0) > 0).length,
    reopened: rows.filter((r) => (r.reopened_count ?? 0) > 0).length,
    unassigned: rows.filter((r) => !r.assigned_to && !TERMINAL_STATUSES.includes(r.status as never)).length,
  };

  const firstResponseTimes: number[] = [];
  const resolutionTimes: number[] = [];
  let firstResponseMet = 0;
  let firstResponseMissed = 0;
  let resolutionMet = 0;
  let resolutionMissed = 0;

  for (const row of rows) {
    if (row.first_response_at) {
      firstResponseTimes.push(minutesBetween(row.created_at, row.first_response_at));
      if (row.due_first_response_at) {
        if (new Date(row.first_response_at) <= new Date(row.due_first_response_at)) firstResponseMet += 1;
        else firstResponseMissed += 1;
      }
    }
    if (row.resolved_at) {
      resolutionTimes.push(minutesBetween(row.created_at, row.resolved_at));
      if (row.due_resolution_at) {
        if (new Date(row.resolved_at) <= new Date(row.due_resolution_at)) resolutionMet += 1;
        else resolutionMissed += 1;
      }
    }
  }

  const compliance = (met: number, missed: number) =>
    met + missed === 0 ? 100 : Math.round((met / (met + missed)) * 100);

  const ratings = rows.map((r) => r.rating).filter((r): r is number => typeof r === "number" && r > 0);
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } as Record<"1" | "2" | "3" | "4" | "5", number>;
  for (const rating of ratings) {
    const key = String(Math.min(5, Math.max(1, rating))) as keyof typeof distribution;
    distribution[key] += 1;
  }

  const group = <T>(items: Row[], keyOf: (row: Row) => string | null, build: (key: string, rows: Row[]) => T): T[] => {
    const buckets = new Map<string, Row[]>();
    for (const item of items) {
      const key = keyOf(item);
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    return Array.from(buckets.entries()).map(([key, bucket]) => build(key, bucket));
  };

  const byStatus = group(rows, (r) => r.status, (key, bucket) => ({ key, label: key, count: bucket.length })).sort(
    (a, b) => b.count - a.count,
  );

  const byCategory = group(rows, (r) => r.category, (key, bucket) => ({
    key,
    count: bucket.length,
    breached: bucket.filter((r) => r.sla_state === "breached").length,
  })).sort((a, b) => b.count - a.count);

  const byTeam = group(rows, (r) => r.team_id, (key, bucket) => ({
    key,
    name: teamName.get(key) ?? "غير محدد",
    count: bucket.length,
    open: bucket.filter((r) => !TERMINAL_STATUSES.includes(r.status as never)).length,
    breached: bucket.filter((r) => r.sla_state === "breached").length,
  })).sort((a, b) => b.count - a.count);

  const byAgent = group(rows, (r) => r.assigned_to, (key, bucket) => ({
    key,
    name: staffName.get(key) ?? "غير محدد",
    open: bucket.filter((r) => !TERMINAL_STATUSES.includes(r.status as never)).length,
    resolved: bucket.filter((r) => r.resolved_at).length,
    breached: bucket.filter((r) => r.sla_state === "breached").length,
    avgResolutionMinutes: average(
      bucket.filter((r) => r.resolved_at).map((r) => minutesBetween(r.created_at, r.resolved_at as string)),
    ),
  })).sort((a, b) => b.open - a.open);

  const dayBuckets = new Map<string, { created: number; resolved: number }>();
  const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  for (const row of rows) {
    const created = dayKey(row.created_at);
    const bucket = dayBuckets.get(created) ?? { created: 0, resolved: 0 };
    bucket.created += 1;
    dayBuckets.set(created, bucket);
    if (row.resolved_at) {
      const resolvedKey = dayKey(row.resolved_at);
      const resolvedBucket = dayBuckets.get(resolvedKey) ?? { created: 0, resolved: 0 };
      resolvedBucket.resolved += 1;
      dayBuckets.set(resolvedKey, resolvedBucket);
    }
  }
  const daily = Array.from(dayBuckets.entries())
    .map(([day, value]) => ({ day, ...value }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const breachedTickets = rows
    .filter((r) => r.sla_state === "breached")
    .slice(0, 100)
    .map((r) => ({
      id: r.id,
      ref: r.ticket_number ?? r.reference,
      subject: r.subject,
      priority: r.priority,
      status: r.status,
      dueAt: r.due_resolution_at,
      teamName: r.team_id ? teamName.get(r.team_id) ?? null : null,
      assigneeName: r.assigned_to ? staffName.get(r.assigned_to) ?? null : null,
    }));

  return {
    range: { from, to },
    totals,
    sla: {
      firstResponseMet,
      firstResponseMissed,
      firstResponseCompliance: compliance(firstResponseMet, firstResponseMissed),
      resolutionMet,
      resolutionMissed,
      resolutionCompliance: compliance(resolutionMet, resolutionMissed),
      avgFirstResponseMinutes: average(firstResponseTimes),
      avgResolutionMinutes: average(resolutionTimes),
    },
    csat: { responses: ratings.length, average: ratings.length ? Number((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(2)) : null, distribution },
    byStatus,
    byCategory,
    byTeam,
    byAgent,
    daily,
    breachedTickets,
  };
}
