/**
 * محرك توليد مستندات PDF عربية (RTL) للمركز المالي — خادمي فقط.
 *
 * المحرك لا يعرف شيئاً عن نوع المستند: يستقبل نموذجاً موحّداً (PdfDocumentModel)
 * ويرسمه بهوية مِهلة البصرية. الفاتورة وعرض السعر والإيصال وكشف الحساب
 * تُبنى كنماذج في models.server.ts، فتبقى المخرجات متطابقة الشكل والجودة.
 *
 * ملاحظة تقنية: pdf-lib لا يدعم التشكيل السياقي العربي ولا ترتيب RTL،
 * لذلك يمر كل نص عبر shapeArabic قبل الرسم.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";

/* ------------------------------------------------------------- نموذج المستند */

export type PdfAlign = "right" | "left";

export type PdfMetaRow = { label: string; value: string };

export type PdfColumn = {
  label: string;
  /** نسبة من عرض الجدول (مجموع الأعمدة = 1). */
  width: number;
  align?: PdfAlign;
};

export type PdfTable = {
  title?: string;
  columns: PdfColumn[];
  rows: string[][];
  emptyLabel: string;
  /** صف إجماليات يُبرز أسفل الجدول. */
  footerRow?: string[];
};

export type PdfTotalRow = { label: string; value: string; emphasis?: boolean };

export type PdfTextBlock = { title: string; lines: string[] };

export type PdfBrand = {
  sellerName: string;
  sellerAddress?: string | null;
  taxNumber?: string | null;
  bankDetails?: string | null;
};

export type PdfDocumentModel = {
  /** اسم النوع لأغراض التسمية والتوثيق الداخلي. */
  kind: "invoice" | "quote" | "receipt" | "statement";
  /** العنوان الظاهر أعلى يسار المستند. */
  title: string;
  /** الرقم أو المرجع النظامي. */
  reference: string;
  subtitle?: string | null;
  statusLine?: string | null;
  /** تنويه يظهر أسفل العنوان (مثل: هذا المستند عرض سعر وليس مطالبة بالسداد). */
  notice?: string | null;
  meta: PdfMetaRow[];
  tables: PdfTable[];
  totals: PdfTotalRow[];
  blocks: PdfTextBlock[];
  fileName: string;
  /** إظهار بيانات التحويل البنكي في التذييل (لا تُطبع في الإيصال). */
  showBankDetails?: boolean;
};

/* ------------------------------------------------------------------- الهوية */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 44;
const INK = rgb(0.09, 0.24, 0.21);
const MUTED = rgb(0.42, 0.44, 0.42);
const LINE = rgb(0.85, 0.86, 0.84);
const GOLD = rgb(0.788, 0.663, 0.38);
const SURFACE = rgb(0.965, 0.953, 0.933);

const USABLE = A4.width - MARGIN * 2;
const FOOTER_RESERVE = 96;

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; y: number };

const ar = (value: string): string => shapeArabic(value);

/* -------------------------------------------------------- تنسيق أرقام وتواريخ */

/** مبالغ بصيغة لاتينية ثابتة لتفادي أي التباس في الترتيب البصري. */
export function formatPdfMoney(amount: number | string | null | undefined, currency = "SAR"): string {
  const value = Number(amount ?? 0);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return `${formatted} ${currency}`;
}

/** تاريخ ميلادي بصيغة YYYY-MM-DD — مقطع لاتيني واحد لا يتأثر بالاتجاه. */
export function formatPdfDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** تاريخ ووقت بمقطعين لاتينيين منفصلين بمسافة (لا شرطة بينهما). */
export function formatPdfDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Riyadh",
  }).format(date);
  return `${formatPdfDate(value)} ${time}`;
}

/* ------------------------------------------------------------ أدوات الرسم */

function widthOf(ctx: Ctx, text: string, size: number): number {
  return ctx.font.widthOfTextAtSize(ar(text), size);
}

function rightText(ctx: Ctx, text: string, x: number, y: number, size: number, color: RGB = INK): void {
  const shaped = ar(text);
  ctx.page.drawText(shaped, {
    x: x - ctx.font.widthOfTextAtSize(shaped, size),
    y,
    size,
    font: ctx.font,
    color,
  });
}

function leftText(ctx: Ctx, text: string, x: number, y: number, size: number, color: RGB = INK): void {
  ctx.page.drawText(ar(text), { x, y, size, font: ctx.font, color });
}

