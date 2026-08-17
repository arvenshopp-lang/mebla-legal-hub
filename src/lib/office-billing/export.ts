/**
 * تصدير مستندات الفوترة (CSV وHTML قابل للطباعة) — يعمل في المتصفح.
 * لا يُصدَّر أي حقل حسّاس غير معروض أصلاً للمستخدم، والقيم تُحيَّد ضد حقن الصيغ.
 */
import { buildCsv } from "@/lib/csv";
import { fmtDate, fmtDateTime, fmtMoney, RIYADH_TZ_HINT } from "@/lib/format";
import type { ClientStatement } from "./billing.server";
import {
  OFFICE_INVOICE_DISPLAY_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "./billing.shared";

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

const methodLabel = (m: string) => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m;

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

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const PRINT_STYLES = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; color: #123C32; margin: 0; padding: 24px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #5b6b64; font-size: 12px; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #123C32; padding-bottom: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; }
  th, td { border: 1px solid #d8ded9; padding: 8px 10px; text-align: right; }
  th { background: #f5f3ee; font-weight: 700; }
  tfoot td { font-weight: 700; }
  .totals { margin-top: 16px; width: 320px; margin-inline-start: auto; }
  .num { font-variant-numeric: tabular-nums; }
  .sig { margin-top: 40px; font-size: 12px; color: #5b6b64; }
`;

function openPrintable(title: string, bodyHtml: string): void {
  const win = window.open("", "_blank", "noopener,width=900,height=1000");
  if (!win) {
    throw new Error("تعذّر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة للموقع.");
  }
  win.document.write(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_STYLES}</style></head><body>${bodyHtml}<script>window.onload=function(){window.print()}</script></body></html>`,
  );
  win.document.close();
}

export type PrintableInvoice = {
  invoice_number: string | null;
  title: string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  tax_rate: number;
  total: number;
  paid_total: number;
  balance: number;
  notes: string | null;
  payment_terms: string | null;
  clientName: string;
  caseTitle: string | null;
  organizationName: string;
  taxNumber: string | null;
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
};

export function printInvoice(inv: PrintableInvoice): void {
  const rows = inv.items
    .map(
      (it, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(it.description)}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td class="num">${esc(fmtMoney(it.unit_price))}</td>
        <td class="num">${esc(fmtMoney(it.line_total))}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <div class="head">
      <div>
        <h1>فاتورة أتعاب</h1>
        <p class="muted">${esc(inv.organizationName)}${inv.taxNumber ? ` — الرقم الضريبي: ${esc(inv.taxNumber)}` : ""}</p>
      </div>
      <div class="muted">
        <div>رقم الفاتورة: <strong>${esc(inv.invoice_number ?? "مسودة")}</strong></div>
        <div>تاريخ الإصدار: ${esc(inv.issue_date ? fmtDate(inv.issue_date) : "—")}</div>
        <div>تاريخ الاستحقاق: ${esc(inv.due_date ? fmtDate(inv.due_date) : "—")}</div>
      </div>
    </div>
    <p><strong>العميل:</strong> ${esc(inv.clientName)}</p>
    ${inv.caseTitle ? `<p><strong>القضية:</strong> ${esc(inv.caseTitle)}</p>` : ""}
    ${inv.title ? `<p><strong>الوصف:</strong> ${esc(inv.title)}</p>` : ""}
    <table>
      <thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tbody>
        <tr><td>الإجمالي قبل الضريبة</td><td class="num">${esc(fmtMoney(inv.subtotal))}</td></tr>
        <tr><td>الخصم</td><td class="num">${esc(fmtMoney(inv.discount_total))}</td></tr>
        <tr><td>ضريبة القيمة المضافة (${esc(inv.tax_rate)}%)</td><td class="num">${esc(fmtMoney(inv.tax_total))}</td></tr>
        <tr><td>الإجمالي المستحق</td><td class="num">${esc(fmtMoney(inv.total))}</td></tr>
        <tr><td>المحصل</td><td class="num">${esc(fmtMoney(inv.paid_total))}</td></tr>
        <tr><td>المتبقي</td><td class="num">${esc(fmtMoney(inv.balance))}</td></tr>
      </tbody>
    </table>
    ${inv.payment_terms ? `<p class="muted"><strong>شروط الدفع:</strong> ${esc(inv.payment_terms)}</p>` : ""}
    ${inv.notes ? `<p class="muted"><strong>ملاحظات:</strong> ${esc(inv.notes)}</p>` : ""}
    <p class="sig">تم إصدار هذه الفاتورة إلكترونياً من منصة مِهلة — ${esc(fmtDateTime(new Date().toISOString()))} ${esc(RIYADH_TZ_HINT)}</p>
  `;
  openPrintable(`فاتورة ${inv.invoice_number ?? "مسودة"}`, body);
}

export function printStatement(statement: ClientStatement): void {
  const invoiceRows = statement.invoices
    .map(
      (i) => `<tr>
        <td>${esc(i.invoice_number ?? "مسودة")}</td>
        <td>${esc(i.case_title ?? "—")}</td>
        <td>${esc(OFFICE_INVOICE_DISPLAY_LABELS[i.displayStatus])}</td>
        <td>${esc(i.issue_date ? fmtDate(i.issue_date) : "—")}</td>
        <td>${esc(i.due_date ? fmtDate(i.due_date) : "—")}</td>
        <td class="num">${esc(fmtMoney(i.total))}</td>
        <td class="num">${esc(fmtMoney(i.paid_total))}</td>
        <td class="num">${esc(fmtMoney(i.balance))}</td>
      </tr>`,
    )
    .join("");
  const paymentRows = statement.payments
    .map(
      (p) => `<tr>
        <td>${esc(p.invoice_number ?? "—")}</td>
        <td>${esc(fmtDate(p.paid_at))}</td>
        <td>${esc(methodLabel(p.method))}</td>
        <td>${esc(p.reference_number ?? "—")}</td>
        <td class="num">${esc(fmtMoney(p.amount))}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <div class="head">
      <div>
        <h1>كشف حساب عميل</h1>
        <p class="muted">${esc(statement.organization?.name ?? "")}</p>
      </div>
      <div class="muted">
        <div>العميل: <strong>${esc(statement.client.full_name)}</strong></div>
        <div>تاريخ الكشف: ${esc(fmtDateTime(statement.generatedAt))} ${esc(RIYADH_TZ_HINT)}</div>
      </div>
    </div>
    <table class="totals">
      <tbody>
        <tr><td>إجمالي الفواتير</td><td class="num">${esc(fmtMoney(statement.summary.invoiced))}</td></tr>
        <tr><td>إجمالي المحصل</td><td class="num">${esc(fmtMoney(statement.summary.collected))}</td></tr>
        <tr><td>الرصيد المستحق</td><td class="num">${esc(fmtMoney(statement.summary.outstanding))}</td></tr>
        <tr><td>منه متأخر</td><td class="num">${esc(fmtMoney(statement.summary.overdue))}</td></tr>
      </tbody>
    </table>
    <h2 style="font-size:15px;margin-top:24px">الفواتير</h2>
    <table>
      <thead><tr><th>الرقم</th><th>القضية</th><th>الحالة</th><th>الإصدار</th><th>الاستحقاق</th><th>الإجمالي</th><th>المحصل</th><th>الرصيد</th></tr></thead>
      <tbody>${invoiceRows || `<tr><td colspan="8">لا توجد فواتير.</td></tr>`}</tbody>
    </table>
    <h2 style="font-size:15px;margin-top:24px">الدفعات المحصّلة</h2>
    <table>
      <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الطريقة</th><th>المرجع</th><th>المبلغ</th></tr></thead>
      <tbody>${paymentRows || `<tr><td colspan="5">لا توجد دفعات.</td></tr>`}</tbody>
    </table>
    <p class="sig">كشف صادر إلكترونياً من منصة مِهلة. جميع المبالغ بالريال السعودي.</p>
  `;
  openPrintable(`كشف حساب ${statement.client.full_name}`, body);
}
