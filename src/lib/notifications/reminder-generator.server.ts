/**
 * مولّد التذكيرات التشغيلية (خادمي فقط) — المرحلة 2.
 *
 * ينتج إشعارات مِهلة العادية فقط، ثم تتولى القناة القائمة الباقي:
 * إشعار داخل التطبيق + إدراج بريد عند تفعيل التفضيل → Hostinger.
 * لا نظام بريد ثانٍ، ولا حالة تفضيلات موازية، ولا حذف ولا تعديل لأي كيان.
 *
 * منع التكرار حتمي عبر `notifications.dedup_key` مع القيد الفريد
 * `(user_id, dedup_key)`، لذا تكرار التشغيل كل ساعة آمن تماماً.
 */
import { riyadhDaysBetween } from "@/lib/format";
import { createUserNotification } from "./email-channel.server";
import {
  DEADLINE_REMINDABLE_STATUSES,
  DEADLINE_REMINDER_EVENTS,
  HEARING_REMINDABLE_STATUSES,
  HEARING_REMINDER_EVENTS,
  REMINDER_COPY,
  REMINDER_EVENT_PREFERENCE,
  REMINDER_SCAN_LIMIT,
  TASK_OVERDUE_EVENT,
  TASK_OVERDUE_STATUSES,
  THRESHOLD_SUFFIX,
  reminderDedupKey,
  thresholdForDaysAhead,
  type ReminderEventType,
} from "./reminders.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ReminderReport = {
  scanned: { hearings: number; deadlines: number; tasks: number };
  created: number;
  duplicates: number;
  skippedPreference: number;
  skippedRecipient: number;
  failed: number;
  /** لا عتبة إلحاح مُعرَّفة في المنتج، فحدث القضايا الخاملة غير منفّذ. */
  inactiveCases: "THRESHOLD_MISSING";
};

type PreferenceRow = Record<string, boolean> & {
  organization_id: string;
  user_id: string;
};

type PreferenceIndex = Map<string, PreferenceRow>;

const key = (organizationId: string, userId: string) => `${organizationId}:${userId}`;

/** غياب صف التفضيلات = مفعّل (نفس افتراضي القاعدة الحالي). */
export function preferenceEnabled(
  prefs: PreferenceIndex,
  organizationId: string,
  userId: string,
  event: ReminderEventType,
): boolean {
  const row = prefs.get(key(organizationId, userId));
  if (!row) return true;
  return row[REMINDER_EVENT_PREFERENCE[event]] !== false;
}

/**
 * قناة واحدة على الأقل مطلوبة: إن أُوقف داخل التطبيق والبريد معاً فلا يُنشأ
 * إشعار إطلاقاً. صف الإشعار هو نفسه سجل «داخل التطبيق» ومصدر البريد، فلا
 * يمكن فصل القناتين أكثر من ذلك في المعمارية الحالية.
 */
export function anyChannelEnabled(
  prefs: PreferenceIndex,
  organizationId: string,
  userId: string,
): boolean {
  const row = prefs.get(key(organizationId, userId));
  if (!row) return true;
  return row["in_app_enabled"] !== false || row["email_enabled"] !== false;
}

async function loadPreferences(db: Db): Promise<PreferenceIndex> {
  const { data, error } = await db.from("user_notification_preferences").select("*");
  if (error) throw new Error((error as { message: string }).message);
  const index: PreferenceIndex = new Map();
  for (const row of (data ?? []) as PreferenceRow[]) {
    index.set(key(row.organization_id, row.user_id), row);
  }
  return index;
}

/** عزل المكتب: عضوية نشطة في نفس مكتب الكيان شرط لأي تذكير. */
async function loadActiveMemberships(db: Db): Promise<Set<string>> {
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id, user_id")
    .eq("status", "active");
  if (error) throw new Error((error as { message: string }).message);
  const set = new Set<string>();
  for (const row of (data ?? []) as { organization_id: string; user_id: string }[]) {
    set.add(key(row.organization_id, row.user_id));
  }
  return set;
}

type Candidate = {
  organizationId: string;
  userId: string;
  event: ReminderEventType;
  dedupKey: string;
  relatedCaseId?: string | null;
  relatedHearingId?: string | null;
  relatedDeadlineId?: string | null;
  relatedTaskId?: string | null;
};

/**
 * جمع مرشّحي الجلسات: التاريخ الفعلي، حدود أيام الرياض، والجلسات المجدولة فقط
 * (الملغاة والمنتهية والفائتة مستثناة). المستلم = محامي القضية المسؤول داخل
 * نفس مكتب الجلسة، فلا يُنبَّه كل أعضاء المكتب.
 */
export async function collectHearingCandidates(
  db: Db,
  now: Date,
): Promise<{ candidates: Candidate[]; scanned: number }> {
  const horizon = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString();
  const floor = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("hearings")
    .select("id, organization_id, case_id, hearing_date, status, cases!inner(assigned_lawyer_id)")
    .in("status", HEARING_REMINDABLE_STATUSES as unknown as string[])
    .gte("hearing_date", floor)
    .lte("hearing_date", horizon)
    .limit(REMINDER_SCAN_LIMIT);
  if (error) throw new Error((error as { message: string }).message);

  const rows = (data ?? []) as {
    id: string;
    organization_id: string;
    case_id: string;
    hearing_date: string;
    cases: { assigned_lawyer_id: string | null } | null;
  }[];

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const userId = row.cases?.assigned_lawyer_id ?? null;
    if (!userId) continue;
    const threshold = thresholdForDaysAhead(riyadhDaysBetween(now, row.hearing_date));
    if (threshold === null) continue;
    candidates.push({
      organizationId: row.organization_id,
      userId,
      event: HEARING_REMINDER_EVENTS[threshold],
      dedupKey: reminderDedupKey({
        organizationId: row.organization_id,
        entity: "hearing",
        entityId: row.id,
        suffix: THRESHOLD_SUFFIX[threshold],
      }),
      relatedCaseId: row.case_id,
      relatedHearingId: row.id,
    });
  }
  return { candidates, scanned: rows.length };
}