function truncate(ctx: Ctx, text: string, maxWidth: number, size: number): string {
  let value = text.replace(/\s+/g, " ").trim();
  if (widthOf(ctx, value, size) <= maxWidth) return value;
  while (value.length > 4 && widthOf(ctx, `${value}…`, size) > maxWidth) value = value.slice(0, -2);
  return `${value}…`;
}

/** تقسيم نص طويل إلى أسطر تناسب العرض المتاح. */
function wrap(ctx: Ctx, text: string, maxWidth: number, size: number, maxLines = 6): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (widthOf(ctx, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current) lines.push(truncate(ctx, current, maxWidth, size));
  return lines.slice(0, maxLines);
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.y = A4.height - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + FOOTER_RESERVE) newPage(ctx);
}

/* -------------------------------------------------------------- الأقسام */

function header(ctx: Ctx, model: PdfDocumentModel, brand: PdfBrand): void {
  const right = A4.width - MARGIN;
  ctx.page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: SURFACE });
  ctx.page.drawRectangle({ x: 0, y: A4.height - 99, width: A4.width, height: 3, color: GOLD });

  rightText(ctx, brand.sellerName || "مِهلة | MEHLA", right, A4.height - 46, 18);
  if (brand.sellerAddress) rightText(ctx, brand.sellerAddress, right, A4.height - 64, 8.5, MUTED);
  if (brand.taxNumber) rightText(ctx, `الرقم الضريبي: ${brand.taxNumber}`, right, A4.height - 78, 8.5, MUTED);

  leftText(ctx, model.title, MARGIN, A4.height - 46, 14);
  leftText(ctx, model.reference, MARGIN, A4.height - 64, 11, MUTED);
  if (model.statusLine) leftText(ctx, model.statusLine, MARGIN, A4.height - 78, 8.5, MUTED);

  ctx.y = A4.height - 122;

  if (model.subtitle) {
    rightText(ctx, model.subtitle, right, ctx.y, 9.5, MUTED);
    ctx.y -= 16;
  }
  if (model.notice) {
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 8, width: USABLE, height: 22, color: SURFACE });
    rightText(ctx, model.notice, right - 8, ctx.y, 9, INK);
    ctx.y -= 30;
  }
}

function metaGrid(ctx: Ctx, meta: PdfMetaRow[]): void {
  if (meta.length === 0) return;
  const right = A4.width - MARGIN;
  const colWidth = USABLE / 2 - 12;

  meta.forEach((row, index) => {
    const column = index % 2;
    if (column === 0) ensureSpace(ctx, 36);
    const baseRight = column === 0 ? right : right - colWidth - 24;
    rightText(ctx, row.label, baseRight, ctx.y, 8, MUTED);
    rightText(ctx, truncate(ctx, row.value || "—", colWidth, 10), baseRight, ctx.y - 14, 10);
    if (column === 1 || index === meta.length - 1) ctx.y -= 32;
  });

  ctx.y -= 4;
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: right, y: ctx.y }, thickness: 0.7, color: LINE });
  ctx.y -= 22;
}

function table(ctx: Ctx, spec: PdfTable): void {
  const right = A4.width - MARGIN;

  // نبدأ الجدول في صفحة تتسع لعنوانه ورأسه وأول صفوفه، فلا يُفصل الرأس عن بياناته.
  const opening = (spec.title ? 18 : 0) + 44 + Math.min(spec.rows.length || 1, 3) * 24;
  ensureSpace(ctx, opening);

  if (spec.title) {
    rightText(ctx, spec.title, right, ctx.y, 10);
    ctx.y -= 18;
  }

  const drawHead = () => {
    ensureSpace(ctx, 44);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 6, width: USABLE, height: 22, color: SURFACE });
    let cursor = right;
    spec.columns.forEach((column) => {
      const cellWidth = USABLE * column.width;
      if (column.align === "left") leftText(ctx, column.label, cursor - cellWidth + 6, ctx.y, 8.5);
      else rightText(ctx, column.label, cursor - 6, ctx.y, 8.5);
      cursor -= cellWidth;
    });
    ctx.y -= 28;
  };

  drawHead();

  if (spec.rows.length === 0) {
    rightText(ctx, spec.emptyLabel, right, ctx.y, 9, MUTED);
    ctx.y -= 22;
    return;
  }

  spec.rows.forEach((row) => {
    if (ctx.y - 26 < MARGIN + FOOTER_RESERVE) {
      newPage(ctx);
      drawHead();
    }
    let cursor = right;
    spec.columns.forEach((column, index) => {
      const cellWidth = USABLE * column.width;
      const text = truncate(ctx, row[index] ?? "—", cellWidth - 12, 9);
      if (column.align === "left") leftText(ctx, text, cursor - cellWidth + 6, ctx.y, 9);
      else rightText(ctx, text, cursor - 6, ctx.y, 9);
      cursor -= cellWidth;
    });
    ctx.y -= 8;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: right, y: ctx.y }, thickness: 0.4, color: LINE });
    ctx.y -= 16;
  });

  if (spec.footerRow) {
    ensureSpace(ctx, 32);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 6, width: USABLE, height: 22, color: SURFACE });
    let cursor = right;
    spec.columns.forEach((column, index) => {
      const cellWidth = USABLE * column.width;
      const text = truncate(ctx, spec.footerRow?.[index] ?? "", cellWidth - 12, 9);
      if (column.align === "left") leftText(ctx, text, cursor - cellWidth + 6, ctx.y, 9);
      else rightText(ctx, text, cursor - 6, ctx.y, 9);
      cursor -= cellWidth;
    });
    ctx.y -= 30;
  }

  ctx.y -= 6;
}

