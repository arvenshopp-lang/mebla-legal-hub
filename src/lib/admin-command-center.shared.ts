/**
 * منطق مركز قيادة مالك المنصة — اشتقاق صافٍ (Pure) بلا أي طلب شبكة.
 *
 * كل قيمة هنا مشتقة من حِمول دوال خادمية قائمة ومحمية
 * (`admin_platform_metrics`, `admin_activity_overview`, `admin_service_health`,
 * `admin_jobs_overview`). لا يوجد أي رقم ثابت أو بيانات تجريبية، ولا يُشتق تنبيه
 * بلا إجراء واضح يمكن للمالك تنفيذه.
 */
import { fmtNumber } from "@/lib/format";
import type { PlatformMetrics } from "@/lib/admin-metrics.shared";
import type { ActivityOverview, JobsOverview, ServiceHealth } from "@/lib/admin-console.shared";

export type AlertSeverity = "critical" | "warning" | "info";

export type CommandAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** المسار الذي يُعالج فيه هذا التنبيه فعلياً. */
  to: string;
  cta: string;
  at?: string | null;
};

export type CommandCenterInput = {
  metrics?: PlatformMetrics | null;
  activity?: ActivityOverview | null;
  health?: ServiceHealth | null;
  jobs?: JobsOverview | null;
};

const n = (v: number | null | undefined) => Number(v ?? 0);
const ar = (v: number | null | undefined) => fmtNumber(n(v));

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "حرِج",
  warning: "تحذير",
  info: "للمتابعة",
};

/** حالات التكامل التي تُعدّ خللاً فعلياً — «غير مهيأ» ليست خللاً. */
const BROKEN_INTEGRATION_STATUSES = new Set(["down", "error", "failed", "degraded"]);

