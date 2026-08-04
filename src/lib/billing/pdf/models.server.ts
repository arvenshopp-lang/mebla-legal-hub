/**
 * نماذج مستندات المركز المالي — تحوّل بيانات قاعدة البيانات إلى نموذج
 * PdfDocumentModel الموحّد. أي مستند جديد يُضاف هنا فقط، بلا تعديل المحرك.
 */
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  type InvoiceDetail,
  type PaymentRow,
  type RefundRow,
} from "../billing.shared";
import {
  formatPdfDate,
  formatPdfDateTime,
  formatPdfMoney,
  type PdfDocumentModel,
  type PdfMetaRow,
  type PdfTable,
  type PdfTotalRow,
} from "./engine.server";

const dash = "—";
const label = (value: string | null | undefined): string => (value && value.trim() ? value : dash);

/* ----------------------------------------------------------- فاتورة / عرض سعر */

function invoiceMeta(invoice: InvoiceDetail): PdfMetaRow[] {
  return [
    { label: "العميل", value: label(invoice.customer_legal_name || invoice.customer_name) },
    { label: "المكتب", value: label(invoice.organization_name) },
    { label: "البريد الإلكتروني", value: label(invoice.customer_email) },
    { label: "الجوال", value: label(invoice.customer_phone) },
    { label: "السجل التجاري", value: label(invoice.commercial_registration) },
    { label: "الرقم الضريبي للعميل", value: label(invoice.tax_number) },
    { label: "تاريخ الإصدار", value: formatPdfDate(invoice.issued_at ?? invoice.created_at) },
    { label: "تاريخ الاستحقاق", value: formatPdfDate(invoice.due_at) },
    { label: "الباقة", value: label(invoice.plan_label) },
    {
      label: "فترة الخدمة",
      value: invoice.service_period_start
        ? `${formatPdfDate(invoice.service_period_start)} ← ${formatPdfDate(invoice.service_period_end)}`
        : dash,
    },
  ];
}

function itemsTable(invoice: InvoiceDetail): PdfTable {
  const currency = invoice.currency;
  return {
    columns: [
      { label: "البند", width: 0.4 },
      { label: "الكمية", width: 0.1 },
      { label: "سعر الوحدة", width: 0.14 },
      { label: "الخصم", width: 0.12 },
      { label: "الضريبة", width: 0.12 },
      { label: "الإجمالي", width: 0.12 },
    ],
    rows: invoice.items.map((item) => [
      item.description,
      String(item.quantity),
      formatPdfMoney(item.unitPrice, currency),
      formatPdfMoney(item.discountAmount, currency),
      formatPdfMoney(item.lineTax, currency),
      formatPdfMoney(item.lineTotal, currency),
    ]),
    emptyLabel: "لا توجد بنود مسجّلة على هذا المستند.",
  };
}

function paymentsTable(invoice: InvoiceDetail): PdfTable | null {
  const settled = invoice.payments.filter((payment) => payment.status !== "pending" && payment.status !== "failed");
  if (settled.length === 0) return null;
  return {
    title: "الدفعات المعتمدة",
    columns: [
      { label: "التاريخ", width: 0.28 },
      { label: "طريقة السداد", width: 0.26 },
      { label: "الحالة", width: 0.22 },
      { label: "المبلغ", width: 0.24 },
    ],
    rows: settled.map((payment) => [
      formatPdfDate(payment.paid_at ?? payment.received_at ?? payment.created_at),
      PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
      formatPdfMoney(payment.amount, invoice.currency),
    ]),
    emptyLabel: "لا توجد دفعات.",
  };
}

function invoiceTotals(invoice: InvoiceDetail, withSettlement: boolean): PdfTotalRow[] {
  const currency = invoice.currency;
  const rows: PdfTotalRow[] = [
    { label: "الإجمالي قبل الضريبة", value: formatPdfMoney(invoice.subtotal, currency) },
    { label: "الخصم", value: formatPdfMoney(invoice.discount_total, currency) },
    {
      label: invoice.tax_exempt ? "الضريبة (معفاة)" : `ضريبة القيمة المضافة ${invoice.tax_rate}%`,
      value: formatPdfMoney(invoice.tax_total, currency),
    },
    { label: "الإجمالي المستحق", value: formatPdfMoney(invoice.total, currency), emphasis: true },
  ];
  if (withSettlement) {
    rows.push(
      { label: "المسدّد", value: formatPdfMoney(invoice.paid_total, currency) },
      { label: "المسترد", value: formatPdfMoney(invoice.refunded_total, currency) },
      { label: "المتبقي", value: formatPdfMoney(invoice.remaining, currency), emphasis: true },
    );
  }
  return rows;
}

function invoiceBlocks(invoice: InvoiceDetail): PdfDocumentModel["blocks"] {
  const blocks: PdfDocumentModel["blocks"] = [];
  if (invoice.tax_exempt && invoice.tax_exemption_reason) {
    blocks.push({ title: "الإعفاء الضريبي", lines: [invoice.tax_exemption_reason] });
  }
  if (invoice.notes) blocks.push({ title: "ملاحظات", lines: [invoice.notes] });
  return blocks;
}

