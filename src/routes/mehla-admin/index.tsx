import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  CreditCard,
  AlertTriangle,
  Clock,
  Wallet,
  LifeBuoy,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { getPlatformOverview } from "@/lib/admin.functions";
import { ErrorBlock, SectionCard, StatsSkeleton } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";

export const Route = createFileRoute("/mehla-admin/")({
  head: () => ({
    meta: [
      { title: "لوحة إدارة منصة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const money = (v: number, currency = "SAR") =>
  `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(v)} ${currency}`;

function Stat({
  label,
  value,
  Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  Icon: typeof Users;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneCls = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft",
    danger: "text-danger bg-danger-soft",
  }[tone];
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-m)] ${toneCls}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="text-[18px] font-bold tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const fetchOverview = useServerFn(getPlatformOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });

  return (
    <AdminShell title="لوحة المؤشرات" description="نظرة تشغيلية شاملة على منصة مِهلة.">
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading || !data ? (
        <StatsSkeleton count={8} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="إجمالي المشتركين" value={data.stats.totalSubs} Icon={Users} />
            <Stat label="اشتراكات نشطة" value={data.stats.activeSubs} Icon={CheckCircle2} tone="success" />
            <Stat label="اشتراكات منتهية" value={data.stats.expiredSubs} Icon={AlertTriangle} tone="danger" />
            <Stat label="تنتهي خلال ١٤ يوماً" value={data.stats.expiringSoon} Icon={Clock} tone="warning" />
            <Stat label="إيرادات الشهر" value={money(data.stats.monthRevenue)} Icon={Wallet} />
            <Stat label="إيرادات السنة" value={money(data.stats.yearRevenue)} Icon={CreditCard} />
            <Stat label="تذاكر مفتوحة" value={data.stats.openTickets} Icon={LifeBuoy} tone="warning" />
            <Stat label="مكاتب نشطة" value={data.stats.organizations} Icon={Building2} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <SectionCard title="آخر عمليات التسجيل" description={`${data.stats.newUsers} مستخدم جديد هذا الشهر`}>
              {data.recentSignups.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">لا توجد تسجيلات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentSignups.map((u: { id: string; full_name: string; email: string | null; created_at: string }) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
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

            <SectionCard title="آخر عمليات الاشتراك">
              {data.recentSubs.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">لا توجد اشتراكات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentSubs.map((s: { id: string; email: string; plan_label: string; amount: number; currency: string }) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{s.plan_label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{s.email}</p>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                        {money(Number(s.amount), s.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard className="mt-4" title="حالة الخدمات">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["قاعدة البيانات", "تعمل"],
                ["المصادقة", "تعمل"],
                ["التخزين", "يعمل"],
                ["واجهة الخادم", "تعمل"],
              ].map(([label, state]) => (
                <li
                  key={label}
                  className="flex items-center justify-between rounded-[var(--radius-m)] border border-border px-3 py-2.5"
                >
                  <span className="text-[13px]">{label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                    {state}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </AdminShell>
  );
}