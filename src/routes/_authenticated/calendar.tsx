/**
 * صفحة التقويم الموحد والمزامنة الثنائية للجلسات والمهل القضائية
 * Unified Calendar Hub & 2-Way Sync
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Gavel,
  AlertCircle,
  Video,
  MapPin,
  Building2,
  User,
  Plus,
  CalendarCheck2,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  getCalendarSettingsFn,
  rotateCalendarTokenFn,
  getCalendarEventsListFn,
  triggerManualSyncFn,
} from "@/lib/calendar/calendar.functions";
import type { CalendarEventModel, CalendarSyncSettings } from "@/lib/calendar/calendar.shared";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
  head: () => ({
    meta: [
      { title: "التقويم الموحد والمزامنة | مِهلة" },
      {
        name: "description",
        content: "مزامنة الجلسات القضائية والمهل الإجرائية ثنائياً مع Google Calendar و Microsoft Outlook و Apple Calendar.",
      },
    ],
  }),
});

function CalendarPage() {
  const queryClient = useQueryClient();
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeView, setActiveView] = React.useState<"agenda" | "grid">("agenda");

  // Fetch Settings & Events
  const { data: settingsData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ["calendar-settings"],
    queryFn: () => getCalendarSettingsFn({ data: {} }),
  });

  const { data: eventsData, isLoading: isEventsLoading } = useQuery({
    queryKey: ["calendar-events-list"],
    queryFn: () => getCalendarEventsListFn({ data: {} }),
  });

  const settings = settingsData?.settings;
  const events = eventsData?.events || [];

  // Mutations
  const rotateTokenMutation = useMutation({
    mutationFn: () => rotateCalendarTokenFn({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-settings"] });
      toast.success("تم تدوير وتحديث رمز تغذية التقويم بنجاح.");
    },
    onError: () => {
      toast.error("تعذر تحديث الرمز. يرجى المحاولة مرة أخرى.");
    },
  });

  const manualSyncMutation = useMutation({
    mutationFn: (provider: "google" | "outlook") => triggerManualSyncFn({ data: { provider } }),
    onSuccess: (data, provider) => {
      toast.success(`تمت المزامنة بنجاح مع ${provider === "google" ? "Google Calendar" : "Microsoft Outlook"}`);
    },
    onError: () => {
      toast.error("تعذرت المزامنة الفورية.");
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    toast.success("تم نسخ رابط الاشتراك في التقويم بنجاح!");
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    const matchesCategory =
      selectedCategory === "all" ||
      (selectedCategory === "hearings" && ev.category === "hearing") ||
      (selectedCategory === "deadlines" && ev.category === "deadline");

    const matchesSearch =
      !searchQuery ||
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.caseNumber && ev.caseNumber.includes(searchQuery)) ||
      (ev.caseTitle && ev.caseTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ev.courtName && ev.courtName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const totalHearings = events.filter((e) => e.category === "hearing").length;
  const totalDeadlines = events.filter((e) => e.category === "deadline").length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-primary/95 to-slate-900 p-6 text-white shadow-xl">
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>المزامنة الثنائية الفورية للتقويم القضائي</span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
                التقويم الموحد للجلسات والمهل الإجرائية
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-200">
                مزامنة حية وتلقائية مع Google Calendar، Microsoft Outlook، وتقويم Apple على الآيفون والماك لضمان عدم تفويت أي جلسة أو مهلة نظامية.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-amber-400 hover:shadow-amber-500/25 active:scale-95"
              >
                <Share2 className="h-4 w-4" />
                <span>ربط وتقويم المزامنة (ICS / Live Feed)</span>
              </button>

              <Link
                to="/hearings"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>إضافة جلسة</span>
              </Link>
            </div>
          </div>
        </div>

        {/* KPIs Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">الجلسات القضائية المجدولة</span>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Gavel className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">{totalHearings}</span>
              <span className="text-xs text-muted-foreground">جلسة نشطة</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">المهل والمهام المستعجلة</span>
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">{totalDeadlines}</span>
              <span className="text-xs text-muted-foreground">مهلة قادمة</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">تقويم Google Calendar</span>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                جاهز للمزامنة
              </span>
              <button
                onClick={() => manualSyncMutation.mutate("google")}
                disabled={manualSyncMutation.isPending}
                className="text-xs font-semibold text-primary hover:underline"
              >
                مزامنة الآن
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">تقويم Microsoft Outlook</span>
              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                جاهز للمزامنة
              </span>
              <button
                onClick={() => manualSyncMutation.mutate("outlook")}
                disabled={manualSyncMutation.isPending}
                className="text-xs font-semibold text-primary hover:underline"
              >
                مزامنة الآن
              </button>
            </div>
          </div>
        </div>

        {/* Action & Filter Toolbar */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <input
              type="text"
              placeholder="ابحث باسم الجلسة، رقم القضية، المحكمة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  selectedCategory === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                الكل ({events.length})
              </button>
              <button
                onClick={() => setSelectedCategory("hearings")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  selectedCategory === "hearings" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                الجلسات ({totalHearings})
              </button>
              <button
                onClick={() => setSelectedCategory("deadlines")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  selectedCategory === "deadlines" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                المهل ({totalDeadlines})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["calendar-events-list"] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Events Agenda List */}
        {isEventsLoading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">جارٍ جلب الجلسات والمهل القضائية المجدولة...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-base font-semibold text-foreground">لا توجد جلسات أو مهل مطابقة</h3>
            <p className="mt-1 text-sm text-muted-foreground">لم يتم العثور على أحداث مجدولة ضمن المعايير المحددة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((ev) => {
              const startDate = new Date(ev.startDate);
              const dateFormatted = startDate.toLocaleDateString("ar-SA", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const timeFormatted = startDate.toLocaleTimeString("ar-SA", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const isHearing = ev.category === "hearing";

              return (
                <div
                  key={ev.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md"
                >
                  <div className="space-y-3">
                    {/* Top Row Badges */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isHearing
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isHearing ? <Gavel className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        <span>{isHearing ? "جلسة قضائية" : "مهلة إجرائية"}</span>
                      </span>

                      <span className="text-xs font-medium text-muted-foreground">{timeFormatted}</span>
                    </div>

                    {/* Event Title */}
                    <h3 className="font-bold text-foreground group-hover:text-primary transition">
                      {ev.title}
                    </h3>

                    {/* Date & Time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                      <span>{dateFormatted}</span>
                    </div>

                    {/* Case Info */}
                    {ev.caseNumber && (
                      <div className="rounded-lg bg-muted/60 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">قضية #{ev.caseNumber}</span>
                          {ev.clientName && (
                            <span className="text-muted-foreground">الموكل: {ev.clientName}</span>
                          )}
                        </div>
                        {ev.caseTitle && (
                          <p className="line-clamp-1 text-muted-foreground">{ev.caseTitle}</p>
                        )}
                      </div>
                    )}

                    {/* Court & Circuit */}
                    {(ev.courtName || ev.judicialCircuit) && (
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {ev.courtName && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{ev.courtName}</span>
                          </div>
                        )}
                        {ev.judicialCircuit && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span>الدائرة: {ev.judicialCircuit}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remote Hearing Link */}
                    {ev.remoteLink && (
                      <a
                        href={ev.remoteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-1.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/20"
                      >
                        <Video className="h-3.5 w-3.5" />
                        <span>انضمام للجلسة عن بُعد (ناجز / مايكروسوفت تيمز)</span>
                      </a>
                    )}
                  </div>

                  {/* Bottom Action Link */}
                  {ev.caseId && (
                    <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-end">
                      <Link
                        to={`/cases`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <span>تفاصيل القضية</span>
                        <ChevronLeft className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Live Calendar Subscription Modal */}
        {isSyncModalOpen && settings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <CalendarCheck2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">ربط ومزامنة التقويم الموحد (Live Sync)</h2>
                    <p className="text-xs text-muted-foreground">
                      اشترك في تقويم الجلسات والمهل ليظهر تلقائياً على هاتفك وجهازك
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {/* 1-Click Fast Connect Buttons */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-foreground">
                  ⚡ الاشتراك السريع بنقرة واحدة (1-Click Native Subscription)
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Apple Calendar */}
                  <a
                    href={settings.webcalFeedUrl}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-center transition hover:border-primary hover:bg-muted/80"
                  >
                    <Smartphone className="h-6 w-6 text-foreground" />
                    <span className="text-xs font-bold text-foreground">Apple Calendar</span>
                    <span className="text-[10px] text-muted-foreground">iPhone / iPad / Mac</span>
                  </a>

                  {/* Google Calendar */}
                  <a
                    href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(settings.webcalFeedUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-center transition hover:border-primary hover:bg-muted/80"
                  >
                    <CalendarIcon className="h-6 w-6 text-blue-600" />
                    <span className="text-xs font-bold text-foreground">Google Calendar</span>
                    <span className="text-[10px] text-muted-foreground">أندرويد والويب</span>
                  </a>

                  {/* Microsoft Outlook */}
                  <a
                    href={`https://outlook.live.com/calendar/0/addcalendar`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-center transition hover:border-primary hover:bg-muted/80"
                  >
                    <CalendarCheck2 className="h-6 w-6 text-indigo-600" />
                    <span className="text-xs font-bold text-foreground">Outlook 365</span>
                    <span className="text-[10px] text-muted-foreground">ويندوز وأوفيس 365</span>
                  </a>
                </div>
              </div>

              {/* Feed URL Box */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">
                  🔗 رابط التغذية المباشر المخصص لمكتبك (ICS Feed URL)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.icsFeedUrl}
                    className="w-full rounded-xl border border-input bg-muted/50 px-3.5 py-2.5 font-mono text-xs text-foreground focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(settings.icsFeedUrl)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedLink ? "تم النسخ" : "نسخ"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  هذا الرابط خاص بمكتبك، ويتم تحديثه تلقائياً كل 15 دقيقة بكافة الجلسات والمهل الجديدة.
                </p>
              </div>

              {/* Security & Token Rotation */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <h4 className="text-xs font-bold text-foreground">حماية وتدوير الرابط</h4>
                    <p className="text-[11px] text-muted-foreground">في حال رغبت بإلغاء اشتراك الأجهزة السابقة</p>
                  </div>
                </div>

                <button
                  onClick={() => rotateTokenMutation.mutate()}
                  disabled={rotateTokenMutation.isPending}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  {rotateTokenMutation.isPending ? "جارٍ التحديث..." : "تدوير الرمز السري"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
