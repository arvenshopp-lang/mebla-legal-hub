/**
 * مستندات PDF لفوترة المكتب (فاتورة / كشف حساب / إيصال دفعة) — خادم فقط.
 *
 * المستند يصدر بهوية المكتب وحده: شعاره واسمه القانوني وبياناته النظامية،
 * ولا يظهر اسم مِهلة إلا كسطر رمادي دقيق في التذييل. يعتمد المحرك الموحّد
 * (billing/pdf/engine.server) فيبقى الشكل والجودة متطابقين في كل المستندات.
 */
import {
  formatPdfDate,
  formatPdfDateTime,
  formatPdfMoney,
  renderBillingPdf,
  toBase64,
  type PdfBrand,
  type PdfDocumentModel,
  type PdfMetaRow,
  type PdfTable,
  type PdfTotalRow,
} from "@/lib/billing/pdf/engine.server";
import { loadInvoiceLogoBytes, readInvoiceBranding } from "./branding.server";
import {
  OFFICE_INVOICE_DISPLAY_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "./billing.shared";
import type { ClientStatement, InvoiceDetail } from "./billing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const dash = "—";
const label = (value: string | null | undefined): string => (value && value.trim() ? value : dash);
const methodLabel = (method: string): string =>
  PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;

export const FINE_NOTE = "صادر إلكترونياً عبر مِهلة";

export type OfficeProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  commercial_registration: string | null;
  tax_number: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
};

export type PdfPayload = { fileName: string; base64: string };

/** هوية المكتب كما تُطبع في رأس وتذييل كل مستند مالي. */
export async function loadOfficeBrand(
  supabase: Client,
  organizationId: string,
): Promise<{ brand: PdfBrand; office: OfficeProfile; showSignature: boolean }> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, legal_name, commercial_registration, tax_number, phone, email, city, address")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) throw new Error("تعذّر تحميل بيانات المكتب.");
  const office = data as OfficeProfile;
  const branding = await readInvoiceBranding(supabase, organizationId);
  const logo = await loadInvoiceLogoBytes(branding, organizationId);

  const addressLine = [office.address, office.city].filter(Boolean).join(" — ") || null;
  return {
    office,
    showSignature: branding.showSignature,
    brand: {
      sellerName: office.legal_name?.trim() || office.name,
      sellerAddress: addressLine,
      taxNumber: office.tax_number,
      commercialRegistration: office.commercial_registration,
      contactPhone: office.phone,
      contactEmail: office.email,
      bankDetails: branding.bankDetails,
      signatoryName: branding.signatoryName,
      signatoryTitle: branding.signatoryTitle,
      documentFooterNote: branding.footerNote,
      logo,
      footerFineNote: FINE_NOTE,
    },
  };
}

function signatureSlots(
  brand: PdfBrand,
  enabled: boolean,
): PdfDocumentModel["signatureSlots"] {
  if (!enabled) return [];
  return [
    {
      label: "عن المكتب",
      caption:
        [brand.signatoryName, brand.signatoryTitle].filter(Boolean).join(" — ") ||
        "الاسم والتوقيع",
    },
    { label: "عن العميل", caption: "الاسم والتوقيع والتاريخ" },
  ];
}

/* ------------------------------------------------------------------ فاتورة */

function invoiceMeta(detail: InvoiceDetail): PdfMetaRow[] {
  const inv = detail.invoice;
  return [
    { label: "العميل", value: label(detail.invoice.client?.full_name) },
    { label: "البريد الإلكتروني", value: label(inv.client?.email) },
    { label: "الجوال", value: label(inv.client?.phone) },
    { label: "القضية", value: label(inv.case?.case_title) },
    { label: "رقم القضية", value: label(inv.case?.case_number) },
    { label: "حالة الفاتورة", value: OFFICE_INVOICE_DISPLAY_LABELS[inv.displayStatus] },
    { label: "تاريخ الإصدار", value: inv.issue_date ? formatPdfDate(inv.issue_date) : dash },
    { label: "تاريخ الاستحقاق", value: inv.due_date ? formatPdfDate(inv.due_date) : dash },
    { label: "العملة", value: inv.currency },
  ];
}

