import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Users, CreditCard, AlertTriangle, Clock, Wallet, LifeBuoy, CheckCircle2, Building2,
  TrendingUp, Percent, FileText, HardDrive, MessageSquare, ShieldAlert, Database, Mail,
  Repeat, UserCheck, Gauge, Ban, Receipt,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { getPlatformMetrics, getPlatformOverview } from "@/lib/admin.functions";
import { getSystemHealth } from "@/lib/admin-ops.functions";
import { Badge, Btn, ErrorBlock, FormField, inputCls, SectionCard, StatsSkeleton } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { METRIC_RANGES, resolveRange, type MetricRangeId } from "@/lib/admin-metrics.shared";

export const Route = createFileRoute("/mehla-admin/")({
  head: () => ({
    meta: [
      { title: "لوحة إدارة منصة مِهلة" },
      { name: "description", content: "مؤشرات تشغيل منصة مِهلة القانونية: المكاتب والاشتراكات والإيرادات وحالة الخدمات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const num = (v: number) => new Intl.NumberFormat("ar-SA").format(Number(v ?? 0));
const money = (v: number) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(Number(v ?? 0))} ر.س`;
const pct = (v: number) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(Number(v ?? 0))}٪`;
const gb = (bytes: number) => {
  const mb = Number(bytes ?? 0) / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} ج.ب` : `${mb.toFixed(1)} م.ب`;
};

type Tone = "default" | "success" | "warning" | "danger";

function Stat({ label, value, Icon, tone = "default", hint }: {
  label: string; value: string; Icon: typeof Users; tone?: Tone; hint?: string;
}) {
  const toneCls = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft",
    danger: "text-danger bg-danger-soft",
  }[tone];
  return (
    <div className="surface-card p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-m)] ${toneCls}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-[18px] font-bold tabular-nums">{value}</p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [range, setRange] = useState<MetricRangeId>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const window = useMemo(() => resolveRange(range, { from, to }), [range, from, to]);
  const ready = range !== "custom" || (!!from && !!to);

  const fetchMetrics = useServerFn(getPlatformMetrics);
  const fetchOverview = useServerFn(getPlatformOverview);
  const fetchHealth = useServerFn(getSystemHealth);

  const metricsQ = useQuery({
    queryKey: ["platform-metrics", window.from, window.to],
    queryFn: () => fetchMetrics({ data: { from: window.from, to: window.to } }),
    enabled: ready,
    staleTime: 30_000,
  });
  const overviewQ = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
  });
  const healthQ = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => fetchHealth({ data: undefined }),
    refetchInterval: 120_000,
  });

  const m = metricsQ.data;

  return (
    <AdminShell
      title="لوحة المؤشرات"
      description="كل رقم في هذه الصفحة محسوب من قاعدة البيانات مباشرة خلال النطاق الزمني المحدد."
      actions={
        <Btn variant="outline" size="sm" loading={metricsQ.isFetching} onClick={() => metricsQ.refetch()}>
          تحديث
        </Btn>
      }
    >
      <div className="surface-card mb-5 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="النطاق الزمني">
          {METRIC_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`h-9 rounded-[var(--radius-m)] px-3 text-[13px] font-medium transition-colors ${
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
              <input type="date" className={inputCls} value={from} max={to || undefined}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} />
            </FormField>
            <FormField label="إلى تاريخ">
              <input type="date" className={inputCls} value={to} min={from || undefined}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} />
            </FormField>
          </div>
        )}
        {m && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            النطاق: {fmtDateTime(m.range.from)} — {fmtDateTime(m.range.to)} · حُسب في {fmtDateTime(m.generated_at)}
          </p>
        )}
      </div>

      {!ready ? (
        <p className="surface-card p-6 text-center text-sm text-muted-foreground">حدّد تاريخ البداية والنهاية لعرض المؤشرات.</p>
      ) : metricsQ.isError ? (
        <ErrorBlock message={(metricsQ.error as Error).message} />
      ) : !m ? (
        <StatsSkeleton count={12} />
      ) : (
        <div className="space-y-6">
          <SectionCard title="المكاتب" description={`${num(m.organizations.new_in_range)} مكتب جديد خلال النطاق`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="إجمالي المكاتب" value={num(m.organizations.total)} Icon={Building2} />
              <Stat label="مكاتب نشطة" value={num(m.organizations.active)} Icon={CheckCircle2} tone="success" />
              <Stat label="مكاتب موقوفة" value={num(m.organizations.suspended)} Icon={Ban} tone="danger" />
              <Stat label="مكاتب تجريبية" value={num(m.organizations.trial)} Icon={Clock} tone="warning" />
              <Stat label="بلا اشتراك نشط" value={num(m.organizations.no_subscription)} Icon={AlertTriangle} tone="warning" />
              <Stat label="مكاتب جديدة" value={num(m.organizations.new_in_range)} Icon={TrendingUp} />
              <Stat label="إجمالي المستخدمين" value={num(m.users.total)} Icon={Users} />
              <Stat label="تسجيلات جديدة" value={num(m.users.new_in_range)} Icon={UserCheck} />
            </div>
          </SectionCard>

          <SectionCard title="المستخدمون والأمان">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="مستخدمون نشطون" value={num(m.users.active)} Icon={CheckCircle2} tone="success" />
              <Stat label="مستخدمون موقوفون" value={num(m.users.suspended)} Icon={Ban} tone="danger" />
              <Stat label="جوال موثّق" value={num(m.users.phone_verified)} Icon={MessageSquare} />
              <Stat label="التحقق بخطوتين مُفعّل" value={num(m.users.mfa_enabled)} Icon={ShieldAlert} />
              <Stat label="بدون مكتب" value={num(m.users.without_org)} Icon={Users} tone="warning" />
              <Stat label="أعطال تقنية" value={num(m.reliability.failures_in_range)} Icon={AlertTriangle}
                tone={m.reliability.failures_in_range > 0 ? "danger" : "success"} />
              <Stat label="أعطال المصادقة" value={num(m.reliability.auth_failures_in_range)} Icon={ShieldAlert}
                tone={m.reliability.auth_failures_in_range > 0 ? "warning" : "success"} />
              <Stat label="عمليات إدارية مُدقّقة" value={num(m.reliability.audit_events_in_range)} Icon={FileText} />
            </div>
            {m.reliability.failures_by_surface.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {m.reliability.failures_by_surface.map((s) => (
                  <li key={s.label}>
                    <Badge tone="red">{s.label}: {num(s.count)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="الاشتراكات">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="اشتراكات نشطة" value={num(m.subscriptions.active)} Icon={CheckCircle2} tone="success" />
              <Stat label="تجريبية سارية" value={num(m.subscriptions.trial)} Icon={Clock} tone="warning" />
              <Stat label="تنتهي خلال ١٤ يوماً" value={num(m.subscriptions.expiring_14d)} Icon={Clock} tone="warning" />
              <Stat label="منتهية" value={num(m.subscriptions.expired)} Icon={AlertTriangle} tone="danger" />
              <Stat label="ملغاة" value={num(m.subscriptions.cancelled)} Icon={Ban} />
              <Stat label="موقوفة" value={num(m.subscriptions.suspended)} Icon={Ban} tone="danger" />
              <Stat label="تجديد تلقائي" value={num(m.subscriptions.auto_renew)} Icon={Repeat} />
              <Stat label="اشتراكات جديدة" value={num(m.subscriptions.new_in_range)} Icon={CreditCard} />
            </div>
          </SectionCard>

          {m.revenue ? (
            <SectionCard title="الإيرادات ومؤشرات النمو" description="محسوبة من الاشتراكات والفواتير المسجّلة">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="إيراد النطاق" value={money(m.revenue.in_range)} Icon={Wallet} />
                <Stat label="إيراد اليوم" value={money(m.revenue.today)} Icon={Wallet} />
                <Stat label="إيراد الشهر" value={money(m.revenue.month)} Icon={Wallet} />
                <Stat label="إيراد السنة" value={money(m.revenue.year)} Icon={CreditCard} />
                <Stat label="MRR" value={money(m.revenue.mrr)} Icon={TrendingUp} tone="success"
                  hint={`${num(m.revenue.paying_organizations)} مكتب مدفوع`} />
                <Stat label="ARR" value={money(m.revenue.arr)} Icon={TrendingUp} tone="success" />
                <Stat label="ARPU" value={money(m.revenue.arpu)} Icon={Gauge} />
                <Stat label="معدل التسرب" value={pct(m.revenue.churn_rate)} Icon={Percent}
                  tone={m.revenue.churn_rate > 5 ? "danger" : "success"}
                  hint={`${num(m.revenue.churned_in_range)} اشتراك مفقود`} />
                <Stat label="تحويل التجربة" value={pct(m.revenue.trial_conversion_rate)} Icon={Percent}
                  hint={`${num(m.revenue.trials_in_range)} تجربة جديدة`} />
                <Stat label="فواتير مدفوعة" value={num(m.revenue.invoices.paid)} Icon={Receipt} tone="success"
                  hint={money(m.revenue.invoices.paid_amount)} />
                <Stat label="فواتير معلّقة" value={num(m.revenue.invoices.pending)} Icon={Receipt} tone="warning"
                  hint={money(m.revenue.invoices.outstanding_amount)} />
                <Stat label="فواتير متأخرة" value={num(m.revenue.invoices.overdue)} Icon={AlertTriangle}
                  tone={m.revenue.invoices.overdue > 0 ? "danger" : "success"} />
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="الإيرادات">
              <p className="py-4 text-center text-xs text-muted-foreground">
                مؤشرات الإيرادات محجوبة عنك — تتطلب صلاحية «التقارير المالية».
              </p>
            </SectionCard>
          )}

          <SectionCard title="الاستخدام التشغيلي" description="أحجام البيانات الفعلية داخل المكاتب (عدّادات فقط، بلا أي محتوى)">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="إجمالي القضايا" value={num(m.usage.cases)} Icon={FileText}
                hint={`${num(m.usage.cases_in_range)} خلال النطاق`} />
              <Stat label="إجمالي العملاء" value={num(m.usage.clients)} Icon={Users} />
              <Stat label="إجمالي المستندات" value={num(m.usage.documents)} Icon={FileText}
                hint={`${num(m.usage.documents_in_range)} خلال النطاق`} />
              <Stat label="حجم التخزين" value={gb(m.usage.storage_bytes)} Icon={HardDrive} />
              <Stat label="صفحات OCR" value={num(m.usage.ocr_pages_in_range)} Icon={FileText} />
              <Stat label="جلسات مُسجّلة" value={num(m.usage.hearings_in_range)} Icon={Clock} />
              <Stat label="رسائل SMS ناجحة" value={num(m.messaging.sms_sent_in_range)} Icon={MessageSquare} tone="success" />
              <Stat label="رسائل SMS فاشلة" value={num(m.messaging.sms_failed_in_range)} Icon={MessageSquare}
                tone={m.messaging.sms_failed_in_range > 0 ? "danger" : "success"} />
              <Stat label="إشعارات داخلية" value={num(m.messaging.notifications_in_range)} Icon={Mail} />
              <Stat label="تعميمات مُرسلة" value={num(m.messaging.broadcasts_in_range)} Icon={Mail} />
              <Stat label="تذاكر مفتوحة" value={num(m.support.open)} Icon={LifeBuoy}
                tone={m.support.open > 0 ? "warning" : "success"} hint={`${num(m.support.unassigned)} بلا مسؤول`} />
              <Stat label="متوسط أول رد" value={`${num(m.support.avg_first_reply_hours)} ساعة`} Icon={Clock}
                hint={`${num(m.support.new_in_range)} تذكرة جديدة`} />
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="آخر عمليات التسجيل">
              {overviewQ.isLoading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">جاري التحميل…</p>
              ) : (overviewQ.data?.recentSignups ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">لا توجد تسجيلات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {overviewQ.data!.recentSignups.map((u: { id: string; full_name: string; email: string | null; created_at: string }) => (
                    <li key={u.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{u.full_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{u.email ?? "—"}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(u.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="حالة الخدمات" description="فحص حقيقي بزمن استجابة مقيس">
              {healthQ.isLoading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">جاري الفحص…</p>
              ) : healthQ.isError || !healthQ.data ? (
                <ErrorBlock message="تعذّر فحص حالة الخدمات." />
              ) : (
                <ul className="space-y-2">
                  {[
                    { label: "قاعدة البيانات", ok: healthQ.data.database.ok, hint: `${healthQ.data.database.latencyMs} م.ث`, Icon: Database },
                    { label: "التخزين", ok: healthQ.data.storage.ok, hint: `${healthQ.data.storage.latencyMs} م.ث`, Icon: HardDrive },
                  ].map((s) => (
                    <li key={s.label}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-m)] border border-border px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 text-[13px]">
                        <s.Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{s.label}</span>
                      </span>
                      <Badge tone={s.ok ? "green" : "red"}>{s.ok ? `تعمل · ${s.hint}` : "متعطلة"}</Badge>
                    </li>
                  ))}
                  <li className="pt-1 text-[11px] text-muted-foreground">
                    آخر فحص: {fmtDateTime(healthQ.data.checkedAt)} · تفاصيل أوسع في صفحة مراقبة النظام.
                  </li>
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
