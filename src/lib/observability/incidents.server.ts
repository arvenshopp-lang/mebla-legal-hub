/**
 * محرّك الحوادث التشغيلية.
 *
 * يُجمّع التكرارات في حادثة واحدة عبر بصمة ثابتة (المصدر + السطح + الإجراء + رمز
 * العطل)، فلا ينتج عن 600 عطل متطابق إلا حادثة واحدة لها عدّاد وأول/آخر ظهور.
 * لا يُخزَّن في الحادثة أي محتوى قانوني أو بيانات مكتب: العنوان مُصاغ من تصنيفات
 * النظام، والبيانات الإضافية تمر بقائمة سماح صارمة.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
} from "@/lib/observability/incidents.shared";

type Db = SupabaseClient<Database>;

export type IncidentInput = {
  source: IncidentSource;
  /** السطح أو مفتاح المهمة/الطابور. */
  surface: string;
  action: string;
  errorCode?: string | null;
  title: string;
  severity?: IncidentSeverity;
  sampleRef?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecordIncidentResult = {
  incidentId: string;
  isNew: boolean;
  reopened: boolean;
  shouldAlert: boolean;
  severity: IncidentSeverity;
  title: string;
  occurrences: number;
};

/** مفاتيح البيانات الإضافية المسموح حفظها — تشخيصية بحتة. */
const METADATA_ALLOWLIST = new Set([
  "attempts",
  "http_status",
  "error_class",
  "queue",
  "job_key",
  "pending",
  "failed",
  "stuck",
  "stale_locks",
  "oldest_pending_minutes",
  "seconds_since_success",
  "slo_seconds",
  "consecutive_failures",
  "origin",
  "identity",
  "provider",
  "latency_ms",
  "duration_ms",
]);

const SECRET_PATTERN = /(secret|token|password|authorization|api[_-]?key|cookie|bearer)/i;

/**
 * تنقية البيانات الإضافية: قائمة سماح + قيم قياسية قصيرة فقط.
 * أي مفتاح خارج القائمة أو يحمل دلالة سر يُسقَط بالكامل.
 */
export function sanitizeIncidentMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (!METADATA_ALLOWLIST.has(key)) continue;
    if (SECRET_PATTERN.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") {
      const text = value.trim();
      if (!text || SECRET_PATTERN.test(text) || text.length > 60) continue;
      out[key] = text;
    }
  }
  return out;
}