export function deriveAlerts(input: CommandCenterInput): CommandAlert[] {
  const { metrics, activity, health, jobs } = input;
  const out: CommandAlert[] = [];
  const push = (alert: CommandAlert) => out.push(alert);

  /* ----------------------------------------------------------- الدعم والـ SLA */
  const breached = n(activity?.tickets.breached);
  if (breached > 0) {
    push({
      id: "tickets-sla",
      severity: "critical",
      title: `${ar(breached)} تذكرة تجاوزت مهلة الاستجابة`,
      detail: `من إجمالي ${ar(activity?.tickets.open)} تذكرة مفتوحة — تحتاج ردّاً أو تصعيداً الآن.`,
      to: "/mehla-admin/support",
      cta: "فتح مركز الدعم",
    });
  }
  const unassigned = n(metrics?.support.unassigned);
  if (breached === 0 && unassigned > 0) {
    push({
      id: "tickets-unassigned",
      severity: "warning",
      title: `${ar(unassigned)} تذكرة بلا مسؤول`,
      detail: "أسنِد التذاكر لفريق الدعم قبل تجاوز مهلة الاستجابة.",
      to: "/mehla-admin/support",
      cta: "إسناد التذاكر",
    });
  }

  /* ------------------------------------------------------------------ المالية */
  const invoices = metrics?.revenue?.invoices;
  if (invoices && n(invoices.overdue) > 0) {
    push({
      id: "invoices-overdue",
      severity: "critical",
      title: `${ar(invoices.overdue)} فاتورة متأخرة عن السداد`,
      detail: `المبلغ المستحق غير المسدّد: ${ar(invoices.outstanding_amount)} ريال سعودي.`,
      to: "/mehla-admin/billing",
      cta: "فتح المركز المالي",
    });
  }
  const payFailed = n(health?.payments.failed_24h);
  if (payFailed > 0) {
    push({
      id: "payments-failed",
      severity: "warning",
      title: `${ar(payFailed)} محاولة دفع فاشلة خلال ٢٤ ساعة`,
      detail: `من إجمالي ${ar(health?.payments.attempts_24h)} محاولة — راجع سبب الرفض ومزوّد الدفع.`,
      to: "/mehla-admin/billing",
      cta: "مراجعة المحاولات",
    });
  }
  const webhooksPending = n(health?.payments.webhooks_pending);
  if (webhooksPending > 0) {
    push({
      id: "payment-webhooks",
      severity: "warning",
      title: `${ar(webhooksPending)} إشعار دفع بانتظار المعالجة`,
      detail: "ويب هوك المزوّد لم يُعالج بعد؛ قد تتأخر حالة الفواتير عن الواقع.",
      to: "/mehla-admin/integrations",
      cta: "فحص التكاملات",
    });
  }

  /* -------------------------------------------------------------------- البريد */
  const outboxFailed = n(health?.email_transport.outbox_failed);
  if (outboxFailed > 0) {
    push({
      id: "email-failed",
      severity: "critical",
      title: `${ar(outboxFailed)} رسالة بريد فاشلة`,
      detail:
        health?.email_transport.last_error?.trim() ||
        "الرسائل محفوظة ولم تُرسل — أعِد المحاولة من مركز البريد بعد معالجة السبب.",
      to: "/mehla-admin/mail",
      cta: "فتح مركز البريد",
      at: health?.email_transport.last_run_at ?? null,
    });
  }
  const failedRuns = n(health?.email_transport.failed_runs_24h);
  if (outboxFailed === 0 && failedRuns > 0) {
    push({
      id: "email-sync",
      severity: "warning",
      title: `${ar(failedRuns)} مزامنة بريد فاشلة خلال ٢٤ ساعة`,
      detail: "قد يتأخر وصول الرسائل الواردة إلى مركز البريد ومركز الدعم.",
      to: "/mehla-admin/mail",
      cta: "مراجعة الصناديق",
      at: health?.email_transport.last_success_at ?? null,
    });
  }

  /* ------------------------------------------------------------- طوابير المهام */
  const queues = jobs?.queues ?? [];
  const dead = queues.reduce((acc, q) => acc + n(q.dead), 0);
  const failedJobs = queues.reduce((acc, q) => acc + n(q.failed), 0);
  if (dead > 0) {
    push({
      id: "jobs-dead",
      severity: "critical",
      title: `${ar(dead)} مهمة في طابور المهملات (Dead Letter)`,
      detail: "استُنفدت محاولاتها ولن تُنفّذ تلقائياً — تحتاج معالجة يدوية.",
      to: "/mehla-admin/jobs",
      cta: "فتح مهام النظام",
    });
  }
  if (dead === 0 && failedJobs > 0) {
    push({
      id: "jobs-failed",
      severity: "warning",
      title: `${ar(failedJobs)} مهمة فاشلة قيد إعادة المحاولة`,
      detail: "راقب الطابور؛ إن تكرّر الفشل ستنتقل إلى طابور المهملات.",
      to: "/mehla-admin/jobs",
      cta: "متابعة الطوابير",
    });
  }

  /* --------------------------------------------------------------- التكاملات */
  const broken = (health?.integrations ?? []).filter(
    (i) => i.configured && i.enabled && BROKEN_INTEGRATION_STATUSES.has(i.status),
  );
  for (const integration of broken) {
    push({
      id: `integration-${integration.key}`,
      severity: integration.status === "degraded" ? "warning" : "critical",
      title: `تكامل «${integration.label}» ${integration.status === "degraded" ? "غير مستقر" : "متوقف"}`,
      detail:
        integration.last_error?.trim() ||
        "فشل آخر فحص للاتصال بالمزوّد؛ الخدمات المرتبطة به قد تتوقف.",
      to: "/mehla-admin/integrations",
      cta: "فحص التكامل",
      at: integration.last_error_at ?? integration.last_check_at ?? null,
    });
  }

  /* --------------------------------------------------------------- الاشتراكات */
  const expiring = n(metrics?.subscriptions.expiring_14d);
  if (expiring > 0) {
    push({
      id: "subs-expiring",
      severity: "warning",
      title: `${ar(expiring)} اشتراك ينتهي خلال ١٤ يوماً`,
      detail: "تواصل مع المكاتب قبل انتهاء الاشتراك لتجنّب توقّف الخدمة.",
      to: "/mehla-admin/subscriptions",
      cta: "متابعة الاشتراكات",
    });
  }
  const noSub = n(metrics?.organizations.no_subscription);
  if (noSub > 0) {
    push({
      id: "orgs-no-subscription",
      severity: "warning",
      title: `${ar(noSub)} مكتب بلا اشتراك نشط`,
      detail: "الميزات المدفوعة معطّلة لهذه المكاتب حتى تفعيل اشتراك.",
      to: "/mehla-admin/subscriptions",
      cta: "تفعيل اشتراك",
    });
  }

  /* -------------------------------------------------------- الأعطال والأمان */
  const recentFailures = n(health?.reliability.failures_24h);
  if (recentFailures > 0) {
    push({
      id: "failures-recent",
      severity: "critical",
      title: `${ar(recentFailures)} عطل تقني خلال 24 ساعة`,
      detail: health?.reliability.last_failure_ref
        ? `آخر مرجع عطل: ${health.reliability.last_failure_ref}`
        : "أعطال مسجّلة خلال آخر 24 ساعة.",
      to: "/mehla-admin/failures",
      cta: "فتح سجل الأعطال",
      at: health?.reliability.last_failure_at ?? null,
    });
  }
  const rlsDisabled = n(health?.database.rls_disabled);
  if (rlsDisabled > 0) {
    push({
      id: "rls-disabled",
      severity: "critical",
      title: `${ar(rlsDisabled)} جدول بلا حماية صفوف (RLS)`,
      detail: "عزل بيانات المكاتب معرّض للخطر — يجب تفعيل الحماية فوراً.",
      to: "/mehla-admin/security",
      cta: "فتح مركز الأمان",
    });
  }
  const smsFailed = n(health?.sms.failed_24h);
  if (smsFailed > 0) {
    push({
      id: "sms-failed",
      severity: "warning",
      title: `${ar(smsFailed)} رسالة نصية فاشلة خلال ٢٤ ساعة`,
      detail: health?.sms.last_error?.trim() || "راجع رصيد المزوّد وحالة القوالب.",
      to: "/mehla-admin/sms",
      cta: "فحص الرسائل",
      at: health?.sms.last_sent_at ?? null,
    });
  }

  return out.sort((a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]);
}

