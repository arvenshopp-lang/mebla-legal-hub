/**
 * تصدير كشف حساب العميل بصيغة CSV — يعمل في المتصفح.
 * مستندات PDF الرسمية تُولَّد على الخادم بهوية المكتب (pdf.server.ts).
 * لا يُصدَّر أي حقل حسّاس غير معروض أصلاً للمستخدم، والقيم تُحيَّد ضد حقن الصيغ.
 */
import { buildCsv } from "@/lib/csv";
import { fmtDate, fmtDateTime, RIYADH_TZ_HINT } from "@/lib/format";
import type { ClientStatement } from "./billing.server";
import { OFFICE_INVOICE_DISPLAY_LABELS } from "./billing.shared";

function download(content: string, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadStatementCsv(statement: ClientStatement): void {
  const csv = buildCsv(
    [
      "رقم الفاتورة",
      "القضية",
      "الحالة",
      "تاريخ الإصدار",
      "تاريخ الاستحقاق",
      "الإجمالي",
      "المحصل",
      "الرصيد",
    ],
    statement.invoices.map((i) => [
      i.invoice_number ?? "مسودة",
      i.case_title ?? "—",
      OFFICE_INVOICE_DISPLAY_LABELS[i.displayStatus],
      i.issue_date ? fmtDate(i.issue_date) : "—",
      i.due_date ? fmtDate(i.due_date) : "—",
      i.total.toFixed(2),
      i.paid_total.toFixed(2),
      i.balance.toFixed(2),
    ]),
    [
      ["كشف حساب عميل", statement.client.full_name],
      ["المكتب", statement.organization?.name ?? "—"],
      ["تاريخ الإصدار", `${fmtDateTime(statement.generatedAt)} ${RIYADH_TZ_HINT}`],
      ["إجمالي الفواتير", statement.summary.invoiced.toFixed(2)],
      ["إجمالي المحصل", statement.summary.collected.toFixed(2)],
      ["الرصيد المستحق", statement.summary.outstanding.toFixed(2)],
      ["المتأخر", statement.summary.overdue.toFixed(2)],
      ["العملة", "ريال سعودي (SAR)"],
    ],
  );
  const safeName = statement.client.full_name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60);
  download(csv, `كشف-حساب-${safeName || "عميل"}.csv`, "text/csv;charset=utf-8");
}
