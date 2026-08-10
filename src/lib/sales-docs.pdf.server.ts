/**
 * نموذج PDF لمستندات البيع (عرض سعر / مقترح / عقد) — يعتمد محرك المركز المالي
 * الموحّد (billing/pdf/engine.server) بلا أي تعديل عليه.
 */
import {
  formatPdfDate,
  formatPdfMoney,
  type PdfDocumentModel,
  type PdfMetaRow,
  type PdfTable,
  type PdfTotalRow,
} from "@/lib/billing/pdf/engine.server";
import { KIND_LABELS, STATUS_LABELS } from "@/lib/sales-docs.shared";
import type { DocumentDetail } from "@/lib/sales-docs.server";

const dash = "—";
const label = (value: string | null | undefined): string => (value && value.trim() ? value : dash);

function meta(
  detail: DocumentDetail,
  extra: { companyName: string | null; contactName: string | null; contactEmail: string | null },
): PdfMetaRow[] {
  const doc = detail.document;
  return [
    { label: "تاريخ الإصدار", value: formatPdfDate(doc.created_at) },
    { label: "صالح حتى", value: doc.valid_until ? formatPdfDate(doc.valid_until) : dash },
    {
      label: "مدة السريان",
      value: doc.starts_on
        ? `من ${formatPdfDate(doc.starts_on)} إلى ${formatPdfDate(doc.ends_on)}`
        : dash,
    },
    { label: "جهة الاتصال", value: label(doc.recipient_name ?? extra.contactName) },
    { label: "البريد الإلكتروني", value: label(doc.recipient_email ?? extra.contactEmail) },
    { label: "الجوال", value: label(doc.recipient_phone) },
    { label: "العملة", value: doc.currency },
  ];
}

/**
 * بطاقة «موجّه إلى»: تعتمد بيانات المستلم المكتوبة على المستند إن وُجدت،
 * وإلا فبيانات الشركة أو المكتب المرتبط. هذا يسمح بإصدار عرض سعر لجهة
 * خارجية دون إضافتها مسبقاً في سجلات العملاء.
 */
function recipient(
  detail: DocumentDetail,
  extra: { companyName: string | null; contactName: string | null; contactEmail: string | null },
): { title: string; lines: string[] } {
  const doc = detail.document;
  const primary =
    doc.recipient_company ?? extra.companyName ?? doc.organization_name ?? doc.recipient_name ?? "";
  const person = doc.recipient_name ?? extra.contactName;
  const email = doc.recipient_email ?? extra.contactEmail;
  return {
    title: "موجّه إلى",
    lines: [
      primary || "—",
      person ? `عناية: ${person}` : "",
      doc.recipient_address ?? "",
      [doc.recipient_phone ? `جوال: ${doc.recipient_phone}` : "", email ? `بريد: ${email}` : ""]
        .filter(Boolean)
        .join("  ·  "),
    ],
  };
}

function itemsTable(detail: DocumentDetail): PdfTable {
  const currency = detail.document.currency;
  return {
    columns: [
      { label: "البند", width: 0.4 },
      { label: "الكمية", width: 0.09 },
      { label: "سعر الوحدة", width: 0.17 },
      { label: "الخصم", width: 0.17 },
      { label: "الإجمالي", width: 0.17 },
    ],
    rows: detail.items.map((item) => [
      item.description,
      String(item.quantity),
      formatPdfMoney(item.unit_price, currency),
      formatPdfMoney(item.discount_amount, currency),
      formatPdfMoney(item.amount, currency),
    ]),
    emptyLabel: "لا توجد بنود مسجّلة على هذا المستند.",
  };
}

function signaturesTable(detail: DocumentDetail): PdfTable | null {
  if (detail.signatures.length === 0) return null;
  return {
    title: "التوقيعات الإلكترونية",
    columns: [
      { label: "الموقّع", width: 0.3 },
      { label: "الصفة", width: 0.2 },
      { label: "التاريخ", width: 0.2 },
      { label: "بصمة التحقق (SHA-256)", width: 0.3 },
    ],
    rows: detail.signatures.map((s) => [
      `${s.signer_name} <${s.signer_email}>`,
      label(s.signer_role),
      formatPdfDate(s.signed_at),
      s.evidence_hash.slice(0, 32),
    ]),
    emptyLabel: "لا توجد توقيعات.",
  };
}

function totals(detail: DocumentDetail): PdfTotalRow[] {
  const d = detail.document;
  return [
    { label: "الإجمالي قبل الخصم", value: formatPdfMoney(d.subtotal, d.currency) },
    { label: "الخصم", value: formatPdfMoney(d.discount_amount, d.currency) },
    {
      label: `ضريبة القيمة المضافة ${d.tax_rate}%`,
      value: formatPdfMoney(d.tax_amount, d.currency),
    },
    { label: "الإجمالي", value: formatPdfMoney(d.total, d.currency), emphasis: true },
  ];
}

export function salesDocModel(
  detail: DocumentDetail,
  parties: { companyName: string | null; contactName: string | null; contactEmail: string | null },
  extras: {
    intro: string | null;
    terms: string | null;
    signatoryName?: string | null;
    signatoryTitle?: string | null;
  },
): PdfDocumentModel {
  const doc = detail.document;
  const reference = doc.number ?? `مسودة-${doc.id.slice(0, 8)}`;
  const signatures = signaturesTable(detail);
  const blocks: PdfDocumentModel["blocks"] = [];
  if (extras.intro) blocks.push({ title: "مقدمة", lines: extras.intro.split("\n") });
  if (extras.terms) blocks.push({ title: "الشروط والأحكام", lines: extras.terms.split("\n") });

  return {
    kind: "quote",
    title: KIND_LABELS[doc.kind],
    reference,
    subtitle: doc.title,
    statusLine: `الحالة: ${STATUS_LABELS[doc.status]}`,
    notice:
      doc.kind === "contract"
        ? "هذا المستند عقد بين الطرفين ولا يُعد فاتورة ضريبية."
        : "هذا المستند عرض سعر ولا يُعد مطالبة بالسداد ولا فاتورة ضريبية.",
    meta: meta(detail, parties),
    recipient: recipient(detail, parties),
    tables: signatures ? [itemsTable(detail), signatures] : [itemsTable(detail)],
    totals: totals(detail),
    blocks,
    signatureSlots:
      detail.signatures.length > 0
        ? []
        : [
            {
              label: "عن الجهة المُصدرة",
              caption:
                [extras.signatoryName, extras.signatoryTitle].filter(Boolean).join(" — ") ||
                "الاسم والتوقيع",
            },
            { label: "عن العميل", caption: "الاسم والتوقيع والتاريخ" },
          ],
    fileName: `${reference}.pdf`,
    showBankDetails: false,
  };
}