/** المهل: تاريخ الاستحقاق الفعلي، النشطة فقط، والمستلم هو المسؤول عنها. */
export async function collectDeadlineCandidates(
  db: Db,
  now: Date,
): Promise<{ candidates: Candidate[]; scanned: number }> {
  const horizon = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString();
  const floor = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("deadlines")
    .select("id, organization_id, case_id, due_date, status, responsible_user_id")
    .in("status", DEADLINE_REMINDABLE_STATUSES as unknown as string[])
    .gte("due_date", floor)
    .lte("due_date", horizon)
    .limit(REMINDER_SCAN_LIMIT);
  if (error) throw new Error((error as { message: string }).message);

  const rows = (data ?? []) as {
    id: string;
    organization_id: string;
    case_id: string | null;
    due_date: string;
    responsible_user_id: string | null;
  }[];

  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (!row.responsible_user_id) continue;
    const threshold = thresholdForDaysAhead(riyadhDaysBetween(now, row.due_date));
    if (threshold === null) continue;
    candidates.push({
      organizationId: row.organization_id,
      userId: row.responsible_user_id,
      event: DEADLINE_REMINDER_EVENTS[threshold],
      dedupKey: reminderDedupKey({
        organizationId: row.organization_id,
        entity: "deadline",
        entityId: row.id,
        suffix: THRESHOLD_SUFFIX[threshold],
      }),
      relatedCaseId: row.case_id ?? null,
      relatedDeadlineId: row.id,
    });
  }
  return { candidates, scanned: rows.length };
}

/** المهام المتأخرة: غير مكتملة وتجاوز موعدها — تذكير واحد لكل مهمة/مستلم. */
export async function collectOverdueTaskCandidates(
  db: Db,
  now: Date,
): Promise<{ candidates: Candidate[]; scanned: number }> {
  const { data, error } = await db
    .from("tasks")
    .select("id, organization_id, case_id, due_date, status, assigned_to")
    .in("status", TASK_OVERDUE_STATUSES as unknown as string[])
    .not("due_date", "is", null)
    .lt("due_date", now.toISOString())
    .limit(REMINDER_SCAN_LIMIT);
  if (error) throw new Error((error as { message: string }).message);

  const rows = (data ?? []) as {
    id: string;
    organization_id: string;
    case_id: string | null;
    assigned_to: string | null;
  }[];

  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (!row.assigned_to) continue;
    candidates.push({
      organizationId: row.organization_id,
      userId: row.assigned_to,
      event: TASK_OVERDUE_EVENT,
      dedupKey: reminderDedupKey({
        organizationId: row.organization_id,
        entity: "task",
        entityId: row.id,
        suffix: "overdue",
      }),
      relatedCaseId: row.case_id ?? null,
      relatedTaskId: row.id,
    });
  }
  return { candidates, scanned: rows.length };
}

/**
 * تشغيل واحد للمولّد. لا يرمي على مستوى الصف: فشل مرشّح لا يُسقط الدفعة،
 * ولا يُسجَّل أي محتوى أو بريد في السجلات.
 */
export async function generateOperationalReminders(
  db: Db,
  now: Date = new Date(),
): Promise<ReminderReport> {
  const [prefs, memberships] = await Promise.all([loadPreferences(db), loadActiveMemberships(db)]);

  const hearings = await collectHearingCandidates(db, now);
  const deadlines = await collectDeadlineCandidates(db, now);
  const tasks = await collectOverdueTaskCandidates(db, now);

  const report: ReminderReport = {
    scanned: {
      hearings: hearings.scanned,
      deadlines: deadlines.scanned,
      tasks: tasks.scanned,
    },
    created: 0,
    duplicates: 0,
    skippedPreference: 0,
    skippedRecipient: 0,
    failed: 0,
    inactiveCases: "THRESHOLD_MISSING",
  };

  const all = [...hearings.candidates, ...deadlines.candidates, ...tasks.candidates];
  for (const candidate of all) {
    if (!memberships.has(key(candidate.organizationId, candidate.userId))) {
      report.skippedRecipient += 1;
      continue;
    }
    if (
      !preferenceEnabled(prefs, candidate.organizationId, candidate.userId, candidate.event) ||
      !anyChannelEnabled(prefs, candidate.organizationId, candidate.userId)
    ) {
      report.skippedPreference += 1;
      continue;
    }

    const copy = REMINDER_COPY[candidate.event];
    try {
      const outcome = await createUserNotification(db, {
        organizationId: candidate.organizationId,
        userId: candidate.userId,
        type: candidate.event,
        title: copy.title,
        message: copy.message,
        dedupKey: candidate.dedupKey,
        sentAt: new Date().toISOString(),
        relatedCaseId: candidate.relatedCaseId ?? null,
        relatedHearingId: candidate.relatedHearingId ?? null,
        relatedDeadlineId: candidate.relatedDeadlineId ?? null,
        relatedTaskId: candidate.relatedTaskId ?? null,
      });
      if (outcome.duplicate) report.duplicates += 1;
      else report.created += 1;
    } catch {
      report.failed += 1;
      console.error("[reminders] تعذّر إنشاء تذكير", candidate.event);
    }
  }

  return report;
}
