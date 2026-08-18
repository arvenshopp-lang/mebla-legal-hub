/**
 * حارس التشغيل (Watchdog).
 *
 * يقيس التزام كل مهمة دورية بحدّها الزمني (SLO)، ويقرأ عدّادات الطوابير
 * الأساسية للكشف عن التوقف والعناصر العالقة والأقفال المهجورة، ثم يفتح حادثة
 * واحدة لكل مشكلة (بلا تكرار) ويُغلقها تلقائياً عند تعافي المصدر.
 *
 * القراءات عدّادات فقط: لا تُقرأ حمولة رسالة ولا مستند ولا محتوى قانوني.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  JobHeartbeatRow,
  OperationsOverview,
  QueueHealthRow,
} from "@/lib/observability/incidents.shared";
import {
  markIncidentRecovered,
  recordAlertOutcome,
  recordIncident,
} from "@/lib/observability/incidents.server";
import { dispatchIncidentAlert } from "@/lib/observability/alert-channel.server";

type Db = SupabaseClient<Database>;

/** عنصر يُعدّ عالقاً إذا بقي «قيد المعالجة» أكثر من هذه المدة. */
const STUCK_MINUTES = 20;
/** قفل يُعدّ مهجوراً بعد هذه المدة. */
const STALE_LOCK_MINUTES = 15;
/** طابور يُعدّ متوقفاً إذا تجاوز أقدم عنصر منتظر هذه المدة. */
const STALLED_PENDING_MINUTES = 30;

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * مُرشِّح عدّ عام: أنواع PostgREST المُولَّدة تختلف لكل جدول، ونحن نحتاج تمرير
 * مرشّحات بسيطة على جداول متعددة، فيُستخدم نوع مرن هنا فقط لبناء العدّاد.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountFilter = (builder: any) => PromiseLike<{ count: number | null }>;

/** يحوّل صف النبضة إلى قراءة تشغيلية مع حالة الالتزام بالـ SLO. */
export function evaluateHeartbeat(
  row: Database["public"]["Tables"]["platform_job_heartbeats"]["Row"],
  now = Date.now(),
): JobHeartbeatRow {
  const secondsSinceSuccess = row.last_success_at
    ? Math.max(0, Math.round((now - new Date(row.last_success_at).getTime()) / 1000))
    : null;

  let health: JobHeartbeatRow["health"];
  if (!row.enabled) health = "ok";
  else if (row.last_status === "failed" || (row.consecutive_failures ?? 0) > 0) health = "failed";
  else if (secondsSinceSuccess === null) health = "never";
  else if (secondsSinceSuccess > row.slo_seconds) health = "late";
  else health = "ok";

  return {
    jobKey: row.job_key,
    label: row.label,
    schedule: row.schedule,
    sloSeconds: row.slo_seconds,
    critical: row.critical,
    enabled: row.enabled,
    lastStartedAt: row.last_started_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastDurationMs: row.last_duration_ms,
    lastStatus: (row.last_status as JobHeartbeatRow["lastStatus"]) ?? "never",
    lastErrorCode: row.last_error_code,
    consecutiveFailures: row.consecutive_failures ?? 0,
    runsTotal: row.runs_total ?? 0,
    secondsSinceSuccess,
    health,
  };
}

async function readJobs(db: Db): Promise<JobHeartbeatRow[]> {
  const { data } = await db
    .from("platform_job_heartbeats")
    .select("*")
    .order("critical", { ascending: false })
    .order("job_key", { ascending: true });
  const now = Date.now();
  return (data ?? []).map((row) => evaluateHeartbeat(row, now));
}

type QueueProbe = {
  key: string;
  label: string;
  read: () => Promise<Omit<QueueHealthRow, "key" | "label" | "health" | "note">>;
};

function classifyQueue(
  metrics: Omit<QueueHealthRow, "key" | "label" | "health" | "note">,
): { health: QueueHealthRow["health"]; note: string } {
  if (metrics.staleLocks > 0) {
    return { health: "stalled", note: `${metrics.staleLocks} قفل مهجور يمنع المعالجة.` };
  }
  if (metrics.stuck > 0) {
    return { health: "stalled", note: `${metrics.stuck} عنصر عالق قيد المعالجة.` };
  }
  if ((metrics.oldestPendingMinutes ?? 0) > STALLED_PENDING_MINUTES) {
    return {
      health: "stalled",
      note: `أقدم عنصر منتظر منذ ${metrics.oldestPendingMinutes} دقيقة دون معالجة.`,
    };
  }
  if (metrics.failed > 0) {
    return { health: "degraded", note: `${metrics.failed} عنصر فاشل يحتاج مراجعة.` };
  }
  return { health: "ok", note: "لا توجد عناصر عالقة أو أقفال مهجورة." };
}