/** بصمة ثابتة قصيرة لتجميع التكرارات. */
export async function incidentFingerprint(input: {
  source: string;
  surface: string;
  action: string;
  errorCode?: string | null;
}): Promise<string> {
  const raw = [
    input.source,
    input.surface,
    input.action,
    (input.errorCode ?? "").trim().toLowerCase() || "none",
  ]
    .map((part) => part.trim().toLowerCase())
    .join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** أحداث التكرار تُسجَّل عند محطات فقط حتى لا يتضخم السجل. */
function isOccurrenceMilestone(occurrences: number): boolean {
  if (occurrences <= 10) return occurrences % 5 === 0;
  if (occurrences <= 100) return occurrences % 25 === 0;
  return occurrences % 100 === 0;
}

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** نافذة كتم التنبيه لنفس الحادثة (دقائق). */
const ALERT_COOLDOWN_MINUTES = 60;

async function addEvent(
  db: Db,
  incidentId: string,
  entry: {
    kind: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorEmail?: string | null;
    note?: string | null;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  await db.from("platform_incident_events").insert({
    incident_id: incidentId,
    kind: entry.kind,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    actor_email: entry.actorEmail ?? null,
    note: entry.note ? entry.note.slice(0, 500) : null,
    metadata: (entry.metadata ?? {}) as never,
  });
}

/**
 * يفتح حادثة أو يزيد عدّاد حادثة قائمة. لا يرمي أبداً: فشل الرصد لا يجوز أن
 * يُسقط العملية الأصلية.
 */
export async function recordIncident(
  db: Db,
  input: IncidentInput,
): Promise<RecordIncidentResult | null> {
  try {
    const fingerprint = await incidentFingerprint(input);
    const severity = input.severity ?? "medium";
    const metadata = sanitizeIncidentMetadata(input.metadata);
    const now = new Date().toISOString();

    const { data: existing } = await db
      .from("platform_incidents")
      .select(
        "id, status, severity, occurrences, reopened_count, last_alert_at, first_seen_at, title",
      )
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (!existing) {
      const { data: created, error } = await db
        .from("platform_incidents")
        .insert({
          fingerprint,
          source: input.source,
          surface: input.surface.slice(0, 60),
          action: input.action.slice(0, 80),
          error_code: input.errorCode ? input.errorCode.slice(0, 60) : null,
          title: input.title.slice(0, 160),
          severity,
          status: "open",
          sample_ref: input.sampleRef ?? null,
          metadata: metadata as never,
          first_seen_at: now,
          last_seen_at: now,
        })
        .select("id")
        .single();
      if (error || !created) return null;
      await addEvent(db, created.id, { kind: "opened", toStatus: "open", metadata });
      return {
        incidentId: created.id,
        isNew: true,
        reopened: false,
        shouldAlert: true,
        severity,
        title: input.title,
        occurrences: 1,
      };
    }

    const wasResolved = existing.status === "resolved";
    const occurrences = (existing.occurrences ?? 1) + 1;
    const nextSeverity: IncidentSeverity =
      SEVERITY_ORDER[severity] > SEVERITY_ORDER[existing.severity as IncidentSeverity]
        ? severity
        : (existing.severity as IncidentSeverity);

    await db
      .from("platform_incidents")
      .update({
        occurrences,
        last_seen_at: now,
        severity: nextSeverity,
        sample_ref: input.sampleRef ?? undefined,
        metadata: metadata as never,
        ...(wasResolved
          ? {
              status: "open",
              resolved_at: null,
              resolved_by: null,
              reopened_count: (existing.reopened_count ?? 0) + 1,
            }
          : {}),
      })
      .eq("id", existing.id);

    if (wasResolved) {
      await addEvent(db, existing.id, {
        kind: "reopened",
        fromStatus: "resolved",
        toStatus: "open",
        note: "تكرّر العطل بعد الإغلاق فأُعيد فتح الحادثة تلقائياً.",
        metadata,
      });
    } else if (isOccurrenceMilestone(occurrences)) {
      await addEvent(db, existing.id, {
        kind: "occurrence",
        metadata: { ...metadata, attempts: occurrences },
      });
    }

    const cooledDown =
      !existing.last_alert_at ||
      Date.now() - new Date(existing.last_alert_at).getTime() >
        ALERT_COOLDOWN_MINUTES * 60 * 1000;

    return {
      incidentId: existing.id,
      isNew: false,
      reopened: wasResolved,
      shouldAlert:
        wasResolved ||
        (cooledDown && (nextSeverity === "critical" || nextSeverity === "high")),
      severity: nextSeverity,
      title: existing.title ?? input.title,
      occurrences,
    };
  } catch (error) {
    console.error(
      "[incidents] تعذّر تسجيل الحادثة",
      error instanceof Error ? error.message.slice(0, 160) : "unknown",
    );
    return null;
  }
}

/** تسجيل نجاح تشغيلي: يُغلق حادثة قائمة تلقائياً بحالة «تحت المراقبة». */
export async function markIncidentRecovered(
  db: Db,
  key: { source: IncidentSource; surface: string; action: string; errorCode?: string | null },
  note: string,
): Promise<void> {
  try {
    const fingerprint = await incidentFingerprint(key);
    const { data: existing } = await db
      .from("platform_incidents")
      .select("id, status")
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (!existing || existing.status === "resolved") return;
    await db
      .from("platform_incidents")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: "نظام الرصد",
        resolution: note.slice(0, 300),
      })
      .eq("id", existing.id);
    await addEvent(db, existing.id, {
      kind: "resolved",
      fromStatus: existing.status,
      toStatus: "resolved",
      actorEmail: null,
      note,
    });
  } catch {
    // الرصد لا يُسقط العملية الأصلية.
  }
}