function invoiceItemsTable(detail: InvoiceDetail): PdfTable {
  const currency = detail.invoice.currency;
  return {
    columns: [
      { label: "#", width: 0.06 },
      { label: "البند", width: 0.46 },
      { label: "الكمية", width: 0.12 },
      { label: "سعر الوحدة", width: 0.18 },
      { label: "الإجمالي", width: 0.18 },
    ],
    rows: detail.items.map((item, index) => [
      String(index + 1),
      item.description,
      String(item.quantity),
      formatPdfMoney(item.unit_price, currency),
      formatPdfMoney(item.line_total, currency),
    ]),
    emptyLabel: "لا توجد بنود مسجّلة على هذه الفاتورة.",
  };
}

function invoicePaymentsTable(detail: InvoiceDetail): PdfTable | null {
  const settled = detail.payments.filter((payment) => !payment.voided_at);
  if (settled.length === 0) return null;
  const currency = detail.invoice.currency;
  return {
    title: "الدفعات المحصّلة",
    columns: [
      { label: "التاريخ", width: 0.26 },
      { label: "الطريقة", width: 0.22 },
      { label: "المرجع", width: 0.3 },
      { label: "المبلغ", width: 0.22 },
    ],
    rows: settled.map((payment) => [
      formatPdfDate(payment.paid_at),
      methodLabel(payment.method),
      label(payment.reference_number),
      formatPdfMoney(payment.amount, currency),
    ]),
    emptyLabel: "لا توجد دفعات.",
  };
}

function invoiceTotals(detail: InvoiceDetail): PdfTotalRow[] {
  const inv = detail.invoice;
  const currency = inv.currency;
  return [
    { label: "الإجمالي قبل الضريبة", value: formatPdfMoney(inv.subtotal, currency) },
    { label: "الخصم", value: formatPdfMoney(inv.discount_total, currency) },
    {
      label: `ضريبة القيمة المضافة ${inv.tax_rate}%`,
      value: formatPdfMoney(inv.tax_total, currency),
    },
    { label: "الإجمالي المستحق", value: formatPdfMoney(inv.total, currency), emphasis: true },
    { label: "المحصل", value: formatPdfMoney(inv.paid_total, currency) },
    { label: "المتبقي", value: formatPdfMoney(inv.balance, currency), emphasis: true },
  ];
}

export async function renderInvoicePdf(
  supabase: Client,
  organizationId: string,
  detail: InvoiceDetail,
): Promise<PdfPayload> {
  const { brand, showSignature } = await loadOfficeBrand(supabase, organizationId);
  const inv = detail.invoice;
  const reference = inv.invoice_number ?? `مسودة-${inv.id.slice(0, 8)}`;
  const paymentsTable = invoicePaymentsTable(detail);
  const blocks: PdfDocumentModel["blocks"] = [];
  if (inv.payment_terms) blocks.push({ title: "شروط الدفع", lines: inv.payment_terms.split("\n") });
  if (inv.notes) blocks.push({ title: "ملاحظات", lines: inv.notes.split("\n") });

  const model: PdfDocumentModel = {
    kind: "invoice",
    title: "فاتورة أتعاب",
    reference,
    subtitle: inv.title,
    statusLine: `الحالة: ${OFFICE_INVOICE_DISPLAY_LABELS[inv.displayStatus]}`,
    notice:
      inv.status === "draft"
        ? "هذه مسودة فاتورة لم تُصدر بعد ولا تُعد مطالبة بالسداد."
        : inv.status === "cancelled"
          ? "هذه الفاتورة ملغاة ولا تُعد مطالبة بالسداد."
          : null,
    meta: invoiceMeta(detail),
    recipient: {
      title: "موجّهة إلى",
      lines: [
        inv.client?.full_name ?? dash,
        inv.case?.case_title ? `القضية: ${inv.case.case_title}` : "",
        [
          inv.client?.phone ? `جوال: ${inv.client.phone}` : "",
          inv.client?.email ? `بريد: ${inv.client.email}` : "",
        ]
          .filter(Boolean)
          .join("  ·  "),
      ],
    },
    tables: paymentsTable ? [invoiceItemsTable(detail), paymentsTable] : [invoiceItemsTable(detail)],
    totals: invoiceTotals(detail),
    blocks,
    signatureSlots: signatureSlots(brand, showSignature),
    fileName: `فاتورة-${reference}.pdf`,
    showBankDetails: true,
  };
  return { fileName: model.fileName, base64: toBase64(await renderBillingPdf(model, brand)) };
}

