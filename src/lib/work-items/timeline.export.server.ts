/** بناء ملفات تصدير سجل أحداث المهمة/المهلة — خادم فقط. */
import { buildCsv } from "@/lib/csv";
import { WORK_EVENT_LABELS, type WorkItemTimelineEvent } from "./timeline.shared";

export type TimelineExportMeta = {
  itemType: "task" | "deadline";
  itemTitle: string;
  officeName: string;
  generatedAt: string;
  truncated: boolean;
};

const RIYADH = "Asia/Riyadh";

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: RIYADH,
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  }).format(new Date(iso));

const fmtDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        timeZone: RIYADH,
        dateStyle: "medium",
        numberingSystem: "latn",
      }).format(new Date(iso))
    : "بدون تاريخ";

const KIND_LABEL = { task: "مهمة", deadline: "مهلة" } as const;

function detail(e: WorkItemTimelineEvent): string {
  switch (e.event) {
    case "assigned":
      return `من ${e.fromUserName ?? "بدون مسؤول"} إلى ${e.toUserName ?? "بدون مسؤول"}`;
    case "due_changed":
      return `من ${fmtDate(e.fromDueDate)} إلى ${fmtDate(e.toDueDate)}`;
    default:
      return e.toUserName ? `المسؤول: ${e.toUserName}` : "—";
  }
}

export function buildTimelineCsv(
  events: WorkItemTimelineEvent[],
  meta: TimelineExportMeta,
): string {
  const preamble: unknown[][] = [
    ["سجل الأحداث — منصة مِهلة"],
    ["المكتب", meta.officeName],
    ["نوع العمل", KIND_LABEL[meta.itemType]],
    ["العنوان", meta.itemTitle],
    ["المنطقة الزمنية", RIYADH],
    ["تاريخ التصدير", fmtDateTime(meta.generatedAt)],
    ["عدد الأحداث", events.length],
  ];
  if (meta.truncated) preamble.push(["ملاحظة", "تم تصدير أحدث الأحداث حتى الحد الأقصى المسموح"]);

  const headers = ["#", "الحدث", "التاريخ والوقت", "بواسطة", "التفاصيل"];
  const rows = events.map((e, i) => [
    i + 1,
    WORK_EVENT_LABELS[e.event],
    fmtDateTime(e.occurredAt),
    e.actorName ?? "تلقائي",
    detail(e),
  ]);
  return buildCsv(headers, rows, preamble);
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

/** جسم HTML يُمرَّر إلى محرك الطباعة المعتمد (علامة مائية + تذييل + سجل تدقيق). */
export function buildTimelineHtml(
  events: WorkItemTimelineEvent[],
  meta: TimelineExportMeta,
): string {
  const rows = events
    .map(
      (e, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(WORK_EVENT_LABELS[e.event])}</td>
      <td>${esc(fmtDateTime(e.occurredAt))}</td>
      <td>${esc(e.actorName ?? "تلقائي")}</td>
      <td>${esc(detail(e))}</td>
    </tr>`,
    )
    .join("");

  return `<h1>سجل الأحداث</h1>
<p><strong>${esc(KIND_LABEL[meta.itemType])}:</strong> ${esc(meta.itemTitle)}</p>
<p><strong>المكتب:</strong> ${esc(meta.officeName)} · <strong>تاريخ التصدير:</strong> ${esc(fmtDateTime(meta.generatedAt))} (${RIYADH})</p>
<p><strong>عدد الأحداث:</strong> ${events.length}${meta.truncated ? " — تم عرض أحدث الأحداث حتى الحد الأقصى المسموح" : ""}</p>
<table>
  <thead><tr><th>#</th><th>الحدث</th><th>التاريخ والوقت</th><th>بواسطة</th><th>التفاصيل</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5">لا توجد أحداث مسجّلة.</td></tr>'}</tbody>
</table>`;
}
