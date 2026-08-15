/**
 * مؤشر الإنجاز التشغيلي — طبقة الخادم (B2: نتيجة المكتب الخاصة).
 * الحساب كامل على الخادم، والقراءة Metadata تشغيلية فقط:
 * لا عناوين ولا أوصاف ولا بيانات عملاء أو قضايا أو مستندات.
 */

import { computeOperationalScore, type HearingMetric, type WorkItemMetric } from "./score.engine";
import { assessPublicIntegrity, type DeletionEvent } from "./integrity.engine";
import type { PublicIntegrityAssessment } from "./integrity.shared";
import {
  DAY_MS,
  SCORE_WINDOW_DAYS,
  resolveScoreWindow,
  type OperationalScoreResult,
} from "./score.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export class OperationalScoreAccessError extends Error {}

/**
 * الحارس المركزي المعتمد في مِهلة: يثبت أن المكتب المطلوب هو مكتب يملك
 * المستخدم فيه عضوية **نشطة** مصرّحاً بها، فلا يُوثق بأي `organization_id`
 * قادم من العميل قبل هذا الإثبات (فوق RLS لا بدلاً منه).
 */
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
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new OperationalScoreAccessError("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!data) throw new OperationalScoreAccessError("لا تملك وصولاً إلى هذا المكتب.");
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

type HearingRow = { id: string; hearing_date: string; status: string; created_at: string };

/**
 * الحدث الوحيد المستهلَك في **حساب النتيجة** (B1): تصحيح الموعد المعتمد.
 * `deleted` يُقرأ في نفس الاستعلام لكنه لا يصل إلى محرك النتيجة أبداً — يُستخدم
 * فقط في بوابة نزاهة الظهور العام كدليل مثبت.
 */
const EVIDENCE_EVENTS = ["due_changed", "deleted"] as const;

/** حدود صريحة تمنع نمو الاستعلامات بلا سقف على المكاتب الكبيرة. */
const ITEM_ROWS_LIMIT = 5000;
const EVENT_ROWS_LIMIT = 10000;
/** الأحداث المصححة قد تسبق النافذة، فتُقرأ بنافذة زمنية موسّعة محدودة لا بقائمة معرفات. */
const EVENT_LOOKBACK_DAYS = SCORE_WINDOW_DAYS;

type OrganizationMetrics = {
  organizationCreatedAt: string;
  tasks: WorkItemMetric[];
  deadlines: WorkItemMetric[];
  hearings: HearingMetric[];
  deletionEvents: DeletionEvent[];
  now: string;
};

/**
 * تحميل واحد لكل Metadata التشغيلية داخل نافذة 90 يوماً.
 * استعلامات مجمّعة فقط: ثلاثة استعلامات للأعمال + استعلام واحد للأحداث + عمر المكتب. لا N+1.
 * تُعاد نفس الدفعة لمحرك النتيجة ولبوابة النزاهة بلا قراءة ثانية.
 */
async function loadOrganizationMetrics(
  supabase: Client,
  adminSupabase: Client,
  organizationId: string,
): Promise<OrganizationMetrics> {
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
      .lte("due_date", windowEnd)
      .limit(ITEM_ROWS_LIMIT),
    supabase
      .from("deadlines")
      .select("id, created_at, due_date, completed_at, status")
      .eq("organization_id", organizationId)
      .not("due_date", "is", null)
      .gte("due_date", windowStart)
      .lte("due_date", windowEnd)
      .limit(ITEM_ROWS_LIMIT),
    supabase
      .from("hearings")
      .select("id, hearing_date, status, created_at")
      .eq("organization_id", organizationId)
      .gte("hearing_date", windowStart)
      .lte("hearing_date", windowEnd)
      .limit(ITEM_ROWS_LIMIT),
  ]);

  const failed = [org.error, tasks.error, deadlines.error, hearings.error].find(Boolean);
  if (failed) throw new OperationalScoreAccessError("تعذّر احتساب المؤشر التشغيلي حالياً.");

  const taskRows = (tasks.data ?? []) as ItemRow[];
  const deadlineRows = (deadlines.data ?? []) as ItemRow[];
  const hearingRows = (hearings.data ?? []) as HearingRow[];
  const relevantIds = new Set([...taskRows.map((r) => r.id), ...deadlineRows.map((r) => r.id)]);

  /*
   * نمط الاستعلام المعتمد (بلا Migration وبلا `IN (thousandsOfIds)`):
   * تقييد بالمكتب + نافذة زمنية محدودة + نوع الحدث المطلوب فقط، ثم الربط
   * داخلياً عبر Set/Map. لا N+1 ولا استعلام لكل عنصر ولا طول URL غير محدود.
   * يُقرأ إدارياً بعد إثبات العضوية لأن الجدول مغلق أمام Data API لغير owner/admin.
   */
  let eventRows: EventRow[] = [];
  if (relevantIds.size > 0) {
    const eventsFrom = new Date(
      new Date(windowStart).getTime() - EVENT_LOOKBACK_DAYS * DAY_MS,
    ).toISOString();
    const { data, error } = await adminSupabase
      .from("work_item_events")
      .select("item_type, item_id, event, occurred_at, from_due_date, to_due_date")
      .eq("organization_id", organizationId)
      .in("event", EVIDENCE_EVENTS as unknown as string[])
      .gte("occurred_at", eventsFrom)
      .lte("occurred_at", windowEnd)
      .order("occurred_at", { ascending: false })
      .limit(EVENT_ROWS_LIMIT);
    // فشل قراءة الأحداث لا يُعاقب المكتب: نكمل بلا أدلة (Positive evidence only).
    if (!error) eventRows = ((data ?? []) as EventRow[]).filter((r) => relevantIds.has(r.item_id));
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
        event: "due_changed" as const,
        occurredAt: e.occurred_at,
        fromDueDate: e.from_due_date,
        toDueDate: e.to_due_date,
      })),
  });

  const hearingMetrics: HearingMetric[] = hearingRows.map((h) => ({
    id: h.id,
    hearingDate: h.hearing_date,
    status: h.status,
    createdAt: h.created_at,
  }));

  // أحداث الحذف: دليل مستقل لبوابة النزاهة فقط، ولا يمر على محرك النتيجة.
  const deletionEvents: DeletionEvent[] = eventRows
    .filter((e) => e.event === "deleted")
    .map((e) => ({
      itemType: e.item_type,
      occurredAt: e.occurred_at,
      dueDate: e.from_due_date ?? e.to_due_date,
    }));

  return {
    organizationCreatedAt: (org.data?.created_at as string | undefined) ?? now,
    tasks: taskRows.map((r) => toMetric(r, "task")),
    deadlines: deadlineRows.map((r) => toMetric(r, "deadline")),
    hearings: hearingMetrics,
    deletionEvents,
    now,
  };
}