/* ============================================================ الصحة التشغيلية */

export type HealthState = "healthy" | "degraded" | "down" | "unconfigured" | "unknown";

export type HealthRow = {
  id: string;
  label: string;
  state: HealthState;
  hint: string;
  to: string;
};

export const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: "تعمل",
  degraded: "غير مستقرة",
  down: "متوقفة",
  unconfigured: "غير مهيأ",
  unknown: "قيد الفحص",
};

export function deriveHealthRows(input: {
  health?: ServiceHealth | null;
  jobs?: JobsOverview | null;
  database?: { ok: boolean; latencyMs: number } | null;
  storage?: { ok: boolean; latencyMs: number } | null;
}): HealthRow[] {
  const { health, jobs, database, storage } = input;
  const rows: HealthRow[] = [];

  rows.push({
    id: "database",
    label: "قاعدة البيانات",
    state: database ? (database.ok ? "healthy" : "down") : "unknown",
    hint: database ? `${ar(database.latencyMs)} م.ث` : "—",
    to: "/mehla-admin/monitoring",
  });
  rows.push({
    id: "storage",
    label: "التخزين",
    state: storage ? (storage.ok ? "healthy" : "down") : "unknown",
    hint: storage ? `${ar(storage.latencyMs)} م.ث` : "—",
    to: "/mehla-admin/monitoring",
  });

  if (health) {
    const mail = health.email_transport;
    rows.push({
      id: "mail",
      label: "نقل البريد",
      state:
        mail.mailboxes_active === 0
          ? "unconfigured"
          : n(mail.outbox_failed) > 0 || n(mail.failed_runs_24h) > 0
            ? "degraded"
            : "healthy",
      hint:
        mail.mailboxes_active === 0
          ? "لا يوجد صندوق مُفعّل"
          : `${ar(mail.outbox_queued)} في الانتظار · ${ar(mail.outbox_failed)} فاشلة`,
      to: "/mehla-admin/mail",
    });

    rows.push({
      id: "payments",
      label: "بوابة الدفع",
      state:
        health.payments.providers_active === 0
          ? "unconfigured"
          : n(health.payments.failed_24h) > 0 || n(health.payments.webhooks_pending) > 0
            ? "degraded"
            : "healthy",
      hint:
        health.payments.providers_active === 0
          ? "جاهز للربط"
          : `${ar(health.payments.attempts_24h)} محاولة · ${ar(health.payments.failed_24h)} فاشلة`,
      to: "/mehla-admin/billing",
    });

    rows.push({
      id: "sms",
      label: "الرسائل النصية والتحقق",
      state:
        n(health.sms.sent_24h) + n(health.sms.failed_24h) + n(health.otp.issued_24h) === 0
          ? "unconfigured"
          : n(health.sms.failed_24h) > 0
            ? "degraded"
            : "healthy",
      hint:
        n(health.sms.sent_24h) + n(health.sms.failed_24h) + n(health.otp.issued_24h) === 0
          ? "لا حركة خلال ٢٤ ساعة"
          : `${ar(health.sms.sent_24h)} مُرسلة · ${ar(health.otp.verified_24h)} تحقق ناجح`,
      to: "/mehla-admin/sms",
    });
  }

  if (jobs) {
    const dead = jobs.queues.reduce((acc, q) => acc + n(q.dead), 0);
    const failed = jobs.queues.reduce((acc, q) => acc + n(q.failed), 0);
    const queued = jobs.queues.reduce((acc, q) => acc + n(q.queued) + n(q.scheduled), 0);
    rows.push({
      id: "jobs",
      label: "طوابير المهام",
      state: dead > 0 ? "down" : failed > 0 ? "degraded" : "healthy",
      hint: `${ar(queued)} في الانتظار · ${ar(failed)} فاشلة · ${ar(dead)} مهملة`,
      to: "/mehla-admin/jobs",
    });
  }

  return rows;
}

/** التكاملات مصنّفة: مهيأة وسليمة / تحتاج انتباهاً / غير مهيأة (ليست عطلاً). */
export function summarizeIntegrations(health?: ServiceHealth | null): {
  healthy: number;
  attention: number;
  unconfigured: number;
  pending: { key: string; label: string }[];
} {
  const list = health?.integrations ?? [];
  const unconfigured = list.filter((i) => !i.configured);
  const attention = list.filter(
    (i) => i.configured && i.enabled && BROKEN_INTEGRATION_STATUSES.has(i.status),
  );
  return {
    healthy: list.length - unconfigured.length - attention.length,
    attention: attention.length,
    unconfigured: unconfigured.length,
    pending: unconfigured.map((i) => ({ key: i.key, label: i.label })),
  };
}
