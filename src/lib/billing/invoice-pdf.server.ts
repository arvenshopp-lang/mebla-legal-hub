/**
 * توليد فاتورة PDF عربية (RTL) على الخادم فقط.
 * يعتمد على pdf-lib مع خط IBM Plex Sans Arabic المضمّن ومُشكّل الحروف العربية
 * (pdf-lib لا يدعم التشكيل السياقي ولا ترتيب RTL تلقائياً).
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, type InvoiceDetail } from "./billing.shared";
import type { TaxSettings } from "./billing.server";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 44;
const INK = rgb(0.09, 0.24, 0.21);
const MUTED = rgb(0.42, 0.44, 0.42);
const LINE = rgb(0.85, 0.86, 0.84);
const GOLD = rgb(0.788, 0.663, 0.38);
const SURFACE = rgb(0.965, 0.953, 0.933);

type Ctx = { page: PDFPage; font: PDFFont; doc: PDFDocument; y: number };

const ar = (value: string) => shapeArabic(value);

function money(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(amount) ? amount : 0,
  );
  return `${formatted} ${currency === "SAR" ? "SAR" : currency}`;
}

function dateOf(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** كتابة نص من اليمين: x يمثل الحد الأيمن للنص. */
function rightText(ctx: Ctx, text: string, x: number, y: number, size: number, color = INK): void {
  const shaped = ar(text);
  const width = ctx.font.widthOfTextAtSize(shaped, size);
  ctx.page.drawText(shaped, { x: x - width, y, size, font: ctx.font, color });
}

function leftText(ctx: Ctx, text: string, x: number, y: number, size: number, color = INK): void {
  ctx.page.drawText(ar(text), { x, y, size, font: ctx.font, color });
}

function truncate(ctx: Ctx, text: string, maxWidth: number, size: number): string {
  let value = text;
  while (value.length > 4 && ctx.font.widthOfTextAtSize(ar(value), size) > maxWidth) {
    value = value.slice(0, -2);
  }
  return ctx.font.widthOfTextAtSize(ar(value), size) > maxWidth ? `${value}…` : value;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.y = A4.height - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

function header(ctx: Ctx, invoice: InvoiceDetail, tax: TaxSettings): void {
  const right = A4.width - MARGIN;
  ctx.page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: SURFACE });
  ctx.page.drawRectangle({ x: 0, y: A4.height - 99, width: A4.width, height: 3, color: GOLD });

  rightText(ctx, tax.sellerName || "مِهلة | MEHLA", right, A4.height - 46, 18);
  if (tax.sellerAddress) rightText(ctx, tax.sellerAddress, right, A4.height - 64, 8.5, MUTED);
  if (tax.taxNumber) rightText(ctx, `الرقم الضريبي: ${tax.taxNumber}`, right, A4.height - 78, 8.5, MUTED);

  leftText(ctx, "فاتورة ضريبية", MARGIN, A4.height - 46, 14);
  leftText(ctx, invoice.number, MARGIN, A4.height - 64, 11, MUTED);
  leftText(
    ctx,
    `الحالة: ${INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}`,
    MARGIN,
    A4.height - 78,
    8.5,
    MUTED,
  );
  ctx.y = A4.height - 124;
}

