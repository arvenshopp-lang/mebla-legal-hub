/**
 * قراءات الحوادث التشغيلية للوحة الإدارة.
 *
 * قراءة فقط: قوائم مصفّاة، تفاصيل حادثة مع سطرها الزمني، وقائمة الموظفين
 * المتاحين للإسناد. لا تُقرأ أي بيانات مكتب أو محتوى قانوني — الحوادث تصنيفات
 * وعدّادات فقط.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  IncidentEventRow,
  IncidentRow,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
} from "@/lib/observability/incidents.shared";

type Db = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["platform_incidents"]["Row"];

export type IncidentListFilters = {
  statuses: IncidentStatus[];
  severities: IncidentSeverity[];
  sources: IncidentSource[];
  search: string;
  limit: number;
  offset: number;
};

export type IncidentListResult = {
  rows: IncidentRow[];
  total: number;
};

export type AssignableStaff = { id: string; fullName: string; email: string };

export function mapIncident(row: Row): IncidentRow {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, string | number | boolean | null>)
      : {};
  return {
    id: row.id,
    source: row.source as IncidentSource,
    surface: row.surface,
    action: row.action,
    errorCode: row.error_code,
    title: row.title,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    assigneeEmail: row.assignee_email,
    assigneeStaffId: row.assignee_staff_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    occurrences: row.occurrences ?? 0,
    reopenedCount: row.reopened_count ?? 0,
    sampleRef: row.sample_ref,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    lastAlertAt: row.last_alert_at,
    alertCount: row.alert_count ?? 0,
    metadata,
  };
}

export async function readIncidents(
  db: Db,
  filters: IncidentListFilters,
): Promise<IncidentListResult> {
  let query = db
    .from("platform_incidents")
    .select("*", { count: "exact" })
    .in("status", filters.statuses)
    .in("severity", filters.severities)
    .in("source", filters.sources)
    .order("last_seen_at", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  const term = filters.search.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,surface.ilike.%${safe}%,action.ilike.%${safe}%,error_code.ilike.%${safe}%,sample_ref.ilike.%${safe}%`,
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error("تعذّر قراءة سجل الحوادث.");
  return { rows: (data ?? []).map(mapIncident), total: count ?? 0 };
}

export async function readIncidentDetail(
  db: Db,
  incidentId: string,
): Promise<{ incident: IncidentRow; events: IncidentEventRow[] }> {
  const { data, error } = await db
    .from("platform_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();
  if (error || !data) throw new Error("الحادثة غير موجودة.");

  const { data: events } = await db
    .from("platform_incident_events")
    .select("id, kind, from_status, to_status, actor_email, note, created_at")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    incident: mapIncident(data),
    events: (events ?? []).map((event) => ({
      id: event.id,
      kind: event.kind,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      actorEmail: event.actor_email,
      note: event.note,
      createdAt: event.created_at,
    })),
  };
}

export async function readAssignableStaff(db: Db): Promise<AssignableStaff[]> {
  const { data } = await db
    .from("platform_staff")
    .select("id, full_name, email")
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(200);
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, email: row.email }));
}