/* ------------------------------------------------------------- كشف الحساب */

export async function renderStatementPdf(
  supabase: Client,
  organizationId: string,
  statement: ClientStatement,
): Promise<PdfPayload> {
  const { brand } = await loadOfficeBrand(supabase, organizationId);
  const currency = "SAR";
  const invoicesTable: PdfTable = {
    title: "الفواتير",
    columns: [
      { label: "الرقم", width: 0.18 },
      { label: "القضية", width: 0.22 },
      { label: "الحالة", width: 0.12 },
      { label: "الاستحقاق", width: 0.14 },
      { label: "الإجمالي", width: 0.12 },
      { label: "المحصل", width: 0.11 },
      { label: "الرصيد", width: 0.11 },
    ],
    rows: statement.invoices.map((invoice) => [
      invoice.invoice_number ?? "مسودة",
      label(invoice.case_title),
      OFFICE_INVOICE_DISPLAY_LABELS[invoice.displayStatus],
      invoice.due_date ? formatPdfDate(invoice.due_date) : dash,
      formatPdfMoney(invoice.total, currency),
      formatPdfMoney(invoice.paid_total, currency),
      formatPdfMoney(invoice.balance, currency),
    ]),
    emptyLabel: "لا توجد فواتير على هذا العميل.",
  };
  const paymentsTable: PdfTable = {
    title: "الدفعات المحصّلة",
    columns: [
      { label: "الفاتورة", width: 0.24 },
      { label: "التاريخ", width: 0.22 },
      { label: "الطريقة", width: 0.2 },
      { label: "المرجع", width: 0.18 },
      { label: "المبلغ", width: 0.16 },
    ],
    rows: statement.payments.map((payment) => [
      payment.invoice_number ?? dash,
      formatPdfDate(payment.paid_at),
      methodLabel(payment.method),
      label(payment.reference_number),
      formatPdfMoney(payment.amount, currency),
    ]),
    emptyLabel: "لا توجد دفعات محصّلة.",
  };

  const model: PdfDocumentModel = {
    kind: "statement",
    title: "كشف حساب عميل",
    reference: statement.client.full_name,
    subtitle: null,
    statusLine: `تاريخ الكشف: ${formatPdfDateTime(statement.generatedAt)}`,
    notice: "كشف حساب للاطلاع، وجميع المبالغ بالريال السعودي.",
    meta: [
      { label: "العميل", value: statement.client.full_name },
      { label: "البريد الإلكتروني", value: label(statement.client.email) },
      { label: "الجوال", value: label(statement.client.phone) },
      { label: "عدد الفواتير", value: String(statement.invoices.length) },
    ],
    recipient: {
      title: "كشف حساب",
      lines: [
        statement.client.full_name,
        [
          statement.client.phone ? `جوال: ${statement.client.phone}` : "",
          statement.client.email ? `بريد: ${statement.client.email}` : "",
        ]
          .filter(Boolean)
          .join("  ·  "),
      ],
    },
    tables: [invoicesTable, paymentsTable],
    totals: [
      { label: "إجمالي الفواتير", value: formatPdfMoney(statement.summary.invoiced, currency) },
      { label: "إجمالي المحصل", value: formatPdfMoney(statement.summary.collected, currency) },
      {
        label: "الرصيد المستحق",
        value: formatPdfMoney(statement.summary.outstanding, currency),
        emphasis: true,
      },
      { label: "منه متأخر", value: formatPdfMoney(statement.summary.overdue, currency) },
    ],
    blocks: [],
    signatureSlots: [],
    fileName: `كشف-حساب-${statement.client.full_name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "عميل"}.pdf`,
    showBankDetails: true,
  };
  return { fileName: model.fileName, base64: toBase64(await renderBillingPdf(model, brand)) };
}