function infoGrid(ctx: Ctx, invoice: InvoiceDetail): void {
  const right = A4.width - MARGIN;
  const rows: Array<[string, string]> = [
    ["العميل", invoice.customer_legal_name || invoice.customer_name],
    ["المكتب", invoice.organization_name ?? "—"],
    ["البريد الإلكتروني", invoice.customer_email ?? "—"],
    ["الجوال", invoice.customer_phone ?? "—"],
    ["السجل التجاري", invoice.commercial_registration ?? "—"],
    ["الرقم الضريبي للعميل", invoice.tax_number ?? "—"],
    ["تاريخ الإصدار", dateOf(invoice.issued_at)],
    ["تاريخ الاستحقاق", dateOf(invoice.due_at)],
    ["الباقة", invoice.plan_label ?? "—"],
    [
      "فترة الخدمة",
      invoice.service_period_start
        ? `${dateOf(invoice.service_period_start)} — ${dateOf(invoice.service_period_end)}`
        : "—",
    ],
  ];

  const colWidth = (A4.width - MARGIN * 2) / 2 - 10;
  rows.forEach(([label, value], index) => {
    const column = index % 2;
    if (column === 0) ensureSpace(ctx, 34);
    const baseRight = column === 0 ? right : right - colWidth - 20;
    const top = ctx.y - (column === 0 ? 0 : 0);
    rightText(ctx, label, baseRight, top, 8, MUTED);
    rightText(ctx, truncate(ctx, value || "—", colWidth, 10), baseRight, top - 14, 10);
    if (column === 1 || index === rows.length - 1) ctx.y -= 32;
  });

  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: right, y: ctx.y },
    thickness: 0.7,
    color: LINE,
  });
  ctx.y -= 22;
}

const COLS = [
  { key: "description", label: "البند", width: 0.4 },
  { key: "quantity", label: "الكمية", width: 0.1 },
  { key: "unitPrice", label: "سعر الوحدة", width: 0.14 },
  { key: "discount", label: "الخصم", width: 0.12 },
  { key: "tax", label: "الضريبة", width: 0.12 },
  { key: "total", label: "الإجمالي", width: 0.12 },
] as const;

function itemsTable(ctx: Ctx, invoice: InvoiceDetail): void {
  const usable = A4.width - MARGIN * 2;
  const right = A4.width - MARGIN;

  const drawHead = () => {
    ensureSpace(ctx, 40);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 6, width: usable, height: 22, color: SURFACE });
    let cursor = right;
    COLS.forEach((col) => {
      rightText(ctx, col.label, cursor - 6, ctx.y, 8.5, INK);
      cursor -= usable * col.width;
    });
    ctx.y -= 28;
  };

  drawHead();

  invoice.items.forEach((item) => {
    if (ctx.y - 24 < MARGIN + 120) {
      newPage(ctx);
      drawHead();
    }
    let cursor = right;
    const cells = [
      truncate(ctx, item.description, usable * COLS[0].width - 12, 9),
      String(item.quantity),
      money(item.unitPrice, invoice.currency),
      money(item.discountAmount, invoice.currency),
      money(item.lineTax, invoice.currency),
      money(item.lineTotal, invoice.currency),
    ];
    COLS.forEach((col, index) => {
      rightText(ctx, cells[index] ?? "—", cursor - 6, ctx.y, 9);
      cursor -= usable * col.width;
    });
    ctx.y -= 8;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: right, y: ctx.y },
      thickness: 0.4,
      color: LINE,
    });
    ctx.y -= 16;
  });

  if (invoice.items.length === 0) {
    rightText(ctx, "لا توجد بنود مسجّلة على هذه الفاتورة.", right, ctx.y, 9, MUTED);
    ctx.y -= 20;
  }
}

function totals(ctx: Ctx, invoice: InvoiceDetail): void {
  ensureSpace(ctx, 130);
  const right = A4.width - MARGIN;
  const boxWidth = 240;
  const rows: Array<[string, string, boolean]> = [
    ["الإجمالي قبل الضريبة", money(invoice.subtotal, invoice.currency), false],
    ["الخصم", money(invoice.discount_total, invoice.currency), false],
    [
      invoice.tax_exempt ? "الضريبة (معفاة)" : `ضريبة القيمة المضافة (${invoice.tax_rate}%)`,
      money(invoice.tax_total, invoice.currency),
      false,
    ],
    ["الإجمالي المستحق", money(invoice.total, invoice.currency), true],
    ["المسدّد", money(invoice.paid_total, invoice.currency), false],
    ["المسترد", money(invoice.refunded_total, invoice.currency), false],
    ["المتبقي", money(invoice.remaining, invoice.currency), true],
  ];

  rows.forEach(([label, value, bold]) => {
    if (bold) {
      ctx.page.drawRectangle({ x: right - boxWidth, y: ctx.y - 5, width: boxWidth, height: 20, color: SURFACE });
    }
    rightText(ctx, label, right - 8, ctx.y, bold ? 10 : 9, bold ? INK : MUTED);
    rightText(ctx, value, right - boxWidth + 92, ctx.y, bold ? 10 : 9);
    ctx.y -= bold ? 24 : 18;
  });

  if (invoice.tax_exempt && invoice.tax_exemption_reason) {
    ctx.y -= 4;
    rightText(ctx, `سبب الإعفاء الضريبي: ${invoice.tax_exemption_reason}`, right, ctx.y, 8.5, MUTED);
    ctx.y -= 18;
  }
}

