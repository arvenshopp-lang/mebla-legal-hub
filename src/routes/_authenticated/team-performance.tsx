import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, ChevronLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import {
  DataCard,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  Pagination,
  Btn,
  Badge,
  Th,
  Td,
} from "@/lib/list-utils";
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
import {
  getTeamPerformance,
  getPerformanceDrilldown,
  exportTeamPerformance,
} from "@/lib/kpi/kpi.functions";
import {
  DRILLDOWN_LABELS,
  DRILLDOWN_PAGE_SIZE,
  INSUFFICIENT_DATA_MESSAGE,
  partialHistoryMessage,
  type DrilldownKind,
  type MemberKpi,
  type PeriodPreset,
} from "@/lib/kpi/kpi.shared";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/_authenticated/team-performance")({
  component: Page,
  head: () => ({
    meta: [
      { title: "أداء الفريق | مِهلة" },
      {
        name: "description",
        content: "مؤشرات أداء أعضاء المكتب المبنية على المهل والمهام الفعلية داخل منصة مِهلة.",
      },
      NOINDEX_META,
      { property: "og:title", content: "أداء الفريق | مِهلة" },
      {
        property: "og:description",
        content: "مؤشرات أداء أعضاء المكتب المبنية على المهل والمهام الفعلية داخل منصة مِهلة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const todayIso = () => new Date().toISOString().slice(0, 10);

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [drilldown, setDrilldown] = useState<{ member: MemberKpi; kind: DrilldownKind } | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);

  const fetchPerformance = useServerFn(getTeamPerformance);
  const runExport = useServerFn(exportTeamPerformance);

  const canView = activeRole === "owner" || activeRole === "admin";
  const params = useMemo(
    () => ({ organizationId: activeOrgId ?? "", preset, from, to }),
    [activeOrgId, preset, from, to],
  );

  const query = useQuery({
    queryKey: ["team-performance", params],
    enabled: Boolean(activeOrgId) && canView,
    queryFn: () => fetchPerformance({ data: params }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const { csv, fileName } = await runExport({ data: params });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير تقرير الأداء.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تصدير التقرير. أعد المحاولة.");
    } finally {
      setExporting(false);
    }
  }

  if (!canView) {
    return (
      <DashboardShell title="أداء الفريق">
        <EmptyState
          title="هذه الصفحة لمالك المكتب ومدير المكتب"
          hint="لا تملك صلاحية الاطلاع على مؤشرات أداء الفريق."
        />
      </DashboardShell>
    );
  }

  const data = query.data;

  return (
    <DashboardShell
      title="أداء الفريق"
      description="مؤشرات محسوبة من المهل والمهام الفعلية بتوقيت الرياض — لا تقييم يدوي."
      actions={
        <Btn variant="secondary" onClick={handleExport} loading={exporting} disabled={!data}>
          <Download className="h-4 w-4" aria-hidden />
          تصدير CSV
        </Btn>
      }
    >
      <div className="space-y-5">
        <div className="surface-card p-4">
          <PeriodPicker
            preset={preset}
            from={from}
            to={to}
            disabled={query.isFetching}
            onChange={(next) => {
              setPreset(next.preset);
              setFrom(next.from);
              setTo(next.to);
            }}
          />
        </div>

        {query.isPending && <LoadingBlock rows={6} cols={5} />}
        {query.isError && (
          <ErrorBlock
            message={query.error instanceof Error ? query.error.message : "خطأ غير معروف."}
          />
        )}

        {data && (
          <>
            {data.partialHistory && (
              <NoticeBar>{partialHistoryMessage(data.trackingStartedAt)}</NoticeBar>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="متوسط أداء الفريق"
                value={
                  data.summary.averageScore === null ? "—" : data.summary.averageScore.toFixed(1)
                }
                hint={
                  data.summary.previousAverageScore === null
                    ? "لا مقارنة متاحة"
                    : `الفترة السابقة: ${data.summary.previousAverageScore.toFixed(1)}`
                }
              />
              <StatCard
                label="الالتزام بالمهل"
                value={
                  data.summary.deadlineCompliance === null
                    ? "—"
                    : `${data.summary.deadlineCompliance.toFixed(1)}%`
                }
                hint="مهل أُنجزت في موعدها"
              />
              <StatCard
                label="مهل فائتة"
                value={String(data.summary.overdueDeadlines)}
                tone={data.summary.overdueDeadlines > 0 ? "danger" : undefined}
                hint="على مستوى المكتب الآن"
              />
              <StatCard
                label="أعمال مفتوحة"
                value={String(data.summary.totalOpenWork)}
                hint={`${data.summary.overdueTasks} مهمة متأخرة`}
                tone={data.summary.overdueTasks > 0 ? "warning" : undefined}
              />
            </div>

            <TeamHighlights
              members={[...data.ranked, ...data.insufficient]}
              search={{ preset, from, to }}
            />

            {data.ranked.length === 0 ? (
              <div className="surface-card">
                <EmptyState
                  title="لا يوجد ترتيب موثوق لهذه الفترة"
                  hint={INSUFFICIENT_DATA_MESSAGE}
                />
              </div>
            ) : (
              <>
                {/* جدول للشاشات المتوسطة والكبيرة */}
                <div className="hidden md:block">
                  <DataCard>
                    <table className="w-full min-w-[820px] border-collapse">
                      <caption className="sr-only">ترتيب أعضاء المكتب حسب مؤشر الأداء</caption>
                      <thead>
                        <tr>
                          <Th className="w-16">الترتيب</Th>
                          <Th>العضو</Th>
                          <Th className="w-28">الدرجة</Th>
                          <Th className="w-32">التقييم</Th>
                          <Th className="w-28">التغيّر</Th>
                          <Th className="w-24">الأعمال</Th>
                          <Th className="w-32">متأخر</Th>
                          <Th className="w-24">
                            <span className="sr-only">إجراءات</span>
                          </Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.ranked.map((member) => (
                          <tr key={member.userId} className="transition hover:bg-surface-muted/40">
                            <Td className="font-bold tabular-nums text-muted-foreground">
                              {member.rank}
                            </Td>
                            <Td>
                              <span className="font-semibold text-foreground">
                                {member.fullName}
                              </span>
                              {member.jobTitle && (
                                <span className="block text-[11px] text-text-muted">
                                  {member.jobTitle}
                                </span>
                              )}
                              {member.isFormerMember && (
                                <span className="mt-1 inline-block">
                                  <Badge tone="muted">عضو سابق</Badge>
                                </span>
                              )}
                            </Td>
                            <Td>
                              <ScoreValue score={member.score} tone={member.band?.tone ?? null} />
                            </Td>
                            <Td>
                              {member.band && (
                                <BandBadge tone={member.band.tone} label={member.band.label} />
                              )}
                            </Td>
                            <Td>
                              <TrendChip points={member.trendPoints} />
                            </Td>
                            <Td className="tabular-nums">{member.sampleItems}</Td>
                            <Td className="tabular-nums">
                              {member.context.overdueDeadlines + member.context.overdueTasks}
                            </Td>
                            <Td>
                              <Link
                                to="/team-performance/$memberId"
                                params={{ memberId: member.userId }}
                                search={{ preset, from, to }}
                                className="inline-flex min-h-11 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                              >
                                التفاصيل
                                <ChevronLeft className="h-4 w-4" aria-hidden />
                              </Link>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataCard>
                </div>

                {/* بطاقات على الجوال */}
                <ul className="space-y-3 md:hidden">
                  {data.ranked.map((member) => (
                    <li key={member.userId} className="surface-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            <span className="me-1 text-muted-foreground">#{member.rank}</span>
                            {member.fullName}
                          </p>
                          {member.jobTitle && (
                            <p className="truncate text-[11px] text-text-muted">
                              {member.jobTitle}
                            </p>
                          )}
                        </div>
                        <div className="text-left">
                          <ScoreValue score={member.score} tone={member.band?.tone ?? null} />
                          <div className="mt-1">
                            <TrendChip points={member.trendPoints} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-3">
                        {member.dimensions.map((d) => (
                          <DimensionBar key={d.key} dimension={d} />
                        ))}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <StatCard
                          label={DRILLDOWN_LABELS.overdue_deadlines}
                          value={String(member.context.overdueDeadlines)}
                          onClick={() => setDrilldown({ member, kind: "overdue_deadlines" })}
                        />
                        <StatCard
                          label={DRILLDOWN_LABELS.overdue_tasks}
                          value={String(member.context.overdueTasks)}
                          onClick={() => setDrilldown({ member, kind: "overdue_tasks" })}
                        />
                      </div>
                      <Link
                        to="/team-performance/$memberId"
                        params={{ memberId: member.userId }}
                        search={{ preset, from, to }}
                        className="mt-3 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary"
                      >
                        عرض تفصيل الدرجة
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.insufficient.length > 0 && (
              <section className="surface-card p-4">
                <h2 className="text-[14px] font-bold text-foreground">أعضاء بلا ترتيب</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {INSUFFICIENT_DATA_MESSAGE}
                </p>
                <ul className="mt-3 divide-y divide-border">
                  {data.insufficient.map((member) => (
                    <li
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-foreground">
                          {member.fullName}
                          {member.isFormerMember && (
                            <span className="ms-2 align-middle">
                              <Badge tone="muted">عضو سابق</Badge>
                            </span>
                          )}
                        </p>
                        <p className="text-[11.5px] text-text-muted">
                          {member.sampleItems} عمل مؤهل — {member.trackedDays} يوم تتبع
                        </p>
                      </div>
                      <Link
                        to="/team-performance/$memberId"
                        params={{ memberId: member.userId }}
                        search={{ preset, from, to }}
                        className="inline-flex min-h-11 items-center text-[12.5px] font-semibold text-primary hover:underline"
                      >
                        التفاصيل
                      </Link>
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
        period={params}
        state={drilldown}
        onClose={() => setDrilldown(null)}
      />
    </DashboardShell>
  );
}

export function DrilldownDialog({
  organizationId,
  period,
  state,
  onClose,
}: {
  organizationId: string;
  period: { preset: PeriodPreset; from: string; to: string };
  state: { member: MemberKpi; kind: DrilldownKind } | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const fetchDrilldown = useServerFn(getPerformanceDrilldown);
  const query = useQuery({
    queryKey: [
      "performance-drilldown",
      organizationId,
      state?.member.userId,
      state?.kind,
      period,
      page,
    ],
    enabled: Boolean(state && organizationId),
    queryFn: () =>
      fetchDrilldown({
        data: {
          organizationId,
          memberId: state!.member.userId,
          kind: state!.kind,
          page,
          ...period,
        },
      }),
  });

  return (
    <Modal
      open={Boolean(state)}
      onClose={() => {
        setPage(0);
        onClose();
      }}
      title={state ? `${DRILLDOWN_LABELS[state.kind]} — ${state.member.fullName}` : ""}
      description="القائمة نفسها التي بُني عليها الرقم المعروض."
      size="lg"
    >
      {query.isPending && <LoadingBlock rows={4} cols={3} />}
      {query.isError && (
        <ErrorBlock
          message={query.error instanceof Error ? query.error.message : "خطأ غير معروف."}
        />
      )}
      {query.data && query.data.rows.length === 0 && (
        <EmptyState title="لا توجد عناصر" hint="لا يوجد ما يطابق هذا المؤشر في الفترة المحددة." />
      )}
      {query.data && query.data.rows.length > 0 && (
        <>
          <ul className="divide-y divide-border">
            {query.data.rows.map((row) => (
              <li key={`${row.itemType}-${row.itemId}`} className="py-3">
                <p className="text-[13.5px] font-semibold text-foreground">{row.title}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {row.caseTitle ? `${row.caseTitle} — ` : ""}
                  {row.dueDate ? `الاستحقاق: ${fmtDate(row.dueDate)}` : "بلا موعد استحقاق"}
                  {row.completedAt ? ` — أُنجز: ${fmtDate(row.completedAt)}` : ""}
                  {row.delayDays !== null ? ` — تأخير ${row.delayDays} يوم` : ""}
                </p>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            setPage={setPage}
            total={query.data.total}
            pageSize={DRILLDOWN_PAGE_SIZE}
          />
        </>
      )}
    </Modal>
  );
}
