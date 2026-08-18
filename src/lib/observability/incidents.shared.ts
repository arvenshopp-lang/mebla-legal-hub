/**
 * أنواع وتسميات الحوادث التشغيلية — مشتركة بين الخادم والواجهة.
 * لا تحمل أي بيانات مكاتب ولا محتوى قانوني: عدّادات وتصنيفات فقط.
 */

export type IncidentSource = "failure" | "job" | "queue";
export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "investigating" | "monitoring" | "resolved";

export const INCIDENT_SOURCE_LABELS: Record<IncidentSource, string> = {
  failure: "عطل مسجّل",
  job: "مهمة دورية",
  queue: "طابور تشغيلي",
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "مفتوحة",
  investigating: "تحت المعالجة",
  monitoring: "تحت المراقبة",
  resolved: "مغلقة",
};

export const INCIDENT_EVENT_LABELS: Record<string, string> = {
  opened: "فُتحت الحادثة",
  occurrence: "تكرار جديد",
  status_changed: "تغيير الحالة",
  assigned: "إسناد",
  resolved: "إغلاق",
  reopened: "إعادة فتح",
  note: "ملاحظة",
  alert_sent: "تنبيه مُرسل",
  alert_failed: "تعذّر إرسال التنبيه",
};

export type IncidentRow = {
  id: string;
  source: IncidentSource;
  surface: string;
  action: string;
  errorCode: string | null;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assigneeEmail: string | null;
  assigneeStaffId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  reopenedCount: number;
  sampleRef: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  lastAlertAt: string | null;
  alertCount: number;
  metadata: Record<string, string | number | boolean | null>;
};

export type IncidentEventRow = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorEmail: string | null;
  note: string | null;
  createdAt: string;
};

export type JobHeartbeatRow = {
  jobKey: string;
  label: string;
  schedule: string;
  sloSeconds: number;
  critical: boolean;
  enabled: boolean;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastStatus: "never" | "running" | "ok" | "failed";
  lastErrorCode: string | null;
  consecutiveFailures: number;
  runsTotal: number;
  /** محسوب على الخادم: ثوانٍ منذ آخر نجاح، وحالة الالتزام بالـ SLO. */
  secondsSinceSuccess: number | null;
  health: "ok" | "late" | "failed" | "never";
};

export const JOB_HEALTH_LABELS: Record<JobHeartbeatRow["health"], string> = {
  ok: "سليمة",
  late: "متأخرة عن الحد المسموح",
  failed: "فشل آخر تشغيل",
  never: "لم تُشغَّل بعد",
};

export type QueueHealthRow = {
  key: string;
  label: string;
  pending: number;
  failed: number;
  stuck: number;
  staleLocks: number;
  oldestPendingAt: string | null;
  oldestPendingMinutes: number | null;
  health: "ok" | "degraded" | "stalled";
  note: string;
};

export const QUEUE_HEALTH_LABELS: Record<QueueHealthRow["health"], string> = {
  ok: "طبيعية",
  degraded: "تحتاج متابعة",
  stalled: "متوقفة",
};

export type OperationsOverview = {
  checkedAt: string;
  jobs: JobHeartbeatRow[];
  queues: QueueHealthRow[];
  incidents: {
    open: number;
    investigating: number;
    monitoring: number;
    critical: number;
    unassigned: number;
    resolved24h: number;
  };
};