async function oldestPending(
  db: Db,
  table: "notification_email_queue" | "notification_queue" | "email_outbox",
  statuses: string[],
): Promise<{ oldestPendingAt: string | null; oldestPendingMinutes: number | null }> {
  const { data } = await db
    .from(table)
    .select("created_at")
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(1);
  const created = data?.[0]?.created_at ?? null;
  return {
    oldestPendingAt: created,
    oldestPendingMinutes: created
      ? Math.max(0, Math.round((Date.now() - new Date(created).getTime()) / 60_000))
      : null,
  };
}

async function count(
  db: Db,
  table:
    | "notification_email_queue"
    | "notification_queue"
    | "email_outbox"
    | "document_processing_jobs",
  apply: CountFilter,
): Promise<number> {
  const { count: total } = await apply(
    db.from(table).select("id", { count: "exact", head: true }),
  );
  return total ?? 0;
}

function queueProbes(db: Db): QueueProbe[] {
  return [
    {
      key: "notification_email_queue",
      label: "طابور بريد الإشعارات",
      read: async () => ({
        pending: await count(db, "notification_email_queue", (q) => q.eq("status", "pending")),
        failed: await count(db, "notification_email_queue", (q) => q.eq("status", "failed")),
        stuck: await count(db, "notification_email_queue", (q) =>
          q.eq("status", "processing").lt("processing_started_at", minutesAgo(STUCK_MINUTES)),
        ),
        staleLocks: 0,
        ...(await oldestPending(db, "notification_email_queue", ["pending"])),
      }),
    },
    {
      key: "notification_queue",
      label: "طابور الإشعارات والرسائل",
      read: async () => ({
        pending: await count(db, "notification_queue", (q) => q.eq("status", "pending")),
        failed: await count(db, "notification_queue", (q) => q.eq("status", "failed")),
        stuck: await count(db, "notification_queue", (q) =>
          q.eq("status", "processing").lt("processing_at", minutesAgo(STUCK_MINUTES)),
        ),
        staleLocks: 0,
        ...(await oldestPending(db, "notification_queue", ["pending"])),
      }),
    },
    {
      key: "email_outbox",
      label: "صندوق إرسال البريد",
      read: async () => ({
        pending: await count(db, "email_outbox", (q) => q.eq("status", "queued")),
        failed: await count(db, "email_outbox", (q) => q.eq("status", "failed")),
        stuck: await count(db, "email_outbox", (q) =>
          q.eq("status", "sending").lt("locked_at", minutesAgo(STUCK_MINUTES)),
        ),
        staleLocks: await count(db, "email_outbox", (q) =>
          q.not("locked_at", "is", null).lt("locked_at", minutesAgo(STALE_LOCK_MINUTES)),
        ),
        ...(await oldestPending(db, "email_outbox", ["queued"])),
      }),
    },
    {
      key: "document_processing_jobs",
      label: "طابور معالجة المستندات",
      read: async () => ({
        pending: await count(db, "document_processing_jobs", (q) => q.eq("status", "queued")),
        failed: await count(db, "document_processing_jobs", (q) => q.eq("status", "failed")),
        stuck: await count(db, "document_processing_jobs", (q) =>
          q
            .in("status", ["extracting", "ocr_processing", "indexing"])
            .lt("updated_at", minutesAgo(STUCK_MINUTES)),
        ),
        staleLocks: 0,
        oldestPendingAt: null,
        oldestPendingMinutes: null,
      }),
    },
  ];
}

async function readQueues(db: Db): Promise<QueueHealthRow[]> {
  const probes = queueProbes(db);
  const rows: QueueHealthRow[] = [];
  for (const probe of probes) {
    try {
      const metrics = await probe.read();
      const { health, note } = classifyQueue(metrics);
      rows.push({ key: probe.key, label: probe.label, ...metrics, health, note });
    } catch {
      rows.push({
        key: probe.key,
        label: probe.label,
        pending: 0,
        failed: 0,
        stuck: 0,
        staleLocks: 0,
        oldestPendingAt: null,
        oldestPendingMinutes: null,
        health: "degraded",
        note: "تعذّر قراءة حالة الطابور.",
      });
    }
  }
  return rows;
}