function paymentsBlock(ctx: Ctx, invoice: InvoiceDetail): void {
  const approved = invoice.payments.filter((payment) => payment.status === "paid");
  if (approved.length === 0) return;
  ensureSpace(ctx, 60);
  const right = A4.width - MARGIN;
  rightText(ctx, "الدفعات المعتمدة", right, ctx.y, 10);
  ctx.y -= 18;
  approved.forEach((payment) => {
    ensureSpace(ctx, 20);
    const method = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
    rightText(ctx, `${dateOf(payment.paid_at ?? payment.created_at)} — ${method}`, right, ctx.y, 9, MUTED);
    rightText(ctx, money(payment.amount, invoice.currency), right - 300, ctx.y, 9);
    ctx.y -= 16;
  });
  ctx.y -= 6;
}

function footer(ctx: Ctx, invoice: InvoiceDetail, tax: TaxSettings): void {
  const right = A4.width - MARGIN;
  if (invoice.notes) {
    ensureSpace(ctx, 44);
    rightText(ctx, "ملاحظات", right, ctx.y, 9.5);
    ctx.y -= 15;
    rightText(ctx, truncate(ctx, invoice.notes, A4.width - MARGIN * 2, 9), right, ctx.y, 9, MUTED);
    ctx.y -= 20;
  }
  if (tax.bankDetails) {
    ensureSpace(ctx, 44);
    rightText(ctx, "بيانات التحويل البنكي", right, ctx.y, 9.5);
    ctx.y -= 15;
    tax.bankDetails
      .split("\n")
      .slice(0, 4)
      .forEach((line) => {
        rightText(ctx, truncate(ctx, line, A4.width - MARGIN * 2, 9), right, ctx.y, 9, MUTED);
        ctx.y -= 14;
      });
  }

  const pages = ctx.doc.getPages();
  pages.forEach((page, index) => {
    const label = ar(`صفحة ${index + 1} من ${pages.length}`);
    const width = ctx.font.widthOfTextAtSize(label, 8);
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 22 },
      end: { x: A4.width - MARGIN, y: MARGIN + 22 },
      thickness: 0.5,
      color: LINE,
    });
    page.drawText(label, { x: (A4.width - width) / 2, y: MARGIN + 8, size: 8, font: ctx.font, color: MUTED });
    page.drawText(ar("مستند صادر إلكترونياً من منصة مِهلة"), {
      x: A4.width - MARGIN - ctx.font.widthOfTextAtSize(ar("مستند صادر إلكترونياً من منصة مِهلة"), 8),
      y: MARGIN + 8,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
  });
}

export async function buildInvoicePdf(invoice: InvoiceDetail, tax: TaxSettings): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(watermarkFontBytes(), { subset: true });
  doc.setTitle(`فاتورة ${invoice.number}`);
  doc.setProducer("MEHLA");
  doc.setCreator("MEHLA");

  const page = doc.addPage([A4.width, A4.height]);
  const ctx: Ctx = { doc, page, font, y: A4.height - MARGIN };

  header(ctx, invoice, tax);
  infoGrid(ctx, invoice);
  itemsTable(ctx, invoice);
  totals(ctx, invoice);
  paymentsBlock(ctx, invoice);
  footer(ctx, invoice, tax);

  return doc.save();
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