export function invoiceModel(invoice: InvoiceDetail): PdfDocumentModel {
  const payments = paymentsTable(invoice);
  return {
    kind: "invoice",
    title: "فاتورة ضريبية",
    reference: invoice.number,
    statusLine: `الحالة: ${INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}`,
    meta: invoiceMeta(invoice),
    tables: payments ? [itemsTable(invoice), payments] : [itemsTable(invoice)],
    totals: invoiceTotals(invoice, true),
    blocks: invoiceBlocks(invoice),
    fileName: `${invoice.number}.pdf`,
    showBankDetails: invoice.remaining > 0,
  };
}

export function quoteModel(invoice: InvoiceDetail): PdfDocumentModel {
  const validUntil = invoice.due_at ? formatPdfDate(invoice.due_at) : dash;
  return {
    kind: "quote",
    title: "عرض سعر",
    reference: invoice.number,
    statusLine: "مسودة قابلة للتعديل",
    notice: "هذا المستند عرض سعر ولا يُعد مطالبة بالسداد ولا فاتورة ضريبية.",
    subtitle: `صالح حتى: ${validUntil}`,
    meta: invoiceMeta(invoice).filter((row) => row.label !== "تاريخ الاستحقاق"),
    tables: [itemsTable(invoice)],
    totals: invoiceTotals(invoice, false),
    blocks: invoiceBlocks(invoice),
    fileName: `QUOTE-${invoice.number}.pdf`,
    showBankDetails: false,
  };
}

/* ---------------------------------------------------------------- الإيصال */

export type ReceiptSource = {
  payment: PaymentRow;
  refunds: RefundRow[];
  invoice: {
    number: string;
    currency: string;
    customer_name: string;
    customer_legal_name: string | null;
    customer_email: string | null;
    tax_number: string | null;
    organization_name: string | null;
    total: number;
    paid_total: number;
    remaining: number;
  };
};

export function receiptModel(source: ReceiptSource): PdfDocumentModel {
  const { payment, invoice, refunds } = source;
  const currency = invoice.currency;
  const settledRefunds = refunds.filter((refund) => refund.status === "completed");
  const refundedTotal = settledRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);

  const tables: PdfTable[] = [
    {
      title: "تفاصيل السداد",
      columns: [
        { label: "البيان", width: 0.4 },
        { label: "المرجع", width: 0.35 },
        { label: "المبلغ", width: 0.25 },
      ],
      rows: [
        [
          `سداد على الفاتورة ${invoice.number}`,
          label(payment.bank_reference ?? payment.provider_payment_id),
          formatPdfMoney(payment.amount, currency),
        ],
      ],
      emptyLabel: dash,
    },
  ];

  if (settledRefunds.length > 0) {
    tables.push({
      title: "الاستردادات المرتبطة",
      columns: [
        { label: "التاريخ", width: 0.3 },
        { label: "السبب", width: 0.42 },
        { label: "الحالة", width: 0.14 },
        { label: "المبلغ", width: 0.14 },
      ],
      rows: settledRefunds.map((refund) => [
        formatPdfDate(refund.processed_at ?? refund.created_at),
        refund.reason,
        REFUND_STATUS_LABELS[refund.status] ?? refund.status,
        formatPdfMoney(refund.amount, currency),
      ]),
      emptyLabel: dash,
    });
  }

  return {
    kind: "receipt",
    title: "إيصال سداد",
    reference: `REC-${payment.id.slice(0, 8).toUpperCase()}`,
    statusLine: `الحالة: ${PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}`,
    subtitle: `مرتبط بالفاتورة ${invoice.number}`,
    meta: [
      { label: "العميل", value: label(invoice.customer_legal_name || invoice.customer_name) },
      { label: "المكتب", value: label(invoice.organization_name) },
      { label: "البريد الإلكتروني", value: label(invoice.customer_email) },
      { label: "الرقم الضريبي للعميل", value: label(invoice.tax_number) },
      { label: "تاريخ السداد", value: formatPdfDateTime(payment.paid_at ?? payment.received_at ?? payment.created_at) },
      { label: "طريقة السداد", value: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method },
      { label: "اعتمدها", value: label(payment.approved_by_email) },
      { label: "تاريخ الاعتماد", value: formatPdfDateTime(payment.approved_at) },
    ],
    tables,
    totals: [
      { label: "المبلغ المستلم", value: formatPdfMoney(payment.amount, currency), emphasis: true },
      ...(refundedTotal > 0
        ? [{ label: "المسترد من هذه الدفعة", value: formatPdfMoney(refundedTotal, currency) }]
        : []),
      { label: "إجمالي الفاتورة", value: formatPdfMoney(invoice.total, currency) },
      { label: "إجمالي المسدّد على الفاتورة", value: formatPdfMoney(invoice.paid_total, currency) },
      { label: "المتبقي على الفاتورة", value: formatPdfMoney(invoice.remaining, currency), emphasis: true },
    ],
    blocks: payment.notes ? [{ title: "ملاحظات", lines: [payment.notes] }] : [],
    fileName: `RECEIPT-${invoice.number}-${payment.id.slice(0, 8)}.pdf`,
    showBankDetails: false,
  };
}

