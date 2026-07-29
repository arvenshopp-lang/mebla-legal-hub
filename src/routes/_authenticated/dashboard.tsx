import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell, StatCard } from "@/components/dashboard/shell";
import { Badge, Btn, EmptyState, ErrorBlock, SectionCard } from "@/lib/list-utils";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardHome,
});

const dateTime = (v: string) =>
  new Date(v).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = (v: string) => new Date(v).toLocaleDateString("ar-SA", { dateStyle: "medium" });

function RowSkeleton() {
  return (
    <div className="space-y-3 py-2" role="status" aria-live="polite">
      <span className="sr-only">جاري التحميل…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface-muted" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

function DashboardHome() {
  const { activeOrgId } = useAuth();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);

      const [openCases, hearingsToday, deadlinesSoon, overdueTasks, upcomingHearings, activeDeadlines, pendingTasks] =
        await Promise.all([
          supabase.from("cases").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).in("status", ["open", "in_progress", "waiting"]),
          supabase.from("hearings").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).eq("status", "scheduled").gte("hearing_date", todayStart.toISOString()).lte("hearing_date", todayEnd.toISOString()),
          supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).eq("status", "active").lte("due_date", in7.toISOString()),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).in("status", ["pending", "in_progress"]).lt("due_date", new Date().toISOString()),
          supabase.from("hearings").select("id, title, hearing_date, court_name, case:cases(case_title, case_number)").eq("organization_id", activeOrgId!).eq("status", "scheduled").gte("hearing_date", new Date().toISOString()).order("hearing_date").limit(5),
          supabase.from("deadlines").select("id, title, due_date, deadline_type, case:cases(case_title)").eq("organization_id", activeOrgId!).eq("status", "active").order("due_date").limit(5),
          supabase.from("tasks").select("id, title, due_date, priority, status").eq("organization_id", activeOrgId!).in("status", ["pending", "in_progress"]).order("due_date", { nullsFirst: false }).limit(5),
        ]);

      return {
        openCases: openCases.count ?? 0,
        hearingsToday: hearingsToday.count ?? 0,
        deadlinesSoon: deadlinesSoon.count ?? 0,
        overdueTasks: overdueTasks.count ?? 0,
        upcomingHearings: (upcomingHearings.data ?? []) as any[],
        activeDeadlines: (activeDeadlines.data ?? []) as any[],
        pendingTasks: (pendingTasks.data ?? []) as any[],
      };
    },
  });

  return (
    <DashboardShell title="نظرة عامة" description="أولويات اليوم في مكتبك">
      {error ? (
        <ErrorBlock message="حاول تحديث الصفحة." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="قضايا مفتوحة" value={isLoading ? "…" : stats!.openCases} />
            <StatCard label="جلسات اليوم" value={isLoading ? "…" : stats!.hearingsToday} tone="gold" />
            <StatCard label="مهل خلال 7 أيام" value={isLoading ? "…" : stats!.deadlinesSoon} tone="warn" />
            <StatCard label="مهام متأخرة" value={isLoading ? "…" : stats!.overdueTasks} tone="danger" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="الجلسات القادمة"
              actions={
                <Link to="/hearings">
                  <Btn variant="ghost" size="sm">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <RowSkeleton />
              ) : stats!.upcomingHearings.length === 0 ? (
                <EmptyState title="لا توجد جلسات قادمة" hint="ستظهر هنا الجلسات المجدولة تلقائياً." />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.upcomingHearings.map((h) => (
                    <li key={h.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">{h.case?.case_title ?? h.title}</p>
                        <p className="text-caption truncate">{h.court_name ?? "—"}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{dateTime(h.hearing_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="المهل النشطة"
              actions={
                <Link to="/deadlines">
                  <Btn variant="ghost" size="sm">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <RowSkeleton />
              ) : stats!.activeDeadlines.length === 0 ? (
                <EmptyState title="لا توجد مهل نشطة" hint="أضف مهلة نظامية لمتابعة تواريخها." />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.activeDeadlines.map((d) => (
                    <li key={d.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">{d.title}</p>
                        <p className="text-caption truncate">{d.case?.case_title ?? "—"}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{dateOnly(d.due_date)}</span>
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
                  <Btn variant="ghost" size="sm">
                    عرض الكل <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                </Link>
              }
            >
              {isLoading ? (
                <RowSkeleton />
              ) : stats!.pendingTasks.length === 0 ? (
                <EmptyState title="لا توجد مهام مفتوحة" hint="كل المهام مكتملة حالياً." />
              ) : (
                <ul className="divide-y divide-border">
                  {stats!.pendingTasks.map((t) => {
                    const overdue = t.due_date && new Date(t.due_date) < new Date();
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
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