/** يُسجّل نتيجة محاولة التنبيه على الحادثة. */
export async function recordAlertOutcome(
  db: Db,
  incidentId: string,
  outcome: { sent: boolean; channel: string; reason?: string | null },
): Promise<void> {
  if (outcome.sent) {
    const { data: current } = await db
      .from("platform_incidents")
      .select("alert_count")
      .eq("id", incidentId)
      .maybeSingle();
    await db
      .from("platform_incidents")
      .update({
        last_alert_at: new Date().toISOString(),
        alert_count: (current?.alert_count ?? 0) + 1,
      })
      .eq("id", incidentId);
  }
  await addEvent(db, incidentId, {
    kind: outcome.sent ? "alert_sent" : "alert_failed",
    note: outcome.sent
      ? `أُرسل التنبيه عبر ${outcome.channel}.`
      : `تعذّر إرسال التنبيه عبر ${outcome.channel}${outcome.reason ? ` (${outcome.reason})` : ""}.`,
  });
}

export type TransitionInput = {
  incidentId: string;
  status?: IncidentStatus;
  assigneeStaffId?: string | null;
  resolution?: string | null;
  note?: string | null;
  actorEmail: string;
};

/** تغيير حالة الحادثة أو إسنادها أو إضافة ملاحظة — يُعيد الصف قبل وبعد للتدقيق. */
export async function applyIncidentTransition(db: Db, input: TransitionInput) {
  const { data: before, error: readError } = await db
    .from("platform_incidents")
    .select("id, status, assignee_staff_id, assignee_email, resolution, resolved_at, resolved_by")
    .eq("id", input.incidentId)
    .maybeSingle();
  if (readError || !before) throw new Error("الحادثة غير موجودة.");

  const patch: Database["public"]["Tables"]["platform_incidents"]["Update"] = {};

  if (input.status && input.status !== before.status) {
    patch.status = input.status;
    if (input.status === "resolved") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = input.actorEmail;
      patch.resolution = (input.resolution ?? "").trim().slice(0, 300) || "أُغلقت يدوياً.";
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
  }

  let assigneeEmail: string | null | undefined;
  if (input.assigneeStaffId !== undefined) {
    if (input.assigneeStaffId === null) {
      patch.assignee_staff_id = null;
      patch.assignee_email = null;
      assigneeEmail = null;
    } else {
      const { data: staff } = await db
        .from("platform_staff")
        .select("id, email, status")
        .eq("id", input.assigneeStaffId)
        .maybeSingle();
      if (!staff || staff.status !== "active") throw new Error("الموظف المحدد غير متاح للإسناد.");
      patch.assignee_staff_id = staff.id;
      patch.assignee_email = staff.email;
      assigneeEmail = staff.email;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("platform_incidents").update(patch).eq("id", input.incidentId);
    if (error) throw new Error("تعذّر تحديث الحادثة.");
  }

  if (patch.status !== undefined) {
    await addEvent(db, input.incidentId, {
      kind: input.status === "resolved" ? "resolved" : "status_changed",
      fromStatus: before.status,
      toStatus: input.status ?? null,
      actorEmail: input.actorEmail,
      note: input.status === "resolved" ? (patch.resolution ?? null) : (input.note ?? null),
    });
  }
  if (assigneeEmail !== undefined) {
    await addEvent(db, input.incidentId, {
      kind: "assigned",
      actorEmail: input.actorEmail,
      note: assigneeEmail ? `أُسندت إلى ${assigneeEmail}.` : "أُلغي الإسناد.",
    });
  }
  if (input.note && patch.status === undefined) {
    await addEvent(db, input.incidentId, {
      kind: "note",
      actorEmail: input.actorEmail,
      note: input.note,
    });
  }

  const { data: after } = await db
    .from("platform_incidents")
    .select("id, status, assignee_staff_id, assignee_email, resolution, resolved_at, resolved_by")
    .eq("id", input.incidentId)
    .maybeSingle();

  return { before, after };
}