/* ------------------------------------------------------------ إيصال دفعة */

export async function renderReceiptPdf(
  supabase: Client,
  organizationId: string,
  detail: InvoiceDetail,
  paymentId: string,
): Promise<PdfPayload> {
  const payment = detail.payments.find((row) => row.id === paymentId);
  if (!payment) throw new Error("الدفعة غير موجودة على هذه الفاتورة.");
  if (payment.voided_at) throw new Error("لا يمكن إصدار إيصال لدفعة مُبطلة.");

  const { brand, showSignature } = await loadOfficeBrand(supabase, organizationId);
  const inv = detail.invoice;
  const currency = inv.currency;
  const reference = `RCP-${payment.id.slice(0, 8).toUpperCase()}`;

  const model: PdfDocumentModel = {
    kind: "receipt",
    title: "إيصال استلام دفعة",
    reference,
    subtitle: inv.title,
    statusLine: `الفاتورة: ${inv.invoice_number ?? "مسودة"}`,
    notice: "إيصال باستلام المبلغ المذكور أدناه عن الفاتورة المشار إليها.",
    meta: [
      { label: "العميل", value: label(inv.client?.full_name) },
      { label: "رقم الفاتورة", value: label(inv.invoice_number) },
      { label: "القضية", value: label(inv.case?.case_title) },
      { label: "تاريخ التحصيل", value: formatPdfDate(payment.paid_at) },
      { label: "طريقة الدفع", value: methodLabel(payment.method) },
      { label: "الرقم المرجعي", value: label(payment.reference_number) },
    ],
    recipient: {
      title: "استُلم من",
      lines: [
        inv.client?.full_name ?? dash,
        [
          inv.client?.phone ? `جوال: ${inv.client.phone}` : "",
          inv.client?.email ? `بريد: ${inv.client.email}` : "",
        ]
          .filter(Boolean)
          .join("  ·  "),
      ],
    },
    tables: [
      {
        columns: [
          { label: "البيان", width: 0.58 },
          { label: "المرجع", width: 0.22 },
          { label: "المبلغ", width: 0.2 },
        ],
        rows: [
          [
            `دفعة عن الفاتورة ${inv.invoice_number ?? "مسودة"}`,
            label(payment.reference_number),
            formatPdfMoney(payment.amount, currency),
          ],
        ],
        emptyLabel: "لا توجد بيانات.",
      },
    ],
    totals: [
      { label: "المبلغ المستلم", value: formatPdfMoney(payment.amount, currency), emphasis: true },
      { label: "إجمالي الفاتورة", value: formatPdfMoney(inv.total, currency) },
      { label: "إجمالي المحصل", value: formatPdfMoney(inv.paid_total, currency) },
      { label: "المتبقي على الفاتورة", value: formatPdfMoney(inv.balance, currency) },
    ],
    blocks: payment.note ? [{ title: "ملاحظات", lines: payment.note.split("\n") }] : [],
    signatureSlots: showSignature
      ? [
          {
            label: "المستلم عن المكتب",
            caption:
              [brand.signatoryName, brand.signatoryTitle].filter(Boolean).join(" — ") ||
              "الاسم والتوقيع",
          },
        ]
      : [],
    fileName: `إيصال-${reference}.pdf`,
    showBankDetails: false,
  };
  return { fileName: model.fileName, base64: toBase64(await renderBillingPdf(model, brand)) };
}