import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ChevronRight } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import { Badge, DataCard, EmptyState, ErrorBlock, LoadingBlock, Td, Th } from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import {
  BandBadge,
  DimensionBar,
  NoticeBar,
  PeriodPicker,
  ScoreValue,
  StatCard,
  TrendChip,
} from "@/components/team/performance/kpi-ui";
import { DrilldownDialog } from "./team-performance";
import { getMemberPerformance } from "@/lib/kpi/kpi.functions";
import {
  DRILLDOWN_LABELS,
  INSUFFICIENT_DATA_MESSAGE,
  KPI_DIMENSION_LABELS,
  PERIOD_LABELS,
  type DrilldownKind,
  type KpiDimensionKey,
  type MemberKpi,
  type PeriodPreset,
} from "@/lib/kpi/kpi.shared";

type PerformanceSearch = { preset: PeriodPreset; from?: string; to?: string };

const searchSchema = z.object({
  preset: z
    .enum(["this_month", "last_month", "last_3_months", "last_6_months", "this_year", "custom"])
    .default("this_month"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/_authenticated/team-performance/$memberId")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): PerformanceSearch =>
    searchSchema.parse(search) as PerformanceSearch,
  head: () => ({
    meta: [
      { title: "تفصيل أداء العضو | مِهلة" },
      {
        name: "description",
        content: "شرح تفصيلي لدرجة أداء عضو المكتب بالأرقام الفعلية للمهل والمهام.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "تفصيل أداء العضو | مِهلة" },
      {
        property: "og:description",
        content: "شرح تفصيلي لدرجة أداء عضو المكتب بالأرقام الفعلية للمهل والمهام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATE_LABELS: Record<string, { label: string; tone: "green" | "red" | "warn" | "muted" }> = {
  completed_on_time: { label: "أُنجز في الموعد", tone: "green" },
  completed_late: { label: "أُنجز متأخراً", tone: "red" },
  overdue: { label: "متأخر", tone: "red" },
  open: { label: "مفتوح", tone: "muted" },
  cancelled: { label: "ملغى", tone: "warn" },
  deleted: { label: "محذوف", tone: "warn" },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function Page() {
  const { memberId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { activeOrgId, activeRole } = useAuth();
  const [drilldown, setDrilldown] = useState<{ member: MemberKpi; kind: DrilldownKind } | null>(null);

  const preset = search.preset;
  const from = search.from ?? todayIso();
  const to = search.to ?? todayIso();

  const fetchDetail = useServerFn(getMemberPerformance);
  const canView = activeRole === "owner" || activeRole === "admin";
  const params = useMemo(
    () => ({ organizationId: activeOrgId ?? "", memberId, preset, from, to }),
    [activeOrgId, memberId, preset, from, to],
  );

  const query = useQuery({
    queryKey: ["member-performance", params],
    enabled: Boolean(activeOrgId) && canView,
    queryFn: () => fetchDetail({ data: params }),
  });

  if (!canView) {
    return (
      <DashboardShell title="تفصيل أداء العضو">
        <EmptyState
          title="هذه الصفحة لمالك المكتب ومدير المكتب"
          hint="لا تملك صلاحية الاطلاع على مؤشرات أداء الفريق."
        />
      </DashboardShell>
    );
  }

  const data = query.data;
  const member = data?.member;

  return (
    <DashboardShell
      title={member ? member.fullName : "تفصيل أداء العضو"}
      description={`شرح الدرجة بالأرقام الفعلية — ${PERIOD_LABELS[preset]}`}
      actions={
        <Link
          to="/team-performance"
          className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
          رجوع لأداء الفريق
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="surface-card p-4">
          <PeriodPicker
            preset={preset}
            from={from}
            to={to}
            disabled={query.isFetching}
            onChange={(next) =>
              navigate({
                search: {
                  preset: next.preset as PeriodPreset,
                  ...(next.preset === "custom" ? { from: next.from, to: next.to } : {}),
                },
              })
            }
          />
        </div>

        {query.isPending && <LoadingBlock rows={6} cols={4} />}
        {query.isError && (
          <ErrorBlock message={query.error instanceof Error ? query.error.message : "خطأ غير معروف."} />
        )}

        {data && member && (
          <>
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <ScoreValue score={member.score} tone={member.band?.tone ?? null} size="lg" />
                    {member.band && <BandBadge tone={member.band.tone} label={member.band.label} />}
                    {member.isFormerMember && <Badge tone="muted">عضو سابق</Badge>}
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {member.jobTitle ? `${member.jobTitle} — ` : ""}
                    {member.sampleItems} عمل مؤهل — {member.trackedDays} يوم تتبع
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11.5px] text-muted-foreground">مقارنة بالفترة السابقة</p>
                  <TrendChip points={member.trendPoints} />
                </div>
              </div>
              {!member.eligible && (
                <div className="mt-4">
                  <NoticeBar>{INSUFFICIENT_DATA_MESSAGE}</NoticeBar>
                </div>
              )}
            </section>

            <section className="surface-card space-y-4 p-5">
              <h2 className="text-[14px] font-bold text-foreground">كيف تُحسب الدرجة</h2>
              {member.dimensions.map((d) => (
                <DimensionBar key={d.key} dimension={d} />
              ))}
              <table className="w-full border-collapse text-[12.5px]">
                <caption className="sr-only">مساهمة كل بُعد في الدرجة النهائية</caption>
                <thead>
                  <tr>
                    <Th>البُعد</Th>
                    <Th className="w-20">الوزن</Th>
                    <Th className="w-28">النسبة</Th>
                    <Th className="w-28">المساهمة</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.breakdown.map((row) => (
                    <tr key={row.key}>
                      <Td>{row.label}</Td>
                      <Td className="tabular-nums">{Math.round(row.weight * 100)}%</Td>
                      <Td className="tabular-nums">
                        {row.value === null
                          ? "غير قابل للتطبيق"
                          : `${(Math.round(row.value * 10) / 10).toFixed(1)}% (${row.numerator}/${row.denominator})`}
                      </Td>
                      <Td className="tabular-nums">
                        {row.contribution === null ? "—" : row.contribution.toFixed(1)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11.5px] text-text-muted">
                الأبعاد غير القابلة للتطبيق تُستبعد من الحساب ولا تُعتبر صفراً، ويُعاد توزيع أوزانها على
                الأبعاد المتاحة.
              </p>
            </section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={DRILLDOWN_LABELS.overdue_deadlines}
                value={String(member.context.overdueDeadlines)}
                tone={member.context.overdueDeadlines > 0 ? "danger" : undefined}
                onClick={() => setDrilldown({ member, kind: "overdue_deadlines" })}
              />
              <StatCard
                label={DRILLDOWN_LABELS.overdue_tasks}
                value={String(member.context.overdueTasks)}
                tone={member.context.overdueTasks > 0 ? "warning" : undefined}
                onClick={() => setDrilldown({ member, kind: "overdue_tasks" })}
              />
              <StatCard
                label={DRILLDOWN_LABELS.completed_late}
                value={String(member.context.completedLate)}
                hint={
                  member.context.averageDelayDays === null
                    ? undefined
                    : `متوسط التأخير ${member.context.averageDelayDays} يوم`
                }
                onClick={() => setDrilldown({ member, kind: "completed_late" })}
              />
              <StatCard
                label={DRILLDOWN_LABELS.upcoming_deadlines}
                value={String(member.context.upcomingDeadlines)}
                onClick={() => setDrilldown({ member, kind: "upcoming_deadlines" })}
              />
              <StatCard
                label={DRILLDOWN_LABELS.open_tasks}
                value={String(member.context.totalOpenWork)}
                onClick={() => setDrilldown({ member, kind: "open_tasks" })}
              />
              <StatCard
                label={DRILLDOWN_LABELS.active_cases}
                value={String(member.context.activeCases)}
                onClick={() => setDrilldown({ member, kind: "active_cases" })}
              />
              <StatCard label="أُنجز في الفترة" value={String(member.context.completed)} />
              <StatCard
                label="أعمال أُعيد إسنادها"
                value={String(member.context.reassignedItems)}
                hint="لا تُحمّل تأخيراً سابقاً للإسناد"
              />
            </div>

            <section>
              <h2 className="mb-2 text-[14px] font-bold text-foreground">
                الأعمال التي بُنيت عليها الدرجة
              </h2>
              {data.items.length === 0 ? (
                <div className="surface-card">
                  <EmptyState
                    title="لا توجد أعمال محتسبة"
                    hint="لم يستحق أي عمل مؤهل داخل هذه الفترة."
                  />
                </div>
              ) : (
                <DataCard>
                  <table className="w-full min-w-[760px] border-collapse">
                    <caption className="sr-only">قائمة الأعمال المحتسبة في الدرجة</caption>
                    <thead>
                      <tr>
                        <Th>العمل</Th>
                        <Th className="w-32">النوع</Th>
                        <Th className="w-36">البُعد</Th>
                        <Th className="w-32">الاستحقاق</Th>
                        <Th className="w-32">الإنجاز</Th>
                        <Th className="w-32">النتيجة</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.items.map((item) => {
                        const state = STATE_LABELS[item.state] ?? { label: item.state, tone: "muted" as const };
                        return (
                          <tr key={`${item.dimension}-${item.itemId}`}>
                            <Td>
                              <span className="font-medium text-foreground">{item.title}</span>
                              {item.caseTitle && (
                                <span className="block text-[11px] text-text-muted">{item.caseTitle}</span>
                              )}
                              {item.dueExtended && (
                                <span className="mt-1 inline-block">
                                  <Badge tone="info">مُدد الموعد</Badge>
                                </span>
                              )}
                            </Td>
                            <Td>{item.itemType === "task" ? "مهمة" : "مهلة"}</Td>
                            <Td className="text-[11.5px] text-muted-foreground">
                              {KPI_DIMENSION_LABELS[item.dimension as KpiDimensionKey] ?? item.dimension}
                            </Td>
                            <Td>{item.dueDate ? fmtDate(item.dueDate) : "—"}</Td>
                            <Td>{item.completedAt ? fmtDate(item.completedAt) : "—"}</Td>
                            <Td>
                              <Badge tone={state.tone}>{state.label}</Badge>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DataCard>
              )}
            </section>

            {data.excluded.length > 0 && (
              <section className="surface-card p-5">
                <h2 className="text-[14px] font-bold text-foreground">أعمال مستبعدة من الدرجة</h2>
                <ul className="mt-3 divide-y divide-border">
                  {data.excluded.map((item) => (
                    <li key={`${item.itemType}-${item.itemId}`} className="py-2.5">
                      <p className="text-[13px] font-medium text-foreground">{item.title}</p>
                      <p className="text-[11.5px] text-muted-foreground">{item.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <DrilldownDialog
        organizationId={activeOrgId ?? ""}
        period={{ preset, from, to }}
        state={drilldown}
        onClose={() => setDrilldown(null)}
      />
    </DashboardShell>
  );
}