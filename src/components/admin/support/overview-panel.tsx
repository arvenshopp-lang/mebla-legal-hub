/** النظرة العامة: مؤشرات التشغيل الحالية + التذاكر المتجاوزة للمهلة. */
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { humanMinutes } from "@/lib/support/support.shared";
import { BreakdownTable, Kpi, Stars } from "./shared";
import type { QueueKey } from "./queues-panel";
import type { SupportReportData } from "./types";

export function OverviewPanel({
  counts,
  report,
  onQueue,
}: {
  counts: Partial<Record<QueueKey, number>> | undefined;
  report: SupportReportData | undefined;
  onQueue: (key: QueueKey) => void;
}) {
  const kpis: { label: string; value: string; queue?: QueueKey; tone?: "default" | "success" | "warning" | "danger"; hint?: string }[] = [
    { label: "التذاكر المفتوحة", value: String(counts?.open ?? 0), queue: "open" },
    { label: "غير المسندة", value: String(counts?.unassigned ?? 0), queue: "unassigned", tone: "warning" },
    { label: "تذاكري", value: String(counts?.mine ?? 0), queue: "mine" },
    { label: "مهدَّدة بخرق المهلة", value: String(counts?.at_risk ?? 0), queue: "at_risk", tone: "warning" },
    { label: "متجاوزة للمهلة", value: String(counts?.breached ?? 0), queue: "breached", tone: "danger" },
    { label: "مصعّدة", value: String(counts?.escalated ?? 0), queue: "escalated", tone: "danger" },
    { label: "بانتظار العميل", value: String(counts?.awaiting_reply ?? 0), queue: "awaiting_reply" },
    { label: "بحاجة لمراجعة هوية", value: String(counts?.needs_review ?? 0), queue: "needs_review", tone: "warning" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => kpi.queue && onQueue(kpi.queue)}
            className="rounded-[var(--radius-m)] text-right transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.99]"
          >
            <Kpi label={kpi.label} value={kpi.value} tone={kpi.tone} hint={kpi.hint} />
          </button>
        ))}
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="التزام مهلة أول رد (30 يوماً)"
              value={`${report.sla.firstResponseCompliance}%`}
              tone={report.sla.firstResponseCompliance >= 90 ? "success" : "warning"}
              hint={`متوسط أول رد: ${report.sla.avgFirstResponseMinutes === null ? "—" : humanMinutes(report.sla.avgFirstResponseMinutes)}`}
            />
            <Kpi
              label="التزام مهلة الحل (30 يوماً)"
              value={`${report.sla.resolutionCompliance}%`}
              tone={report.sla.resolutionCompliance >= 90 ? "success" : "warning"}
              hint={`متوسط الحل: ${report.sla.avgResolutionMinutes === null ? "—" : humanMinutes(report.sla.avgResolutionMinutes)}`}
            />
            <Kpi
              label="تراكم العمل"
              value={String(report.totals.backlog)}
              hint="تذاكر مفتوحة أقدم من 24 ساعة"
            />
            <Kpi
              label="متوسط رضا المكاتب"
              value={report.csat.average === null ? "—" : String(report.csat.average)}
              hint={`${report.csat.responses} تقييماً`}
            />
          </div>

          <BreakdownTable
            caption="تذاكر تجاوزت المهلة وتحتاج تدخلاً فورياً"
            head={["المرجع", "الموضوع", "الأولوية", "الحالة", "مهلة الحل", "الفريق", "الموظف"]}
            empty="لا توجد تذاكر متجاوزة للمهلة في آخر 30 يوماً."
            rows={report.breachedTickets.map((t) => [
              <Link
                key={`${t.id}-ref`}
                to="/mehla-admin/support/$ticketId"
                params={{ ticketId: t.id }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {t.ref}
              </Link>,
              <span key={`${t.id}-subject`} className="block max-w-[280px] truncate">
                {t.subject}
              </span>,
              t.priority,
              t.status,
              t.dueAt ? fmtDateTime(t.dueAt) : "—",
              t.teamName ?? "—",
              t.assigneeName ?? "غير مسندة",
            ])}
          />

          {report.csat.responses > 0 && (
            <BreakdownTable
              caption="رضا المكاتب حسب الموظف"
              head={["الموظف", "عدد التقييمات", "المتوسط"]}
              rows={report.csatByStaff.map((s) => [
                s.name,
                s.responses,
                <span key={s.key} className="inline-flex items-center gap-2">
                  {s.average} <Stars value={s.average} />
                </span>,
              ])}
            />
          )}
        </>
      )}

      {!report && <EmptyState title="لا توجد بيانات تشغيلية بعد" hint="ستظهر المؤشرات بعد وصول أول تذاكر الدعم." />}
    </div>
  );
}