async function readIncidentCounters(db: Db): Promise<OperationsOverview["incidents"]> {
  const since = minutesAgo(24 * 60);
  const [open, investigating, monitoring, critical, unassigned, resolved24h] = await Promise.all([
    countIncidents(db, (q) => q.eq("status", "open")),
    countIncidents(db, (q) => q.eq("status", "investigating")),
    countIncidents(db, (q) => q.eq("status", "monitoring")),
    countIncidents(db, (q) => q.neq("status", "resolved").eq("severity", "critical")),
    countIncidents(db, (q) => q.neq("status", "resolved").is("assignee_staff_id", null)),
    countIncidents(db, (q) => q.eq("status", "resolved").gte("resolved_at", since)),
  ]);
  return { open, investigating, monitoring, critical, unassigned, resolved24h };
}

async function countIncidents(db: Db, apply: CountFilter): Promise<number> {
  const { count: total } = await apply(
    db.from("platform_incidents").select("id", { count: "exact", head: true }),
  );
  return total ?? 0;
}

/** قراءة تشغيلية موحّدة للعرض في لوحة العمليات. */
export async function readOperationsOverview(db: Db): Promise<OperationsOverview> {
  const [jobs, queues, incidents] = await Promise.all([
    readJobs(db),
    readQueues(db),
    readIncidentCounters(db),
  ]);
  return { checkedAt: new Date().toISOString(), jobs, queues, incidents };
}

async function openWatchdogIncident(
  db: Db,
  input: Parameters<typeof recordIncident>[1],
): Promise<void> {
  const incident = await recordIncident(db, input);
  if (!incident?.shouldAlert) return;
  const outcome = await dispatchIncidentAlert(db, {
    incidentId: incident.incidentId,
    title: incident.title,
    severity: incident.severity,
    surface: input.surface,
    action: input.action,
    occurrences: incident.occurrences,
    reopened: incident.reopened,
  });
  await recordAlertOutcome(db, incident.incidentId, {
    sent: outcome.sent,
    channel: outcome.channel,
    reason: outcome.reason ?? null,
  });
}

export type WatchdogResult = {
  checkedAt: string;
  jobsChecked: number;
  jobIncidents: number;
  queuesChecked: number;
  queueIncidents: number;
  recovered: number;
};

/**
 * دورة الحارس: تقييم النبضات والطوابير، وفتح/إغلاق الحوادث تلقائياً.
 */
export async function runWatchdog(db: Db): Promise<WatchdogResult> {
  const [jobs, queues] = await Promise.all([readJobs(db), readQueues(db)]);
  let jobIncidents = 0;
  let queueIncidents = 0;
  let recovered = 0;

  for (const job of jobs) {
    if (!job.enabled) continue;
    const action = job.health === "failed" ? "job_failing" : "job_late";
    if (job.health === "failed" || job.health === "late") {
      jobIncidents += 1;
      await openWatchdogIncident(db, {
        source: "job",
        surface: job.jobKey,
        action,
        errorCode: job.health === "failed" ? (job.lastErrorCode ?? "job_failed") : "slo_breach",
        title:
          job.health === "failed"
            ? `فشل المهمة الدورية: ${job.label}`
            : `تأخر المهمة الدورية عن الحد المسموح: ${job.label}`,
        severity: job.critical ? "critical" : "high",
        metadata: {
          job_key: job.jobKey,
          slo_seconds: job.sloSeconds,
          seconds_since_success: job.secondsSinceSuccess ?? undefined,
          consecutive_failures: job.consecutiveFailures,
        },
      });
    } else {
      for (const staleAction of ["job_failing", "job_late"] as const) {
        await markIncidentRecovered(
          db,
          {
            source: "job",
            surface: job.jobKey,
            action: staleAction,
            errorCode: staleAction === "job_late" ? "slo_breach" : (job.lastErrorCode ?? "job_failed"),
          },
          "عادت المهمة للعمل داخل الحد الزمني المسموح.",
        );
      }
      recovered += 1;
    }
  }

  for (const queue of queues) {
    if (queue.health === "stalled") {
      queueIncidents += 1;
      await openWatchdogIncident(db, {
        source: "queue",
        surface: queue.key,
        action: "queue_stalled",
        errorCode: "queue_stalled",
        title: `توقف الطابور: ${queue.label}`,
        severity: "critical",
        metadata: {
          queue: queue.key,
          pending: queue.pending,
          failed: queue.failed,
          stuck: queue.stuck,
          stale_locks: queue.staleLocks,
          oldest_pending_minutes: queue.oldestPendingMinutes ?? undefined,
        },
      });
    } else {
      await markIncidentRecovered(
        db,
        { source: "queue", surface: queue.key, action: "queue_stalled", errorCode: "queue_stalled" },
        "عاد الطابور للعمل الطبيعي.",
      );
      recovered += 1;
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    jobsChecked: jobs.length,
    jobIncidents,
    queuesChecked: queues.length,
    queueIncidents,
    recovered,
  };
}