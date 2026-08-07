import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Inbox,
  LifeBuoy,
  Plug,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { getPlatformMetrics } from "@/lib/admin.functions";
import { getSystemHealth } from "@/lib/admin-ops.functions";
import {
  getActivityOverview,
  getGrowthSeries,
  getJobsOverview,
  getServiceHealth,
} from "@/lib/admin-console.functions";
import { fmtMoney, fmtNumber } from "@/lib/admin-console.shared";
import { Btn, FormField, inputCls, SectionCard, StatsSkeleton } from "@/lib/list-utils";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { METRIC_RANGES, resolveRange, type MetricRangeId } from "@/lib/admin-metrics.shared";
import {
  deriveAlerts,
  deriveHealthRows,
  summarizeIntegrations,
} from "@/lib/admin-command-center.shared";
import {
  AlertsList,
  HealthList,
  Kpi,
  Sparkline,
  SummaryRows,
  Widget,
} from "@/components/admin/command-center/widgets";

export const Route = createFileRoute("/mehla-admin/")({
  head: () => ({
    meta: [
      { title: "مركز قيادة منصة مِهلة" },
      {
        name: "description",
        content:
          "مركز قيادة تشغيل منصة مِهلة: ما يحتاج انتباهك، مؤشرات النمو والإيراد، وصحة الخدمات.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const GROWTH_RANGES = [
  { days: 7, label: "٧ أيام" },
  { days: 30, label: "٣٠ يوماً" },
] as const;

function AdminDashboard() {
  const { can } = usePlatformAdmin();
  const canMonitor = can("monitoring.read");

  const [range, setRange] = useState<MetricRangeId>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [growthDays, setGrowthDays] = useState<number>(30);

  const period = useMemo(() => resolveRange(range, { from, to }), [range, from, to]);
  const ready = range !== "custom" || (!!from && !!to);

  const fetchMetrics = useServerFn(getPlatformMetrics);
  const fetchActivity = useServerFn(getActivityOverview);
  const fetchHealth = useServerFn(getSystemHealth);
  const fetchServiceHealth = useServerFn(getServiceHealth);
  const fetchJobs = useServerFn(getJobsOverview);
  const fetchGrowth = useServerFn(getGrowthSeries);

  const metricsQ = useQuery({
    queryKey: ["platform-metrics", period.from, period.to],
    queryFn: () => fetchMetrics({ data: { from: period.from, to: period.to } }),
    enabled: ready,
    staleTime: 30_000,
  });
  const activityQ = useQuery({
    queryKey: ["admin-activity-overview"],
    queryFn: () => fetchActivity({ data: undefined }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const healthQ = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => fetchHealth({ data: undefined }),
    refetchInterval: 120_000,
  });
  const serviceQ = useQuery({
    queryKey: ["admin-service-health"],
    queryFn: () => fetchServiceHealth({ data: undefined }),
    enabled: canMonitor,
    refetchInterval: 120_000,
  });
  const jobsQ = useQuery({
    queryKey: ["admin-jobs-overview"],
    queryFn: () => fetchJobs({ data: undefined }),
    enabled: canMonitor,
    refetchInterval: 120_000,
  });
  const growthQ = useQuery({
    queryKey: ["admin-growth", growthDays],
    queryFn: () => fetchGrowth({ data: { days: growthDays } }),
    enabled: canMonitor,
    staleTime: 120_000,
  });

  const m = metricsQ.data;
  const act = activityQ.data;
  const svc = serviceQ.data;
  const jobs = jobsQ.data;

  const alerts = useMemo(
    () => deriveAlerts({ metrics: m, activity: act, health: svc, jobs }),
    [m, act, svc, jobs],
  );
  const healthRows = useMemo(
    () =>
      deriveHealthRows({
        health: svc,
        jobs,
        database: healthQ.data?.database ?? null,
        storage: healthQ.data?.storage ?? null,
      }),
    [svc, jobs, healthQ.data],
  );
  const integrations = useMemo(() => summarizeIntegrations(svc), [svc]);

  const deadJobs = (jobs?.queues ?? []).reduce((acc, q) => acc + Number(q.dead ?? 0), 0);
  const failedMail = Number(svc?.email_transport.outbox_failed ?? 0);
  const openFailures = Number(svc?.reliability.failures_open ?? 0);
  const series = growthQ.data?.series ?? [];

  const alertsLoading =
    metricsQ.isLoading ||
    activityQ.isLoading ||
    (canMonitor && (serviceQ.isLoading || jobsQ.isLoading));
  const alertsError = metricsQ.isError || activityQ.isError || serviceQ.isError || jobsQ.isError;

  return (
    <AdminShell
      title="مركز القيادة"
      description="ما يحتاج انتباهك أولاً، ثم المؤشرات والاتجاهات وصحة الخدمات — كل رقم محسوب من قاعدة البيانات."
      actions={
        <Btn
          variant="outline"
          size="sm"
          loading={metricsQ.isFetching || serviceQ.isFetching}
          onClick={() => {
            void metricsQ.refetch();
            void activityQ.refetch();
            void healthQ.refetch();
            if (canMonitor) {
              void serviceQ.refetch();
              void jobsQ.refetch();
            }
          }}
        >
          تحديث
        </Btn>
      }
    >
      {/* ------------------------------------------------------ النطاق الزمني */}
      <div className="surface-card mb-5 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="النطاق الزمني">
          {METRIC_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`min-h-11 rounded-[var(--radius-m)] px-3 text-[13px] font-medium transition-colors ${
                range === r.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
            <FormField label="من تاريخ">
              <input
                type="date"
                className={inputCls}
                value={from}
                max={to || undefined}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
              />
            </FormField>
            <FormField label="إلى تاريخ">
              <input
                type="date"
                className={inputCls}
                value={to}
                min={from || undefined}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
              />
            </FormField>
          </div>
        )}
        {m && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            النطاق: {fmtDateTime(m.range.from)} — {fmtDateTime(m.range.to)} · حُسب في{" "}
            {fmtDateTime(m.generated_at)}
          </p>
        )}
      </div>

      {!ready ? (
        <p className="surface-card p-6 text-center text-sm text-muted-foreground">
          حدّد تاريخ البداية والنهاية لعرض المؤشرات.
        </p>
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------ المؤشرات الثمانية */}
          {metricsQ.isLoading ? (
            <StatsSkeleton count={8} />
          ) : metricsQ.isError || !m ? (
            <Widget
              title="المؤشرات الرئيسية"
              isError
              errorMessage={(metricsQ.error as Error | null)?.message}
              onRetry={() => void metricsQ.refetch()}
            >
              <span />
            </Widget>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                label="مكاتب نشطة"
                value={fmtNumber(m.organizations.active)}
                hint={`${fmtNumber(m.organizations.new_in_range)} مكتب جديد خلال النطاق`}
                Icon={Building2}
                tone="success"
                to="/mehla-admin/organizations"
              />
              <Kpi
                label="اشتراكات نشطة"
                value={fmtNumber(m.subscriptions.active)}
                hint={`${fmtNumber(m.subscriptions.expiring_14d)} ينتهي خلال ١٤ يوماً`}
                Icon={CreditCard}
                tone={m.subscriptions.expiring_14d > 0 ? "warning" : "default"}
                to="/mehla-admin/subscriptions"
              />
              {m.revenue && (
                <>
                  <Kpi
                    label="الإيراد الشهري المتكرر MRR"
                    value={fmtMoney(m.revenue.mrr)}
                    hint={`${fmtNumber(m.revenue.paying_organizations)} مكتب مدفوع`}
                    Icon={TrendingUp}
                    tone="success"
                    to="/mehla-admin/revenue"
                  />
                  <Kpi
                    label="الإيراد السنوي المتوقع ARR"
                    value={fmtMoney(m.revenue.arr)}
                    hint={`إيراد النطاق: ${fmtMoney(m.revenue.in_range)}`}
                    Icon={TrendingUp}
                    tone="success"
                    to="/mehla-admin/revenue"
                  />
                  <Kpi
                    label="فواتير متأخرة"
                    value={fmtNumber(m.revenue.invoices.overdue)}
                    hint={`مستحق غير مسدّد: ${fmtMoney(m.revenue.invoices.outstanding_amount)}`}
                    Icon={Receipt}
                    tone={m.revenue.invoices.overdue > 0 ? "danger" : "success"}
                    to="/mehla-admin/billing"
                  />
                </>
              )}
              <Kpi
                label="تذاكر خارج المهلة"
                value={fmtNumber(act?.tickets.breached ?? m.support.open)}
                hint={`${fmtNumber(m.support.open)} مفتوحة · ${fmtNumber(m.support.unassigned)} بلا مسؤول`}
                Icon={LifeBuoy}
                tone={(act?.tickets.breached ?? 0) > 0 ? "danger" : "success"}
                to="/mehla-admin/support"
              />
              {canMonitor && (
                <>
                  <Kpi
                    label="رسائل بريد فاشلة"
                    value={fmtNumber(failedMail)}
                    hint={`${fmtNumber(svc?.email_transport.outbox_queued ?? 0)} في الانتظار · ${fmtNumber(deadJobs)} مهمة مهملة`}
                    Icon={Inbox}
                    tone={failedMail > 0 || deadJobs > 0 ? "danger" : "success"}
                    to="/mehla-admin/mail"
                  />
                  <Kpi
                    label="أعطال تقنية مفتوحة"
                    value={fmtNumber(openFailures)}
                    hint={`${fmtNumber(m.reliability.failures_in_range)} عطل خلال النطاق`}
                    Icon={AlertTriangle}
                    tone={openFailures > 0 ? "danger" : "success"}
                    to="/mehla-admin/failures"
                  />
                </>
              )}
            </div>
          )}

          {/* ----------------------------------------------- تحتاج انتباهك */}
          <Widget
            title="تحتاج انتباهك"
            description="تنبيهات مشتقة من الحالة الفعلية فقط، مرتّبة حسب الخطورة، ولكل تنبيه إجراء."
            isLoading={alertsLoading}
            isError={alertsError && alerts.length === 0}
            errorMessage="تعذّر احتساب التنبيهات. حدّث الصفحة أو راجع مركز المراقبة."
            onRetry={() => {
              void metricsQ.refetch();
              void activityQ.refetch();
              if (canMonitor) {
                void serviceQ.refetch();
                void jobsQ.refetch();
              }
            }}
          >
            <AlertsList alerts={alerts} />
          </Widget>

          {/* -------------------------------------------------------- الاتجاهات */}
          {canMonitor && (
            <SectionCard
              title="الاتجاهات"
              description="سلاسل يومية فعلية من قاعدة البيانات."
              actions={
                <div className="flex flex-wrap gap-2" role="group" aria-label="مدى الاتجاهات">
                  {GROWTH_RANGES.map((r) => (
                    <Btn
                      key={r.days}
                      size="sm"
                      variant={growthDays === r.days ? "primary" : "outline"}
                      onClick={() => setGrowthDays(r.days)}
                    >
                      {r.label}
                    </Btn>
                  ))}
                </div>
              }
            >
              {growthQ.isLoading ? (
                <div className="h-32 animate-pulse rounded-[var(--radius-m)] bg-surface-muted motion-reduce:animate-none" />
              ) : growthQ.isError || !growthQ.data ? (
                <div className="grid gap-3 p-2 text-center">
                  <p className="text-[13px] text-muted-foreground">تعذّر قراءة سلاسل النمو.</p>
                  <div className="flex justify-center">
                    <Btn size="sm" variant="outline" onClick={() => void growthQ.refetch()}>
                      إعادة المحاولة
                    </Btn>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="min-w-0">
                    <p className="mb-2 text-[12.5px] font-semibold">مكاتب واشتراكات جديدة</p>
                    <Sparkline
                      label="المكاتب الجديدة"
                      points={series.map((p) => ({ day: fmtDate(p.day), value: p.organizations }))}
                      format={fmtNumber}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-2 text-[12.5px] font-semibold">الإيراد اليومي</p>
                    <Sparkline
                      label="الإيراد"
                      points={series.map((p) => ({ day: fmtDate(p.day), value: p.revenue }))}
                      format={fmtMoney}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-2 text-[12.5px] font-semibold">تذاكر الدعم</p>
                    <Sparkline
                      label="تذاكر الدعم"
                      points={series.map((p) => ({ day: fmtDate(p.day), value: p.tickets }))}
                      format={fmtNumber}
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* --------------------------------------- الصحة التشغيلية والتكاملات */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Widget
              title="الصحة التشغيلية"
              description="فحص حقيقي بزمن استجابة مقيس — التفاصيل في مركز المراقبة."
              isLoading={healthQ.isLoading || (canMonitor && serviceQ.isLoading)}
              isError={healthQ.isError && !healthQ.data}
              errorMessage="تعذّر فحص حالة الخدمات."
              onRetry={() => void healthQ.refetch()}
            >
              <div className="space-y-3">
                <HealthList rows={healthRows} />
                <p className="text-[11px] text-muted-foreground">
                  {healthQ.data
                    ? `آخر فحص: ${fmtDateTime(healthQ.data.checkedAt)}`
                    : "لم يُكتمل الفحص بعد."}
                </p>
                <Link
                  to="/mehla-admin/monitoring"
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-m)] border border-border px-3 text-[12.5px] font-semibold transition hover:bg-surface-muted"
                >
                  عرض مركز المراقبة
                </Link>
              </div>
            </Widget>

            <Widget
              title="جاهزية التكاملات"
              description="«غير مهيأ» حالة انتظار ربط، ولا تُحسب عطلاً."
              isLoading={canMonitor && serviceQ.isLoading}
              isError={canMonitor && serviceQ.isError}
              errorMessage="تعذّر قراءة حالة التكاملات."
              onRetry={() => void serviceQ.refetch()}
            >
              {!canMonitor ? (
                <p className="py-4 text-center text-[12.5px] text-muted-foreground">
                  حالة التكاملات محجوبة عنك — تتطلب صلاحية «مراقبة النظام».
                </p>
              ) : (
                <div className="space-y-3">
                  <SummaryRows
                    to="/mehla-admin/integrations"
                    cta="فتح مركز التكاملات"
                    rows={[
                      {
                        label: "مهيأة وتعمل",
                        value: fmtNumber(integrations.healthy),
                        tone: "success",
                      },
                      {
                        label: "تحتاج انتباهاً",
                        value: fmtNumber(integrations.attention),
                        tone: integrations.attention > 0 ? "danger" : "default",
                      },
                      { label: "غير مهيأة", value: fmtNumber(integrations.unconfigured) },
                    ]}
                  />
                  {integrations.pending.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {integrations.pending.map((i) => (
                        <li
                          key={i.key}
                          className="flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 text-[11.5px] text-muted-foreground"
                        >
                          <Plug className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{i.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Widget>
          </div>

          {/* --------------------------------------------------------- الملخصات */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Widget
              title="ملخص المالية"
              isLoading={metricsQ.isLoading}
              isError={metricsQ.isError}
              onRetry={() => void metricsQ.refetch()}
            >
              {m?.revenue ? (
                <SummaryRows
                  to="/mehla-admin/billing"
                  cta="فتح المركز المالي"
                  rows={[
                    { label: "MRR", value: fmtMoney(m.revenue.mrr), tone: "success" },
                    { label: "ARR", value: fmtMoney(m.revenue.arr) },
                    { label: "إيراد النطاق", value: fmtMoney(m.revenue.in_range) },
                    {
                      label: "مستحق غير مسدّد",
                      value: fmtMoney(m.revenue.invoices.outstanding_amount),
                      tone: m.revenue.invoices.outstanding_amount > 0 ? "warning" : "default",
                    },
                    {
                      label: "فواتير متأخرة",
                      value: fmtNumber(m.revenue.invoices.overdue),
                      tone: m.revenue.invoices.overdue > 0 ? "danger" : "success",
                    },
                  ]}
                />
              ) : (
                <p className="py-4 text-center text-[12.5px] text-muted-foreground">
                  المؤشرات المالية محجوبة عنك — تتطلب صلاحية «التقارير المالية».
                </p>
              )}
            </Widget>

            <Widget
              title="ملخص الدعم"
              isLoading={metricsQ.isLoading || activityQ.isLoading}
              isError={metricsQ.isError}
              onRetry={() => void metricsQ.refetch()}
            >
              {m ? (
                <SummaryRows
                  to="/mehla-admin/support"
                  cta="فتح مركز الدعم"
                  rows={[
                    { label: "تذاكر مفتوحة", value: fmtNumber(m.support.open) },
                    {
                      label: "بلا مسؤول",
                      value: fmtNumber(m.support.unassigned),
                      tone: m.support.unassigned > 0 ? "warning" : "default",
                    },
                    {
                      label: "خارج المهلة",
                      value: fmtNumber(act?.tickets.breached ?? 0),
                      tone: (act?.tickets.breached ?? 0) > 0 ? "danger" : "success",
                    },
                    {
                      label: "متوسط أول رد",
                      value: `${fmtNumber(m.support.avg_first_reply_hours)} ساعة`,
                    },
                    { label: "تذاكر جديدة خلال النطاق", value: fmtNumber(m.support.new_in_range) },
                  ]}
                />
              ) : (
                <span />
              )}
            </Widget>

            <Widget
              title="ملخص البريد"
              isLoading={activityQ.isLoading || (canMonitor && serviceQ.isLoading)}
              isError={activityQ.isError}
              onRetry={() => void activityQ.refetch()}
            >
              {act ? (
                <SummaryRows
                  to="/mehla-admin/mail"
                  cta="فتح مركز البريد"
                  rows={[
                    { label: "رسائل اليوم", value: fmtNumber(act.email.today) },
                    { label: "صناديق البريد", value: fmtNumber(act.email.mailboxes) },
                    {
                      label: "في انتظار الإرسال",
                      value: fmtNumber(svc?.email_transport.outbox_queued ?? 0),
                    },
                    {
                      label: "فاشلة",
                      value: fmtNumber(failedMail),
                      tone: failedMail > 0 ? "danger" : "success",
                    },
                    {
                      label: "آخر مزامنة",
                      value: act.email.last_sync_at ? fmtDateTime(act.email.last_sync_at) : "—",
                    },
                  ]}
                />
              ) : (
                <span />
              )}
            </Widget>
          </div>

          {/* --------------------------------------------- روابط التفاصيل الكاملة */}
          <SectionCard
            title="تفاصيل أوسع"
            description="الأرقام التشغيلية التفصيلية (الاستخدام، التخزين، قاعدة البيانات، المستخدمون) في صفحاتها المخصّصة."
          >
            <ul className="flex flex-wrap gap-2">
              {[
                { to: "/mehla-admin/analytics", label: "التحليلات والنمو" },
                { to: "/mehla-admin/monitoring", label: "مراقبة النظام" },
                { to: "/mehla-admin/users", label: "المستخدمون" },
                { to: "/mehla-admin/organizations", label: "المكاتب" },
                { to: "/mehla-admin/activity", label: "سجل النشاط الموحّد" },
              ].map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] border border-border px-3 text-[12.5px] font-medium transition hover:bg-surface-muted"
                  >
                    <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </AdminShell>
  );
}
