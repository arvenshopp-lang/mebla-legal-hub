import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell, StatCard } from "@/components/dashboard/shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardHome,
});

function DashboardHome() {
  const { activeOrgId } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);

      const [openCases, hearingsToday, deadlinesSoon, overdueTasks, upcomingHearings, activeDeadlines] =
        await Promise.all([
          supabase.from("cases").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).in("status", ["open", "in_progress", "waiting"]),
          supabase.from("hearings").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).eq("status", "scheduled").gte("hearing_date", todayStart.toISOString()).lte("hearing_date", todayEnd.toISOString()),
          supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).eq("status", "active").lte("due_date", in7.toISOString()),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", activeOrgId!).in("status", ["pending", "in_progress"]).lt("due_date", new Date().toISOString()),
          supabase.from("hearings").select("id, title, hearing_date, court_name, case:cases(case_title, case_number)").eq("organization_id", activeOrgId!).eq("status", "scheduled").gte("hearing_date", new Date().toISOString()).order("hearing_date").limit(5),
          supabase.from("deadlines").select("id, title, due_date, deadline_type, case:cases(case_title)").eq("organization_id", activeOrgId!).eq("status", "active").order("due_date").limit(5),
        ]);

      return {
        openCases: openCases.count ?? 0,
        hearingsToday: hearingsToday.count ?? 0,
        deadlinesSoon: deadlinesSoon.count ?? 0,
        overdueTasks: overdueTasks.count ?? 0,
        upcomingHearings: (upcomingHearings.data ?? []) as any[],
        activeDeadlines: (activeDeadlines.data ?? []) as any[],
      };
    },
  });

  return (
    <DashboardShell title="نظرة عامة">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="قضايا مفتوحة" value={stats?.openCases ?? "…"} />
        <StatCard label="جلسات اليوم" value={stats?.hearingsToday ?? "…"} tone="gold" />
        <StatCard label="مهل خلال 7 أيام" value={stats?.deadlinesSoon ?? "…"} tone="warn" />
        <StatCard label="مهام متأخرة" value={stats?.overdueTasks ?? "…"} tone="danger" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#123C32]/10 bg-white p-6">
          <h2 className="mb-4 text-base font-bold">الجلسات القادمة</h2>
          <div className="divide-y divide-[#123C32]/10">
            {(stats?.upcomingHearings ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-[#123C32]/50">لا توجد جلسات قادمة</p>
            )}
            {stats?.upcomingHearings?.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{h.case?.case_title ?? h.title}</div>
                  <div className="text-xs text-[#123C32]/60">{h.court_name ?? "—"}</div>
                </div>
                <div className="text-xs text-[#123C32]/70">
                  {new Date(h.hearing_date).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#123C32]/10 bg-white p-6">
          <h2 className="mb-4 text-base font-bold">المهل النشطة</h2>
          <div className="divide-y divide-[#123C32]/10">
            {(stats?.activeDeadlines ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-[#123C32]/50">لا توجد مهل نشطة</p>
            )}
            {stats?.activeDeadlines?.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{d.title}</div>
                  <div className="text-xs text-[#123C32]/60">{d.case?.case_title ?? "—"}</div>
                </div>
                <div className="text-xs text-[#123C32]/70">
                  {new Date(d.due_date).toLocaleDateString("ar-SA", { dateStyle: "medium" })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}