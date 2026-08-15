import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell, StatCard } from "@/components/dashboard/shell";
import { OperationalScoreCard } from "@/components/dashboard/operational-score-card";
import { OperationalScorePrompt } from "@/components/dashboard/operational-score-prompt";
import { Badge, Btn, EmptyState, ErrorBlock, SectionCard, SectionLoader } from "@/lib/list-utils";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { ChevronLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardHome,
  head: () => ({
    meta: [
      { title: "لوحة متابعة القضايا | مِهلة" },
      {
        name: "description",
        content: "لوحة متابعة يومية لقضايا المكتب وجلسات المحاكم والمهل النظامية والمهام المتأخرة.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "لوحة متابعة القضايا | مِهلة" },
      {
        property: "og:description",
        content: "أولويات اليوم في مكتبك: الجلسات القادمة، المهل القريبة، والمهام المتأخرة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const dateTime = (v: string) => fmtDateTime(v);
const dateOnly = (v: string) => fmtDate(v);

function DashboardHome() {
  const { activeOrgId } = useAuth();

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard-stats", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);

      const [
        openCases,
        hearingsToday,
        deadlinesSoon,
        overdueTasks,
        upcomingHearings,
        activeDeadlines,
        pendingTasks,
      ] = await Promise.all([
        supabase
          .from("cases")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrgId!)
          .in("status", ["open", "in_progress", "waiting"]),
        supabase
          .from("hearings")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrgId!)
          .eq("status", "scheduled")
          .gte("hearing_date", todayStart.toISOString())
          .lte("hearing_date", todayEnd.toISOString()),
        supabase
          .from("deadlines")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrgId!)
          .eq("status", "active")
          .lte("due_date", in7.toISOString()),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrgId!)
          .in("status", ["pending", "in_progress"])
          .lt("due_date", new Date().toISOString()),
        supabase
          .from("hearings")
          .select("id, title, hearing_date, court_name, case:cases(case_title, case_number)")
          .eq("organization_id", activeOrgId!)
          .eq("status", "scheduled")
          .gte("hearing_date", new Date().toISOString())
          .order("hearing_date")
          .limit(5),
        supabase
          .from("deadlines")
          .select("id, title, due_date, deadline_type, case:cases(case_title)")
          .eq("organization_id", activeOrgId!)
          .eq("status", "active")
          .order("due_date")
          .limit(5),
        supabase
          .from("tasks")
          .select("id, title, due_date, priority, status")
          .eq("organization_id", activeOrgId!)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { nullsFirst: false })
          .limit(5),
      ]);

      return {
        openCases: openCases.count ?? 0,
        hearingsToday: hearingsToday.count ?? 0,
        deadlinesSoon: deadlinesSoon.count ?? 0,
        overdueTasks: overdueTasks.count ?? 0,
        upcomingHearings: (upcomingHearings.data ?? []) as (Pick<
          Tables<"hearings">,
          "id" | "title" | "hearing_date" | "court_name"
        > & { case: { case_title: string; case_number: string } | null })[],
        activeDeadlines: (activeDeadlines.data ?? []) as (Pick<
          Tables<"deadlines">,
          "id" | "title" | "due_date" | "deadline_type"
        > & { case: { case_title: string } | null })[],
        pendingTasks: (pendingTasks.data ?? []) as Pick<
          Tables<"tasks">,
          "id" | "title" | "due_date" | "priority" | "status"
        >[],
      };
    },
  });

  return (
    <DashboardShell title="لوحة متابعة القضايا والجلسات" description="أولويات اليوم في مكتبك">
      {error ? (
        <ErrorBlock message="حاول تحديث الصفحة." />
      ) : (
        <>
          <OperationalScorePrompt organizationId={activeOrgId ?? null} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="قضايا مفتوحة" loading={isLoading} value={stats?.openCases ?? 0} />
            <StatCard
              label="جلسات اليوم"
              loading={isLoading}
              value={stats?.hearingsToday ?? 0}
              tone="gold"
            />
            <StatCard
              label="مهل خلال 7 أيام"
              loading={isLoading}
              value={stats?.deadlinesSoon ?? 0}
              tone="warn"
            />
            <StatCard
              label="مهام متأخرة"
              loading={isLoading}
              value={stats?.overdueTasks ?? 0}
              tone="danger"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <OperationalScoreCard organizationId={activeOrgId ?? null} />

            <SectionCard
              title="الجلسات القادمة"
              actions={
                <Link to="/hearings">
                  <Btn variant="ghost" size="sm" className="min-h-11">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <SectionLoader label="جاري تحميل البيانات…" />
              ) : stats!.upcomingHearings.length === 0 ? (
                <EmptyState
                  title="لا توجد جلسات قادمة"
                  hint="ستظهر هنا الجلسات المجدولة تلقائياً."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.upcomingHearings.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">
                          {h.case?.case_title ?? h.title}
                        </p>
                        <p className="text-caption truncate">{h.court_name ?? "—"}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {dateTime(h.hearing_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="المهل النشطة"
              actions={
                <Link to="/deadlines">
                  <Btn variant="ghost" size="sm" className="min-h-11">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <SectionLoader label="جاري تحميل البيانات…" />
              ) : stats!.activeDeadlines.length === 0 ? (
                <EmptyState title="لا توجد مهل نشطة" hint="أضف مهلة نظامية لمتابعة تواريخها." />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.activeDeadlines.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">{d.title}</p>
                        <p className="text-caption truncate">{d.case?.case_title ?? "—"}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {dateOnly(d.due_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              className="lg:col-span-2"
              title="مهام تحتاج إجراء"
              actions={
                <Link to="/tasks">
                  <Btn variant="ghost" size="sm" className="min-h-11">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <SectionLoader label="جاري تحميل البيانات…" />
              ) : stats!.pendingTasks.length === 0 ? (
                <EmptyState title="لا توجد مهام مفتوحة" hint="كل المهام مكتملة حالياً." />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.pendingTasks.map((t) => {
                    const overdue = t.due_date && new Date(t.due_date) < new Date();
                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <p className="min-w-0 truncate text-[14px] font-semibold">{t.title}</p>
                        <span className="flex shrink-0 items-center gap-2">
                          {overdue && <Badge tone="red">متأخرة</Badge>}
                          <span className="text-[12px] text-muted-foreground">
                            {t.due_date ? dateOnly(t.due_date) : "بدون تاريخ"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
