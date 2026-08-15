/**
 * مؤشر الإنجاز التشغيلي — طبقة الخادم (B2: نتيجة المكتب الخاصة).
 * الحساب كامل على الخادم، والقراءة Metadata تشغيلية فقط:
 * لا عناوين ولا أوصاف ولا بيانات عملاء أو قضايا أو مستندات.
 */

import { computeOperationalScore, type HearingMetric, type WorkItemMetric } from "./score.engine";
import { resolveScoreWindow, type OperationalScoreResult } from "./score.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export class OperationalScoreAccessError extends Error {}

/** يتحقق أن المستخدم عضو نشط في المكتب المطلوب (فوق RLS لا بدلاً منه). */
export async function requireActiveMembership(
  supabase: Client,
  organizationId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new OperationalScoreAccessError("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!data || data.status !== "active") {
    throw new OperationalScoreAccessError("لا تملك وصولاً إلى هذا المكتب.");
  }
}

type EventRow = {
  item_type: "task" | "deadline";
  item_id: string;
  event: string;
  occurred_at: string;
  from_due_date: string | null;
  to_due_date: string | null;
};

type ItemRow = {
  id: string;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
  status: string;
};

type HearingRow = { id: string; hearing_date: string; status: string; updated_at: string | null };

const EVIDENCE_EVENTS = ["due_changed", "reopened", "deleted"] as const;

/**
 * يحسب مؤشر المكتب الحالي داخل نافذة 90 يوماً.
 * استعلامات مجمّعة فقط: ثلاثة استعلامات للأعمال + استعلام واحد للأحداث + عمر المكتب. لا N+1.
 */
export async function computeOrganizationScore(
  supabase: Client,
  adminSupabase: Client,
  organizationId: string,
): Promise<OperationalScoreResult> {
  const now = new Date().toISOString();
  const { windowStart, windowEnd } = resolveScoreWindow(now);

  const [org, tasks, deadlines, hearings] = await Promise.all([
    supabase.from("organizations").select("created_at").eq("id", organizationId).maybeSingle(),
    supabase
      .from("tasks")
      .select("id, created_at, due_date, completed_at, status")
      .eq("organization_id", organizationId)
      .not("due_date", "is", null)
      .gte("due_date", windowStart)
      .lte("due_date", windowEnd),
    supabase
      .from("deadlines")
      .select("id, created_at, due_date, completed_at, status")
      .eq("organization_id", organizationId)
      .not("due_date", "is", null)
      .gte("due_date", windowStart)
      .lte("due_date", windowEnd),
    supabase
      .from("hearings")
      .select("id, hearing_date, status, updated_at")
      .eq("organization_id", organizationId)
      .gte("hearing_date", windowStart)
      .lte("hearing_date", windowEnd),
  ]);

  const failed = [org.error, tasks.error, deadlines.error, hearings.error].find(Boolean);
  if (failed) throw new OperationalScoreAccessError("تعذّر احتساب المؤشر التشغيلي حالياً.");

  const taskRows = (tasks.data ?? []) as ItemRow[];
  const deadlineRows = (deadlines.data ?? []) as ItemRow[];
  const hearingRows = (hearings.data ?? []) as HearingRow[];
  const itemIds = [...taskRows.map((r) => r.id), ...deadlineRows.map((r) => r.id)];

  // الأحداث دليل إيجابي فقط، وتُقرأ إدارياً بعد التحقق من العضوية لأن الجدول مغلق أمام Data API.
  let eventRows: EventRow[] = [];
  if (itemIds.length > 0) {
    const { data, error } = await adminSupabase
      .from("work_item_events")
      .select("item_type, item_id, event, occurred_at, from_due_date, to_due_date")
      .eq("organization_id", organizationId)
      .in("item_id", itemIds)
      .in("event", EVIDENCE_EVENTS as unknown as string[]);
    // فشل قراءة الأحداث لا يُعاقب المكتب: نكمل بلا أدلة (Positive evidence only).
    if (!error) eventRows = (data ?? []) as EventRow[];
  }

  const eventsByItem = new Map<string, EventRow[]>();
  for (const row of eventRows) {
    const list = eventsByItem.get(row.item_id);
    if (list) list.push(row);
    else eventsByItem.set(row.item_id, [row]);
  }

  const toMetric = (row: ItemRow, itemType: "task" | "deadline"): WorkItemMetric => ({
    id: row.id,
    itemType,
    createdAt: row.created_at,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    status: row.status,
    events: (eventsByItem.get(row.id) ?? [])
      .filter((e) => e.item_type === itemType)
      .map((e) => ({
        event: e.event as "due_changed" | "reopened" | "deleted",
        occurredAt: e.occurred_at,
        fromDueDate: e.from_due_date,
        toDueDate: e.to_due_date,
      })),
  });

  const hearingMetrics: HearingMetric[] = hearingRows.map((h) => ({
    id: h.id,
    hearingDate: h.hearing_date,
    status: h.status,
    updatedAt: h.updated_at,
  }));

  return computeOperationalScore({
    organizationCreatedAt: (org.data?.created_at as string | undefined) ?? now,
    tasks: taskRows.map((r) => toMetric(r, "task")),
    deadlines: deadlineRows.map((r) => toMetric(r, "deadline")),
    hearings: hearingMetrics,
    now,
  });
}
