import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell, StatCard } from "@/components/dashboard/shell";
import { OperationalScoreCard } from "@/components/dashboard/operational-score-card";
import { OperationalScorePrompt } from "@/components/dashboard/operational-score-prompt";
import { Badge, Btn, EmptyState, ErrorBlock, SectionCard, SectionLoader } from "@/lib/list-utils";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import {
  ChevronLeft,
  Briefcase,
  Gavel,
  Clock,
  FileSignature,
  Sparkles,
  ShieldCheck,
  Plus,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardHome,
  head: () => ({
    meta: [
      { title: "لوحة التحكم الرئيسية | مِهلة" },
      {
        name: "description",
        content: "لوحة متابعة قضايا المكتب وجلسات المحاكم والمهل النظامية والعقود ومطالبات الأتعاب.",
      },
      NOINDEX_META,
      { property: "og:title", content: "لوحة التحكم الرئيسية | مِهلة" },
      {
        property: "og:description",
        content: "أولويات اليوم في مكتبك: الجلسات القادمة، المهل القريبة، والعقود والمهام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const dateTime = (v: string) => fmtDateTime(v);
const dateOnly = (v: string) => fmtDate(v);

function DashboardHome() {
  const { activeOrgId, activeRole, memberships } = useAuth();
  const activeOrg = memberships.find((m) => m.organization_id === activeOrgId);

  const todayFormatted = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

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
    <DashboardShell title="الرئيسية" description="لوحة متابعة الأعمال اليومية">
      {error ? (
        <ErrorBlock message="حاول تحديث الصفحة." />
      ) : (
        <div className="space-y-6">
          <OperationalScorePrompt organizationId={activeOrgId ?? null} />

          {/* Hero Welcome Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-l from-slate-900 via-primary/95 to-slate-900 p-6 text-white shadow-lg">
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{activeOrg?.organization?.name || "منصة مِهلة للمحاماة"}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-slate-200">{todayFormatted}</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
                  مرحباً بك في مركز إدارة القضايا والمهام
                </h1>
                <p className="mt-1 max-w-2xl text-xs text-slate-200 leading-relaxed md:text-sm">
                  تابع جلسات اليوم، المهل القضائية، صياغة وتوقيع العقود، واستشر المحامية بيان في وقائع قضاياك.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/bayan"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 active:scale-95"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>المحامية بيان ✨</span>
                </Link>
                <Link
                  to="/cases"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>قضية جديدة</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Action Grid (شريط الإجراءات السريعة للمكتب) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Link
              to="/cases"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-sm transition hover:border-primary/50 hover:bg-muted/40 active:scale-95"
            >
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground">القضايا</span>
              <span className="text-[10px] text-muted-foreground">إضافة وملفات</span>
            </Link>

            <Link
              to="/hearings"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-sm transition hover:border-primary/50 hover:bg-muted/40 active:scale-95"
            >
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                <Gavel className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground">الجلسات</span>
              <span className="text-[10px] text-muted-foreground">جدولة ومتابعة</span>
            </Link>

            <Link
              to="/contracts"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-sm transition hover:border-primary/50 hover:bg-muted/40 active:scale-95"
            >
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                <FileSignature className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground">العقود الرقمية</span>
              <span className="text-[10px] text-muted-foreground">صياغة وتوقيع</span>
            </Link>

            <Link
              to="/deadlines"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-sm transition hover:border-primary/50 hover:bg-muted/40 active:scale-95"
            >
              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground">المهل النظامية</span>
              <span className="text-[10px] text-muted-foreground">حساب مواعيد</span>
            </Link>

            <Link
              to="/bayan"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-sm transition hover:border-primary/50 hover:bg-muted/40 active:scale-95"
            >
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground">المحامية بيان</span>
              <span className="text-[10px] text-muted-foreground">استشارة فورية</span>
            </Link>
          </div>

          {/* 4-Stat KPI Grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">القضايا المفتوحة</span>
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Briefcase className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-foreground">
                  {isLoading ? "—" : (stats?.openCases ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">قضية نشطة</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">جلسات اليوم</span>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                  <Gavel className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-foreground">
                  {isLoading ? "—" : (stats?.hearingsToday ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">جلسة اليوم</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">مهل خلال 7 أيام</span>
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-foreground">
                  {isLoading ? "—" : (stats?.deadlinesSoon ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">مهلة قادمة</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">المهام المتأخرة</span>
                <div className="rounded-lg bg-rose-500/10 p-2 text-rose-600">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-foreground">
                  {isLoading ? "—" : (stats?.overdueTasks ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">مهمة متأخرة</span>
              </div>
            </div>
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
        </div>
      )}
    </DashboardShell>
  );
}