/* ------------------------------------------------------------- كشف الحساب */

export type StatementSource = {
  accountName: string;
  taxNumber: string | null;
  commercialRegistration: string | null;
  email: string | null;
  currency: string;
  from: string;
  to: string;
  openingOutstanding: number;
  invoices: Array<{
    number: string;
    issued_at: string | null;
    due_at: string | null;
    status: string;
    total: number;
    paid_total: number;
    remaining: number;
  }>;
  payments: Array<{
    date: string;
    invoice_number: string;
    method: string;
    status: string;
    amount: number;
  }>;
  totals: { invoiced: number; collected: number; refunded: number; outstanding: number };
};

export function statementModel(source: StatementSource): PdfDocumentModel {
  const currency = source.currency;
  return {
    kind: "statement",
    title: "كشف حساب",
    reference: `${formatPdfDate(source.from)} ← ${formatPdfDate(source.to)}`,
    statusLine: `تاريخ الإصدار: ${formatPdfDate(new Date().toISOString())}`,
    subtitle: source.accountName,
    meta: [
      { label: "الحساب", value: label(source.accountName) },
      { label: "البريد الإلكتروني", value: label(source.email) },
      { label: "الرقم الضريبي", value: label(source.taxNumber) },
      { label: "السجل التجاري", value: label(source.commercialRegistration) },
      { label: "بداية الفترة", value: formatPdfDate(source.from) },
      { label: "نهاية الفترة", value: formatPdfDate(source.to) },
      { label: "رصيد مستحق قبل الفترة", value: formatPdfMoney(source.openingOutstanding, currency) },
      { label: "عدد الفواتير", value: String(source.invoices.length) },
    ],
    tables: [
      {
        title: "الفواتير",
        columns: [
          { label: "الفاتورة", width: 0.26, align: "left" },
          { label: "الإصدار", width: 0.15 },
          { label: "الاستحقاق", width: 0.15 },
          { label: "الحالة", width: 0.14 },
          { label: "الإجمالي", width: 0.15 },
          { label: "المتبقي", width: 0.15 },
        ],
        rows: source.invoices.map((invoice) => [
          invoice.number,
          formatPdfDate(invoice.issued_at),
          formatPdfDate(invoice.due_at),
          INVOICE_STATUS_LABELS[invoice.status as keyof typeof INVOICE_STATUS_LABELS] ?? invoice.status,
          formatPdfMoney(invoice.total, currency),
          formatPdfMoney(invoice.remaining, currency),
        ]),
        emptyLabel: "لا توجد فواتير في هذه الفترة.",
        footerRow: [
          "الإجمالي",
          "",
          "",
          "",
          formatPdfMoney(source.totals.invoiced, currency),
          formatPdfMoney(source.totals.outstanding, currency),
        ],
      },
      {
        title: "الدفعات",
        columns: [
          { label: "التاريخ", width: 0.2 },
          { label: "الفاتورة", width: 0.28, align: "left" },
          { label: "طريقة السداد", width: 0.2 },
          { label: "الحالة", width: 0.16 },
          { label: "المبلغ", width: 0.16 },
        ],
        rows: source.payments.map((payment) => [
          formatPdfDate(payment.date),
          payment.invoice_number,
          PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS] ?? payment.method,
          PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] ?? payment.status,
          formatPdfMoney(payment.amount, currency),
        ]),
        emptyLabel: "لا توجد دفعات في هذه الفترة.",
        footerRow: ["الإجمالي", "", "", "", formatPdfMoney(source.totals.collected, currency)],
      },
    ],
    totals: [
      { label: "إجمالي الفواتير", value: formatPdfMoney(source.totals.invoiced, currency) },
      { label: "إجمالي المُحصَّل", value: formatPdfMoney(source.totals.collected, currency) },
      { label: "إجمالي المسترد", value: formatPdfMoney(source.totals.refunded, currency) },
      { label: "الرصيد المستحق", value: formatPdfMoney(source.totals.outstanding, currency), emphasis: true },
    ],
    blocks: [
      {
        title: "تنويه",
        lines: [
          "هذا الكشف يعكس الحركات المسجّلة في المنصة حتى تاريخ الإصدار، ولا يُعد فاتورة ضريبية.",
        ],
      },
    ],
    fileName: `STATEMENT-${formatPdfDate(source.from)}-${formatPdfDate(source.to)}.pdf`,
    showBankDetails: source.totals.outstanding > 0,
  };
}
