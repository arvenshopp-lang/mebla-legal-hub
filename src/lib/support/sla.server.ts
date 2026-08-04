/**
 * محرك المهل (SLA) لمركز الدعم — خادمي فقط.
 *
 * كل الحسابات «وقت عمل» بتوقيت الرياض: تقويم أيام وساعات العمل + جدول العطلات،
 * مع إيقاف العدّاد أثناء انتظار المكتب أو جهة داخلية. الواجهة لا تحسب أي مهلة.
 */
import { PAUSING_STATUSES, type SlaState, type TicketPriority, type TicketStatus } from "./support.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** الرياض بلا توقيت صيفي: إزاحة ثابتة +03:00. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Calendar = {
  id: string;
  work_days: number[];
  start_minute: number;
  end_minute: number;
  holidays: Set<string>;
};

export type SlaPolicy = {
  id: string;
  code: string;
  name_ar: string;
  calendar_id: string;
  first_response_minutes: number;
  resolution_minutes: number;
  pause_on_customer_wait: boolean;
  warning_percent: number;
  critical_percent: number;
};

export async function loadCalendar(db: Db, calendarId: string): Promise<Calendar> {
  const { data: calRow } = await db
    .from("support_business_calendars")
    .select("id, work_days, start_minute, end_minute")
    .eq("id", calendarId)
    .maybeSingle();
  const cal = calRow as Omit<Calendar, "holidays"> | null;
  if (!cal) throw new Error("تقويم العمل غير موجود.");
  const { data: holidayRows } = await db
    .from("support_holidays")
    .select("holiday_date")
    .eq("calendar_id", calendarId);
  return {
    ...cal,
    holidays: new Set(((holidayRows ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date)),
  };
}

/** أجزاء التاريخ بتوقيت الرياض (يوم الأسبوع 0=الأحد، دقائق من منتصف الليل). */
function riyadhParts(date: Date): { dateKey: string; weekday: number } {
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
  };
}

/** بداية يوم الرياض (00:00) كطابع مطلق. */
function riyadhDayStart(date: Date): number {
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.getTime() - RIYADH_OFFSET_MS;
}

function isWorkDay(cal: Calendar, date: Date): boolean {
  const { dateKey, weekday } = riyadhParts(date);
  return cal.work_days.includes(weekday) && !cal.holidays.has(dateKey);
}

/** أول لحظة عمل عند/بعد الطابع المُعطى. */
function nextWorkInstant(cal: Calendar, from: Date): Date {
  let cursorDay = riyadhDayStart(from);
  for (let i = 0; i < 400; i += 1) {
    const dayDate = new Date(cursorDay);
    if (isWorkDay(cal, dayDate)) {
      const open = cursorDay + cal.start_minute * 60000;
      const close = cursorDay + cal.end_minute * 60000;
      const t = from.getTime();
      if (t < open) return new Date(open);
      if (t < close) return from;
    }
    cursorDay += DAY_MS;
  }
  return from;
}

/** إضافة دقائق عمل فعلية إلى طابع، مع تخطي غير أوقات العمل والعطلات. */
export function addBusinessMinutes(cal: Calendar, from: Date, minutes: number): Date {
  if (minutes <= 0) return nextWorkInstant(cal, from);
  let remaining = minutes;
  let cursor = nextWorkInstant(cal, from);
  for (let i = 0; i < 800 && remaining > 0; i += 1) {
    const dayStart = riyadhDayStart(cursor);
    const close = dayStart + cal.end_minute * 60000;
    const available = Math.max(0, Math.floor((close - cursor.getTime()) / 60000));
    if (available >= remaining) return new Date(cursor.getTime() + remaining * 60000);
    remaining -= available;
    cursor = nextWorkInstant(cal, new Date(dayStart + DAY_MS));
  }
  return cursor;
}

/** دقائق العمل المنقضية بين طابعين (تُستخدم في التقارير ومؤشرات التجاوز). */
export function businessMinutesBetween(cal: Calendar, from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let total = 0;
  let cursor = nextWorkInstant(cal, from);
  for (let i = 0; i < 800 && cursor.getTime() < to.getTime(); i += 1) {
    const dayStart = riyadhDayStart(cursor);
    const close = dayStart + cal.end_minute * 60000;
    const segmentEnd = Math.min(close, to.getTime());
    if (segmentEnd > cursor.getTime()) total += Math.floor((segmentEnd - cursor.getTime()) / 60000);
    cursor = nextWorkInstant(cal, new Date(dayStart + DAY_MS));
  }
  return total;
}

