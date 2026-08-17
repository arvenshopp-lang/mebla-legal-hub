import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/shell";
import {
  DataCard,
  EmptyState,
  ErrorBlock,
  SectionCard,
  StatsSkeleton,
  Td,
  Th,
} from "@/lib/list-utils";
import { getRevenueSummary } from "@/lib/admin.functions";
import { Money } from "@/components/ui/money";

export const Route = createFileRoute("/mehla-admin/revenue")({
  head: () => ({
    meta: [
      { title: "الإيرادات والتقارير · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RevenuePage,
});

const money = (n: number) => <Money value={n} />;
const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
};

function RevenuePage() {
  const fn = useServerFn(getRevenueSummary);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => fn({ data: undefined }),
  });

  const peak = Math.max(1, ...(data?.by_month ?? []).map((m) => Number(m.amount)));

  return (
    <AdminShell title="الإيرادات والتقارير" description="إيرادات الاشتراكات المسجّلة على المنصة.">
      {isLoading ? (
        <StatsSkeleton count={5} />
      ) : isError || !data ? (
        <ErrorBlock message="تعذّر جلب التقارير المالية." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="إيراد اليوم" value={money(data.today)} />
            <Stat label="هذا الأسبوع" value={money(data.week)} />
            <Stat label="هذا الشهر" value={money(data.month)} />
            <Stat label="هذه السنة" value={money(data.year)} />
            <Stat
              label="اشتراكات نشطة"
              value={String(data.active_count)}
              hint={<>الإجمالي التراكمي {money(data.total)}</>}
            />
          </div>

          <SectionCard title="الإيراد الشهري" description="آخر ١٢ شهراً">
            {data.by_month.length === 0 ? (
              <EmptyState title="لا توجد إيرادات مسجّلة بعد" />
            ) : (
              <ul className="space-y-3">
                {data.by_month.map((m) => (
                  <li key={m.month}>
                    <div className="mb-1 flex items-center justify-between text-body-sm">
                      <span className="font-medium">{monthLabel(m.month)}</span>
                      <span className="text-muted-foreground">
                        {money(m.amount)} · {m.count} اشتراك
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-surface-muted"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500"
                        style={{ width: `${Math.max(2, (Number(m.amount) / peak) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="الإيراد حسب الباقة">
              {data.by_plan.length === 0 ? (
                <EmptyState title="لا توجد بيانات" />
              ) : (
                <DataCard>
                  <table className="w-full text-right">
                    <thead>
                      <tr>
                        <Th>الباقة</Th>
                        <Th>عدد الاشتراكات</Th>
                        <Th>الإيراد</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_plan.map((p) => (
                        <tr key={p.label} className="border-t border-border">
                          <Td>{p.label}</Td>
                          <Td>{p.count}</Td>
                          <Td>{money(p.amount)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataCard>
              )}
            </SectionCard>

            <SectionCard title="أعلى المكاتب إيراداً">
              {data.by_organization.length === 0 ? (
                <EmptyState title="لا توجد بيانات" />
              ) : (
                <DataCard>
                  <table className="w-full text-right">
                    <thead>
                      <tr>
                        <Th>المكتب</Th>
                        <Th>الاشتراكات</Th>
                        <Th>الإيراد</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_organization.map((o) => (
                        <tr key={o.label} className="border-t border-border">
                          <Td>{o.label}</Td>
                          <Td>{o.count}</Td>
                          <Td>{money(o.amount)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataCard>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="surface-card p-5">
      <p className="text-caption">{label}</p>
      <p className="mt-1.5 text-h3">{value}</p>
      {hint && <p className="text-caption mt-1">{hint}</p>}
    </div>
  );
}