/** نتيجة المكتب (B1) — سلوكها ومدخلاتها لم تتغير. */
export async function computeOrganizationScore(
  supabase: Client,
  adminSupabase: Client,
  organizationId: string,
): Promise<OperationalScoreResult> {
  const metrics = await loadOrganizationMetrics(supabase, adminSupabase, organizationId);
  return computeOperationalScore(metrics);
}

/**
 * النتيجة + بوابة نزاهة الظهور العام من **نفس** دفعة البيانات (بلا استعلام إضافي).
 * النتيجة تُحسب أولاً وتُمرَّر كما هي: البوابة لا تعدّلها ولا تخفضها.
 */
export async function computeOrganizationScoreWithIntegrity(
  supabase: Client,
  adminSupabase: Client,
  organizationId: string,
): Promise<{ result: OperationalScoreResult; integrity: PublicIntegrityAssessment }> {
  const metrics = await loadOrganizationMetrics(supabase, adminSupabase, organizationId);
  const result = computeOperationalScore(metrics);
  const integrity = assessPublicIntegrity({
    organizationCreatedAt: metrics.organizationCreatedAt,
    tasks: metrics.tasks,
    deadlines: metrics.deadlines,
    hearings: metrics.hearings,
    deletionEvents: metrics.deletionEvents,
    baseEligible: result.eligible,
    baseEligibilityReason: result.eligibilityReason,
    now: metrics.now,
  });
  return { result, integrity };
}
