/** تقارير مركز الدعم: كل رقم محسوب خادمياً من بيانات التذاكر الفعلية. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { getSupportReport } from "@/lib/support/support.functions";
import {
  TICKET_CHANNEL_LABELS,
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUS_LABELS_AR,
  humanMinutes,
  type TicketChannel,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/support.shared";
import { Btn, LoadingBlock, inputCls } from "@/lib/list-utils";
import { buildCsv } from "@/lib/csv";
import { BreakdownTable, Kpi, Stars } from "./shared";
import type { SupportWorkspace } from "./types";

const RANGES = [
  { key: "7", label: "آخر 7 أيام" },
  { key: "30", label: "آخر 30 يوماً" },
  { key: "90", label: "آخر 90 يوماً" },
  { key: "365", label: "آخر سنة" },
];

export function ReportsPanel({ workspace }: { workspace: SupportWorkspace }) {
  const [days, setDays] = useState("30");
  const [teamId, setTeamId] = useState("all");
  const reportFn = useServerFn(getSupportReport);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const { data: report, isLoading } = useQuery({
    queryKey: ["support-report", range.from, range.to, teamId],
    queryFn: () => reportFn({ data: { ...range, ...(teamId !== "all" ? { teamId } : {}) } }),
  });

  const exportReport = () => {
    if (!report) return;
    const rows: (string | number)[][] = [
      ["إجمالي التذاكر", report.totals.created],
      ["المفتوحة", report.totals.open],
      ["المحلولة", report.totals.resolved],
      ["متجاوزة المهلة", report.totals.breached],
      ["مصعّدة", report.totals.escalated],
      ["أُعيد فتحها", report.totals.reopened],
      ["نسبة إعادة الفتح %", report.totals.reopenRate],
      ["الحل من أول تواصل %", report.totals.fcrRate],
      ["تراكم العمل", report.totals.backlog],
      ["التزام أول رد %", report.sla.firstResponseCompliance],
      ["التزام الحل %", report.sla.resolutionCompliance],
      ["متوسط أول رد (دقيقة)", report.sla.avgFirstResponseMinutes ?? ""],
      ["متوسط الحل (دقيقة)", report.sla.avgResolutionMinutes ?? ""],
      ["متوسط الرضا", report.csat.average ?? ""],
      ["عدد التقييمات", report.csat.responses],
    ];
    const csv = buildCsv(["المؤشر", "القيمة"], rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mehla-support-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير التقرير");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          aria-label="المدة"
          className={`${inputCls} w-auto`}
        >
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          aria-label="الفريق"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل الفرق</option>
          {workspace.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Btn variant="ghost" className="ms-auto" disabled={!report} onClick={exportReport}>
          <Download className="h-4 w-4" aria-hidden /> تصدير المؤشرات
        </Btn>
      </div>

      {isLoading || !report ? (
        <LoadingBlock rows={6} cols={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="إجمالي التذاكر" value={report.totals.created} />
            <Kpi label="المحلولة" value={report.totals.resolved} tone="success" />
            <Kpi label="متجاوزة المهلة" value={report.totals.breached} tone="danger" />
            <Kpi label="مصعّدة" value={report.totals.escalated} tone="warning" />
            <Kpi
              label="متوسط أول رد"
              value={
                report.sla.avgFirstResponseMinutes === null
                  ? "—"
                  : humanMinutes(report.sla.avgFirstResponseMinutes)
              }
              hint={`التزام ${report.sla.firstResponseCompliance}%`}
            />
            <Kpi
              label="متوسط الحل"
              value={
                report.sla.avgResolutionMinutes === null
                  ? "—"
                  : humanMinutes(report.sla.avgResolutionMinutes)
              }
              hint={`التزام ${report.sla.resolutionCompliance}%`}
            />
            <Kpi
              label="نسبة إعادة الفتح"
              value={`${report.totals.reopenRate}%`}
              hint={`${report.totals.reopened} تذكرة`}
            />
            <Kpi label="الحل من أول تواصل" value={`${report.totals.fcrRate}%`} tone="success" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable
              caption="حسب الحالة"
              head={["الحالة", "العدد"]}
              rows={report.byStatus.map((s) => [
                TICKET_STATUS_LABELS_AR[s.key as TicketStatus] ?? s.label,
                s.count,
              ])}
            />
            <BreakdownTable
              caption="حسب الأولوية"
              head={["الأولوية", "العدد", "متجاوزة"]}
              rows={report.byPriority.map((p) => [
                TICKET_PRIORITY_LABELS_AR[p.key as TicketPriority] ?? p.key,
                p.count,
                p.breached,
              ])}
            />
            <BreakdownTable
              caption="حسب القناة"
              head={["القناة", "العدد"]}
              rows={report.byChannel.map((c) => [
                TICKET_CHANNEL_LABELS[c.key as TicketChannel] ?? c.key,
                c.count,
              ])}
            />
            <BreakdownTable
              caption="حسب التصنيف"
              head={["التصنيف", "العدد", "متجاوزة"]}
              rows={report.byCategory.map((c) => [
                workspace.categories.find((x) => x.code === c.key)?.name ?? c.key,
                c.count,
                c.breached,
              ])}
            />
            <BreakdownTable
              caption="حسب المكتب"
              head={["المكتب", "الباقة", "الإجمالي", "المفتوحة", "متجاوزة"]}
              rows={report.byOrganization.map((o) => [
                o.name,
                o.plan ?? "—",
                o.count,
                o.open,
                o.breached,
              ])}
            />
            <BreakdownTable
              caption="حسب الباقة"
              head={["الباقة", "العدد", "متجاوزة"]}
              rows={report.byPlan.map((p) => [p.key, p.count, p.breached])}
            />
            <BreakdownTable
              caption="حسب الفريق"
              head={["الفريق", "الإجمالي", "المفتوحة", "متجاوزة"]}
              rows={report.byTeam.map((t) => [t.name, t.count, t.open, t.breached])}
            />
            <BreakdownTable
              caption="حسب الموظف"
              head={["الموظف", "المفتوحة", "المحلولة", "متجاوزة", "متوسط الحل"]}
              rows={report.byAgent.map((a) => [
                a.name,
                a.open,
                a.resolved,
                a.breached,
                a.avgResolutionMinutes === null ? "—" : humanMinutes(a.avgResolutionMinutes),
              ])}
            />
            <BreakdownTable
              caption="أعمار التذاكر المفتوحة"
              head={["الفئة", "العدد"]}
              rows={report.aging.map((a) => [a.label, a.count])}
            />
            <BreakdownTable
              caption="رضا المكاتب حسب الفريق"
              head={["الفريق", "التقييمات", "المتوسط"]}
              rows={report.csatByTeam.map((t) => [
                t.name,
                t.responses,
                <span key={t.key} className="inline-flex items-center gap-2">
                  {t.average} <Stars value={t.average} />
                </span>,
              ])}
            />
            <BreakdownTable
              caption="رضا المكاتب حسب الموظف"
              head={["الموظف", "التقييمات", "المتوسط"]}
              rows={report.csatByStaff.map((s) => [
                s.name,
                s.responses,
                <span key={s.key} className="inline-flex items-center gap-2">
                  {s.average} <Stars value={s.average} />
                </span>,
              ])}
            />
            <BreakdownTable
              caption="رضا المكاتب حسب التصنيف"
              head={["التصنيف", "التقييمات", "المتوسط"]}
              rows={report.csatByCategory.map((c) => [
                workspace.categories.find((x) => x.code === c.key)?.name ?? c.key,
                c.responses,
                <span key={c.key} className="inline-flex items-center gap-2">
                  {c.average} <Stars value={c.average} />
                </span>,
              ])}
            />
            <BreakdownTable
              caption="الحركة اليومية"
              head={["اليوم", "تذاكر جديدة", "تمّ حلها"]}
              rows={report.daily.map((d) => [d.day, d.created, d.resolved])}
            />
          </div>
        </>
      )}
    </div>
  );
}