/** اختيار السياسة الأخص: الباقة ← الأولوية ← القناة ← التصنيف. */
export async function selectPolicy(
  db: Db,
  match: { planCode: string | null; priority: TicketPriority; channel: string; category: string },
): Promise<SlaPolicy> {
  const { data } = await db
    .from("support_sla_policies")
    .select(
      "id, code, name_ar, calendar_id, plan_code, priority, channel, category, first_response_minutes, resolution_minutes, pause_on_customer_wait, warning_percent, critical_percent, specificity",
    )
    .eq("is_active", true)
    .order("specificity", { ascending: false });

  const rows = (data ?? []) as (SlaPolicy & {
    plan_code: string | null;
    priority: string | null;
    channel: string | null;
    category: string | null;
    specificity: number;
  })[];

  const chosen = rows.find(
    (p) =>
      (p.plan_code === null || p.plan_code === match.planCode) &&
      (p.priority === null || p.priority === match.priority) &&
      (p.channel === null || p.channel === match.channel) &&
      (p.category === null || p.category === match.category),
  );
  if (!chosen) throw new Error("لا توجد سياسة مهل مطبّقة. راجع إعدادات المهل.");
  return chosen;
}

/** حساب مواعيد المهل عند إنشاء التذكرة. */
export async function computeDueDates(
  db: Db,
  policy: SlaPolicy,
  startIso: string,
): Promise<{ dueFirstResponseAt: string; dueResolutionAt: string }> {
  const cal = await loadCalendar(db, policy.calendar_id);
  const start = new Date(startIso);
  return {
    dueFirstResponseAt: addBusinessMinutes(cal, start, policy.first_response_minutes).toISOString(),
    dueResolutionAt: addBusinessMinutes(cal, start, policy.resolution_minutes).toISOString(),
  };
}

/** تمديد المهل بمقدار فترة التوقّف عند الاستئناف. */
export async function shiftDueDates(
  db: Db,
  policy: SlaPolicy,
  dues: { first: string | null; resolution: string | null },
  pausedSeconds: number,
): Promise<{ first: string | null; resolution: string | null }> {
  if (pausedSeconds <= 0) return dues;
  const cal = await loadCalendar(db, policy.calendar_id);
  const minutes = Math.round(pausedSeconds / 60);
  return {
    first: dues.first ? addBusinessMinutes(cal, new Date(dues.first), minutes).toISOString() : null,
    resolution: dues.resolution
      ? addBusinessMinutes(cal, new Date(dues.resolution), minutes).toISOString()
      : null,
  };
}

export type SlaTicketFacts = {
  status: TicketStatus;
  first_response_at: string | null;
  resolved_at: string | null;
  due_first_response_at: string | null;
  due_resolution_at: string | null;
  created_at: string;
  paused_at: string | null;
};

/**
 * حالة المهلة الحالية للتذكرة — تُحسب خادمياً وتُخزَّن في `sla_state`.
 * الأولوية: تجاوز > حرج > تحذير > موقوف > مُنجز > داخل المهلة.
 */
export function evaluateSlaState(
  ticket: SlaTicketFacts,
  policy: Pick<SlaPolicy, "warning_percent" | "critical_percent">,
  nowMs = Date.now(),
): SlaState {
  const breachedFirst =
    !ticket.first_response_at &&
    !!ticket.due_first_response_at &&
    new Date(ticket.due_first_response_at).getTime() < nowMs;
  const breachedResolution =
    !ticket.resolved_at && !!ticket.due_resolution_at && new Date(ticket.due_resolution_at).getTime() < nowMs;

  if (ticket.resolved_at) {
    const late =
      !!ticket.due_resolution_at &&
      new Date(ticket.resolved_at).getTime() > new Date(ticket.due_resolution_at).getTime();
    return late ? "breached" : "met";
  }
  if (breachedFirst || breachedResolution) return "breached";
  if (ticket.paused_at || PAUSING_STATUSES.includes(ticket.status)) return "paused";

  const ratios: number[] = [];
  const start = new Date(ticket.created_at).getTime();
  if (!ticket.first_response_at && ticket.due_first_response_at) {
    ratios.push(consumedRatio(start, new Date(ticket.due_first_response_at).getTime(), nowMs));
  }
  if (ticket.due_resolution_at) {
    ratios.push(consumedRatio(start, new Date(ticket.due_resolution_at).getTime(), nowMs));
  }
  const worst = ratios.length ? Math.max(...ratios) : 0;
  if (worst >= policy.critical_percent / 100) return "critical";
  if (worst >= policy.warning_percent / 100) return "warning";
  return "ok";
}

function consumedRatio(startMs: number, dueMs: number, nowMs: number): number {
  const span = dueMs - startMs;
  if (span <= 0) return 1;
  return (nowMs - startMs) / span;
}

/** كتابة حدث مهلة (إدراج فقط). */
export async function writeSlaEvent(
  db: Db,
  entry: {
    ticketId: string;
    eventType: string;
    metric: "first_response" | "resolution" | "both";
    policyId?: string | null;
    dueAt?: string | null;
    pausedSeconds?: number | null;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.from("support_sla_events").insert({
    ticket_id: entry.ticketId,
    event_type: entry.eventType,
    metric: entry.metric,
    policy_id: entry.policyId ?? null,
    due_at: entry.dueAt ?? null,
    paused_seconds: entry.pausedSeconds ?? null,
    reason: entry.reason,
    metadata: entry.metadata ?? {},
  });
}