function totalsBlock(ctx: Ctx, rows: PdfTotalRow[]): void {
  if (rows.length === 0) return;
  ensureSpace(ctx, rows.length * 20 + 16);
  const right = A4.width - MARGIN;
  const boxWidth = 250;

  rows.forEach((row) => {
    if (ctx.y - 24 < MARGIN + FOOTER_RESERVE) newPage(ctx);
    if (row.emphasis) {
      ctx.page.drawRectangle({ x: right - boxWidth, y: ctx.y - 5, width: boxWidth, height: 20, color: SURFACE });
    }
    rightText(ctx, row.label, right - 8, ctx.y, row.emphasis ? 10 : 9, row.emphasis ? INK : MUTED);
    leftText(ctx, row.value, right - boxWidth + 8, ctx.y, row.emphasis ? 10 : 9);
    ctx.y -= row.emphasis ? 24 : 18;
  });

  ctx.y -= 6;
}

function textBlocks(ctx: Ctx, blocks: PdfTextBlock[]): void {
  const right = A4.width - MARGIN;
  blocks.forEach((block) => {
    const lines = block.lines.filter((line) => line.trim().length > 0);
    if (lines.length === 0) return;
    ensureSpace(ctx, 34 + lines.length * 14);
    rightText(ctx, block.title, right, ctx.y, 9.5);
    ctx.y -= 15;
    lines.forEach((line) => {
      wrap(ctx, line, USABLE, 9).forEach((wrapped) => {
        if (ctx.y - 14 < MARGIN + FOOTER_RESERVE) newPage(ctx);
        rightText(ctx, wrapped, right, ctx.y, 9, MUTED);
        ctx.y -= 14;
      });
    });
    ctx.y -= 8;
  });
}

function footer(ctx: Ctx): void {
  const note = "مستند صادر إلكترونياً من منصة مِهلة";
  ctx.doc.getPages().forEach((page, index, pages) => {
    const label = ar(`صفحة ${index + 1} / ${pages.length}`);
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 22 },
      end: { x: A4.width - MARGIN, y: MARGIN + 22 },
      thickness: 0.5,
      color: LINE,
    });
    page.drawText(label, {
      x: (A4.width - ctx.font.widthOfTextAtSize(label, 8)) / 2,
      y: MARGIN + 8,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
    const shapedNote = ar(note);
    page.drawText(shapedNote, {
      x: A4.width - MARGIN - ctx.font.widthOfTextAtSize(shapedNote, 8),
      y: MARGIN + 8,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
  });
}

/* --------------------------------------------------------------- الواجهة */

export async function renderBillingPdf(model: PdfDocumentModel, brand: PdfBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(watermarkFontBytes(), { subset: true });
  doc.setTitle(`${model.title} ${model.reference}`);
  doc.setProducer("MEHLA");
  doc.setCreator("MEHLA");

  const ctx: Ctx = { doc, font, page: doc.addPage([A4.width, A4.height]), y: A4.height - MARGIN };

  header(ctx, model, brand);
  metaGrid(ctx, model.meta);
  model.tables.forEach((spec) => table(ctx, spec));
  totalsBlock(ctx, model.totals);

  const blocks = [...model.blocks];
  if (model.showBankDetails && brand.bankDetails) {
    blocks.push({ title: "بيانات التحويل البنكي", lines: brand.bankDetails.split("\n").slice(0, 6) });
  }
  textBlocks(ctx, blocks);
  footer(ctx);

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
