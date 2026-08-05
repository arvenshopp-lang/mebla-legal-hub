import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FileText, TrendingUp, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  SectionCard,
  StatsSkeleton,
  Td,
  Th,
} from "@/lib/list-utils";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { getGrowthSeries } from "@/lib/admin-console.functions";
import { fmtBytes, fmtMoney, fmtNumber, type GrowthPoint } from "@/lib/admin-console.shared";

export const Route = createFileRoute("/mehla-admin/analytics")({
  head: () => ({
    meta: [
      { title: "التحليلات والنمو · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [
  { days: 7, label: "٧ أيام" },
  { days: 30, label: "٣٠ يوماً" },
  { days: 90, label: "٩٠ يوماً" },
] as const;

type MetricKey = "active_users" | "organizations" | "users" | "cases" | "documents" | "emails" | "tickets" | "revenue";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "active_users", label: "المستخدمون النشطون" },
  { key: "organizations", label: "المكاتب الجديدة" },
  { key: "users", label: "المستخدمون الجدد" },
  { key: "cases", label: "القضايا" },
  { key: "documents", label: "المستندات" },
  { key: "emails", label: "الرسائل" },
  { key: "tickets", label: "تذاكر الدعم" },
  { key: "revenue", label: "الإيرادات" },
];

function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<MetricKey>("active_users");
  const fn = useServerFn(getGrowthSeries);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-growth", days],
    queryFn: () => fn({ data: { days } }),
  });

  const series = data?.series ?? [];
  const totals = useMemo(() => {
    const sum = (k: MetricKey) => series.reduce((acc: number, p: GrowthPoint) => acc + Number(p[k] ?? 0), 0);
    return {
      organizations: sum("organizations"),
      users: sum("users"),
      cases: sum("cases"),
      documents: sum("documents"),
      revenue: sum("revenue"),
      peakActive: series.reduce((m: number, p: GrowthPoint) => Math.max(m, Number(p.active_users ?? 0)), 0),
    };
  }, [series]);

  const max = Math.max(1, ...series.map((p: GrowthPoint) => Number(p[metric] ?? 0)));

  return (
    <AdminShell
      title="التحليلات والنمو"
      description="سلاسل زمنية فعلية للنشاط والنمو والإيرادات وأكثر المكاتب استخداماً."
      actions={
        <Btn variant="outline" size="sm" loading={isFetching} onClick={() => refetch()}>
          تحديث
        </Btn>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Btn
            key={r.days}
            size="sm"
            variant={days === r.days ? "primary" : "outline"}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </Btn>
        ))}
      </div>

      {isLoading ? (
        <StatsSkeleton count={4} />
      ) : isError || !data ? (
        <ErrorBlock message="تعذّر قراءة بيانات النمو." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile Icon={Building2} label="مكاتب جديدة" value={fmtNumber(totals.organizations)} />
            <Tile Icon={Users} label="مستخدمون جدد" value={fmtNumber(totals.users)} hint={`أعلى نشاط يومي: ${fmtNumber(totals.peakActive)}`} />
            <Tile Icon={FileText} label="قضايا ومستندات" value={`${fmtNumber(totals.cases)} / ${fmtNumber(totals.documents)}`} />
            <Tile Icon={TrendingUp} label="إيرادات الفترة" value={fmtMoney(totals.revenue)} />
          </div>

          <SectionCard
            title="منحنى النمو"
            description="اختر المؤشر لعرض توزيعه اليومي خلال الفترة المحددة."
            actions={
              <label className="flex items-center gap-2 text-[13px]">
                <span className="text-muted-foreground">المؤشر</span>
                <select
                  className="rounded-[var(--radius-s)] border border-border bg-surface px-2 py-1.5 text-[13px]"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as MetricKey)}
                  aria-label="اختيار المؤشر"
                >
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            {series.length === 0 ? (
              <EmptyState title="لا توجد بيانات" hint="لم تُسجّل حركة في هذه الفترة." />
            ) : (
              <div
                className="flex h-52 items-end gap-1 overflow-x-auto pb-2"
                role="img"
                aria-label={`منحنى ${METRICS.find((m) => m.key === metric)?.label} خلال ${days} يوماً`}
              >
                {series.map((p: GrowthPoint) => {
                  const value = Number(p[metric] ?? 0);
                  return (
                    <div key={p.day} className="flex min-w-[10px] flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{value > 0 ? fmtNumber(value) : ""}</span>
                      <div
                        className="w-full rounded-t-[3px] bg-primary/80 transition-[height] motion-reduce:transition-none"
                        style={{ height: `${Math.max(2, (value / max) * 150)}px` }}
                        title={`${fmtDate(p.day)} · ${metric === "revenue" ? fmtMoney(value) : fmtNumber(value)}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="أكثر المكاتب نشاطاً">
              {data.top_organizations.length === 0 ? (
                <EmptyState title="لا توجد حركة" hint="لم تُسجّل أحداث في هذه الفترة." />
              ) : (
                <DataCard>
                  <table className="w-full text-right">
                    <thead>
                      <tr>
                        <Th>المكتب</Th>
                        <Th>الأحداث</Th>
                        <Th className="hidden sm:table-cell">القضايا</Th>
                        <Th className="hidden md:table-cell">التخزين</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_organizations.map((o) => (
                        <tr key={o.organization_id}>
                          <Td>
                            <span className="font-semibold">{o.name}</span>
                            <span className="text-caption block">{fmtNumber(o.users)} مستخدماً</span>
                          </Td>
                          <Td>{fmtNumber(o.events)}</Td>
                          <Td className="hidden sm:table-cell">{fmtNumber(o.cases)}</Td>
                          <Td className="hidden md:table-cell">{fmtBytes(o.storage_bytes)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataCard>
              )}
            </SectionCard>

            <SectionCard title="استهلاك الخدمات المدفوعة" description="عدّادات الاستخدام المسجّلة على مستوى المنصة.">
              {data.ai_usage.length === 0 ? (
                <EmptyState title="لا يوجد استهلاك" hint="لم تُسجّل عدّادات استخدام بعد." />
              ) : (
                <ul className="divide-y divide-border">
                  {data.ai_usage.map((u) => (
                    <li key={u.metric} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <span className="text-body-sm font-medium">{u.metric}</span>
                      <Badge tone="info">{fmtNumber(u.total)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-caption mt-4">وقت القراءة: {fmtDateTime(data.generated_at)}</p>
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Tile({ Icon, label, value, hint }: { Icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-5">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-caption">{label}</p>
      <p className="text-h5 mt-0.5">{value}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </div>
  );
}
