/**
 * محرك توليد مستندات PDF عربية (RTL) للمركز المالي — خادمي فقط.
 *
 * المحرك لا يعرف شيئاً عن نوع المستند: يستقبل نموذجاً موحّداً (PdfDocumentModel)
 * ويرسمه بهوية مِهلة البصرية. الفاتورة وعرض السعر والإيصال وكشف الحساب
 * تُبنى كنماذج في models.server.ts، فتبقى المخرجات متطابقة الشكل والجودة.
 *
 * ملاحظة تقنية: خط المستند يُدمج عبر fontkit، وهو يتولى التشكيل السياقي العربي
 * وقلب مقاطع العربية داخلياً. لذلك يُرسم كل نص على هيئة «مقاطع اتجاهية»:
 * نقسّم السطر إلى مقاطع عربية ومقاطع لاتينية (أرقام، تواريخ، مبالغ، عملات،
 * بريد، جوال، مراجع مستندات)، ثم نوزّعها من اليمين إلى اليسار ونرسم كل مقطع
 * بنصه المنطقي في موضعه المحسوب. هذا يمنع انقلاب التواريخ والأرقام ويحفظ
 * التصاق رمز العملة بالمبلغ.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { shapeArabicRun } from "./arabic.server";
import { drawRiyalGlyph, riyalAdvance } from "./riyal-glyph";
import { fitPdfLogo } from "@/config/brand-logo-sizing";
import { mehlaLogoPngBytes } from "@/lib/pdf/mehla-logo.server";

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
  commercialRegistration?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  documentFooterNote?: string | null;
  /** شعار الجهة المُصدرة (اختياري): يُرسم في رأس المستند بجوار اسمها. */
  logo?: { bytes: Uint8Array; mime: string } | null;
  /** سطر رمادي دقيق أسفل التذييل (اختياري) — لا يحلّ محل تذييل الجهة. */
  footerFineNote?: string | null;
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
  /** بطاقة «موجّه إلى» أعلى المستند (اسم الجهة والمستلم وبيانات تواصله). */
  recipient?: { title: string; lines: string[] } | null;
  /** خطّا توقيع أسفل المستند (الجهة المُصدرة والعميل). */
  signatureSlots?: { label: string; caption?: string | null }[];
  /**
   * بطاقة رمز QR للتحقق العام (اختيارية). تُرسم كمربعات متجهية أسفل المستند،
   * فلا تمر على مسار تشكيل الحروف العربية ولا تؤثر على جودة النص.
   */
  verificationQr?: {
    /** عدد وحدات الرمز في كل ضلع. */
    size: number;
    /** بايت لكل وحدة (1 = داكنة) بطول size × size. */
    modules: Uint8Array;
    /** رقم التحقق العام المطبوع بجوار الرمز. */
    verificationId: string;
    /** رابط صفحة التحقق (يُطبع كنص مساند للمسح اليدوي). */
    url?: string | null;
    /** سطر توضيحي عربي. */
    caption?: string | null;
  } | null;
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
const FOOTER_RESERVE = 52;

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; y: number };

/* -------------------------------------------- تقسيم السطر إلى مقاطع اتجاهية */

type Run = {
  text: string;
  rtl: boolean;
  /** النص كما يُرسم فعلياً: العربية مُشكَّلة ومعكوسة، واللاتينية كما هي. */
  glyphs: string;
};

const RTL_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_CHAR = /[A-Za-z0-9\u00C0-\u024F]/;
/** رموز تسبق مقطعاً لاتينياً وتُعد جزءاً منه (مثل + في أرقام الجوال الدولية). */
const LTR_PREFIX = /[+#]/;
/** رموز تلحق مقطعاً لاتينياً وتُعد جزءاً منه (مثل % في نسبة الضريبة). */
const LTR_SUFFIX = /[%‰°]/;

/**
 * يقسّم النص إلى مقاطع: العربية (rtl) واللاتينية/الرقمية (ltr).
 * المحايدات (مسافات، نقطتان، شرطة، أقواس…) تلتحق بالمقطع المجاور لها من
 * الجهتين إن اتفقا، وإلا فتُعدّ عربية لأن اتجاه المستند الأساسي RTL.
 * بذلك يبقى «2026-08-04» و«SAR 4,600.00» و«MEH-INV-2026-000001» مقطعاً واحداً.
 */
export function splitDirectionalRuns(input: string): Run[] {
  const chars = Array.from(input);
  if (chars.length === 0) return [];

  const classes: Array<"R" | "L" | "N"> = chars.map((char) =>
    RTL_CHAR.test(char) ? "R" : LTR_CHAR.test(char) ? "L" : "N",
  );

  const resolved: Array<"R" | "L"> = classes.map((cls, index) => {
    if (cls !== "N") return cls;
    let before: "R" | "L" | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (classes[i] !== "N") {
        before = classes[i] as "R" | "L";
        break;
      }
    }
    let after: "R" | "L" | undefined;
    for (let i = index + 1; i < classes.length; i += 1) {
      if (classes[i] !== "N") {
        after = classes[i] as "R" | "L";
        break;
      }
    }
    // محايد محاط بلاتيني من الجهتين يبقى داخل المقطع اللاتيني (تاريخ/مبلغ/بريد).
    if (before === "L" && after === "L") return "L";
    // بادئة لاتينية مثل «+» قبل رقم جوال دولي تلتحق بالرقم لا بالنص العربي.
    if (after === "L" && LTR_PREFIX.test(chars[index] as string)) return "L";
    // لاحقة لاتينية مثل «%» بعد رقم تلتحق بالرقم.
    if (before === "L" && LTR_SUFFIX.test(chars[index] as string)) return "L";
    return "R";
  });

  const runs: Run[] = [];
  chars.forEach((char, index) => {
    const rtl = resolved[index] === "R";
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.text += char;
    else runs.push({ text: char, rtl, glyphs: char });
  });

  // المسافات الطرفية تُفصل إلى مقاطع مستقلة: تحفظ الفراغ بموضعه الصحيح ولا
  // تنقلب مع المقطع العربي، فتبقى المسافة بين العربية والأرقام متساوية.
  const normalized: Run[] = [];
  runs.forEach((run) => {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text);
    const [, lead = "", core = "", trail = ""] = match ?? [];
    if (lead) normalized.push({ text: lead, rtl: run.rtl, glyphs: lead });
    if (core)
      normalized.push({
        text: core,
        rtl: run.rtl,
        glyphs: run.rtl ? shapeArabicRun(core) : core,
      });
    if (trail) normalized.push({ text: trail, rtl: run.rtl, glyphs: trail });
  });
  return normalized;
}

/* -------------------------------------------------------- تنسيق أرقام وتواريخ */

/** مبالغ بصيغة لاتينية ثابتة لتفادي أي التباس في الترتيب البصري. */
export function formatPdfMoney(
  amount: number | string | null | undefined,
  currency = "SAR",
): string {
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

/**
 * يقسّم مقطعاً إلى أجزاء نصية وأجزاء «رمز ريال» متجهية، فيُرسم الرمز الرسمي
 * بدل كتابة «SAR» نصاً، مع الحفاظ على القياسات والمحاذاة.
 */
type Segment = { text: string; riyal: boolean };

function segmentsOf(glyphs: string): Segment[] {
  const parts = glyphs.split(/\s?SAR\b/);
  if (parts.length === 1) return [{ text: glyphs, riyal: false }];
  const segments: Segment[] = [];
  parts.forEach((part, index) => {
    if (part.length > 0) segments.push({ text: part, riyal: false });
    if (index < parts.length - 1) segments.push({ text: "", riyal: true });
  });
  return segments;
}

function segmentWidth(font: PDFFont, segment: Segment, size: number): number {
  return segment.riyal ? riyalAdvance(size) : font.widthOfTextAtSize(segment.text, size);
}

function widthOf(ctx: Ctx, text: string, size: number): number {
  return splitDirectionalRuns(text).reduce(
    (total, run) =>
      total +
      segmentsOf(run.glyphs).reduce(
        (sum, segment) => sum + segmentWidth(ctx.font, segment, size),
        0,
      ),
    0,
  );
}

/**
 * يرسم سطراً مختلطاً: المقاطع تُوزّع من اليمين إلى اليسار حسب ترتيبها المنطقي،
 * ويُرسم كل مقطع بنصه الأصلي حتى يتولى fontkit التشكيل والقلب الصحيح للعربية
 * بينما تبقى الأرقام والتواريخ والمبالغ بترتيبها الطبيعي.
 */
function drawLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  leftX: number,
  y: number,
  size: number,
  color: RGB,
): void {
  let cursor = leftX;
  const runs = splitDirectionalRuns(text);
  const segmented = runs.map((run) => segmentsOf(run.glyphs));
  const widths = segmented.map((segments) =>
    segments.reduce((sum, segment) => sum + segmentWidth(font, segment, size), 0),
  );
  const total = widths.reduce((sum, width) => sum + width, 0);
  cursor = leftX + total;
  segmented.forEach((segments, index) => {
    cursor -= widths[index] ?? 0;
    let inner = cursor;
    segments.forEach((segment) => {
      const width = segmentWidth(font, segment, size);
      if (segment.riyal) {
        drawRiyalGlyph(page, inner, y, size, color);
      } else if (segment.text.trim().length > 0) {
        page.drawText(segment.text, { x: inner, y, size, font, color });
      }
      inner += width;
    });
  });
}

function rightText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: RGB = INK,
): void {
  drawLine(ctx.page, ctx.font, text, x - widthOf(ctx, text, size), y, size, color);
}

function leftText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: RGB = INK,
): void {
  drawLine(ctx.page, ctx.font, text, x, y, size, color);
}

/** رمز عملة ثلاثي (SAR) يبقى ملتصقاً بمبلغه عند التقسيم أو القصّ. */
const CURRENCY_TOKEN = /^[A-Z]{3}$/;

/**
 * تقسيم النص إلى وحدات غير قابلة للكسر: «1,150.00 SAR» تُعالج ككلمة واحدة
 * فلا ينتقل رمز العملة إلى سطر آخر ولا يُقتطع بمعزل عن الرقم.
 */
function tokenize(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const tokens: string[] = [];
  words.forEach((word) => {
    const previous = tokens[tokens.length - 1];
    if (previous && CURRENCY_TOKEN.test(word) && /\d/.test(previous)) {
      tokens[tokens.length - 1] = `${previous} ${word}`;
      return;
    }
    tokens.push(word);
  });
  return tokens;
}

/**
 * قصّ على حدود الكلمات فقط، فلا يُقطع مبلغ عن عملته ولا تاريخ ولا مرجع مستند
 * في منتصفه. عند تعذّر ذلك (كلمة واحدة أطول من العرض) نقصّ الحروف كحل أخير.
 */
function truncate(ctx: Ctx, text: string | null | undefined, maxWidth: number, size: number): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (widthOf(ctx, value, size) <= maxWidth) return value;

  const words = tokenize(value);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(" ")}…`;
    if (widthOf(ctx, candidate, size) <= maxWidth) return candidate;
  }

  let single = words[0] ?? "";
  while (single.length > 2 && widthOf(ctx, `${single}…`, size) > maxWidth)
    single = single.slice(0, -1);
  return `${single}…`;
}

/** تقسيم نص طويل إلى أسطر تناسب العرض المتاح. */
function wrap(ctx: Ctx, text: string | null | undefined, maxWidth: number, size: number, maxLines = 6): string[] {
  const words = tokenize(text ?? "");
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

/** شعار مُدمج مع أبعاده المحسوبة داخل حدود رأس المستند. */
type EmbeddedLogo = { image: PDFImage; width: number; height: number };

async function embedLogo(doc: PDFDocument, brand: PdfBrand): Promise<EmbeddedLogo | null> {
  const logo = brand.logo;
  const useCustom = Boolean(logo && logo.bytes.byteLength > 0);
  try {
    const image =
      useCustom && logo
        ? /png/i.test(logo.mime)
          ? await doc.embedPng(logo.bytes)
          : await doc.embedJpg(logo.bytes)
        : await doc.embedPng(mehlaLogoPngBytes());
    return { image, ...fitPdfLogo(image.width, image.height) };
  } catch {
    // شعار تالف أو بصيغة غير مدعومة لا يجوز أن يعطّل إصدار المستند المالي:
    // نعود إلى شعار مِهلة الرسمي، وإذا تعذّر ذلك نصدر المستند بلا شعار.
    if (!useCustom) return null;
    try {
      const fallback = await doc.embedPng(mehlaLogoPngBytes());
      return { image: fallback, ...fitPdfLogo(fallback.width, fallback.height) };
    } catch {
      return null;
    }
  }
}


function header(
  ctx: Ctx,
  model: PdfDocumentModel,
  brand: PdfBrand,
  logo: EmbeddedLogo | null,
): void {
  const right = A4.width - MARGIN;
  const titleWidth = 196;
  const logoSpace = logo ? logo.width + 14 : 0;
  const brandWidth = USABLE - titleWidth - 16 - logoSpace;
  const brandRight = right - logoSpace;
  ctx.page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: SURFACE });
  ctx.page.drawRectangle({ x: 0, y: A4.height - 99, width: A4.width, height: 3, color: GOLD });
  if (logo) {
    ctx.page.drawImage(logo.image, {
      x: right - logo.width,
      y: A4.height - 52 - logo.height / 2,
      width: logo.width,
      height: logo.height,
    });
  }

  // اسم البائع قد يكون طويلاً: نصغّر الحجم ثم نقصّ على حدود الكلمات حتى لا
  // يتجاوز المنطقة المخصصة له ولا يتراكب مع عنوان المستند على اليسار.
  const sellerName = brand.sellerName || "مِهلة | MEHLA";
  const sellerSize =
    widthOf(ctx, sellerName, 18) <= brandWidth
      ? 18
      : widthOf(ctx, sellerName, 14) <= brandWidth
        ? 14
        : 11;
  rightText(
    ctx,
    truncate(ctx, sellerName, brandWidth, sellerSize),
    brandRight,
    A4.height - 46,
    sellerSize,
  );
  if (brand.sellerAddress) {
    rightText(
      ctx,
      truncate(ctx, brand.sellerAddress, brandWidth, 8.5),
      brandRight,
      A4.height - 64,
      8.5,
      MUTED,
    );
  }
  if (brand.taxNumber) {
    rightText(ctx, `الرقم الضريبي: ${brand.taxNumber}`, brandRight, A4.height - 78, 8.5, MUTED);
  }
  if (!brand.taxNumber && brand.commercialRegistration) {
    rightText(
      ctx,
      `السجل التجاري: ${brand.commercialRegistration}`,
      brandRight,
      A4.height - 78,
      8.5,
      MUTED,
    );
  }

  leftText(ctx, truncate(ctx, model.title, titleWidth, 14), MARGIN, A4.height - 46, 14);
  leftText(ctx, truncate(ctx, model.reference, titleWidth, 11), MARGIN, A4.height - 64, 11, MUTED);
  if (model.statusLine) {
    leftText(
      ctx,
      truncate(ctx, model.statusLine, titleWidth, 8.5),
      MARGIN,
      A4.height - 78,
      8.5,
      MUTED,
    );
  }

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

/**
 * بطاقة «موجّه إلى»: إطار مستقل أعلى المستند يُبرز اسم الجهة المستلمة
 * وبيانات تواصلها، وهي أهم عنصر بصري في عرض السعر.
 */
function recipientCard(ctx: Ctx, recipient: { title: string; lines: string[] }): void {
  const lines = recipient.lines.filter((line) => line.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return;
  const right = A4.width - MARGIN;
  const height = 30 + lines.length * 14;
  ensureSpace(ctx, height + 12);
  const top = ctx.y + 10;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - height,
    width: USABLE,
    height,
    color: SURFACE,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  ctx.page.drawRectangle({ x: right - 3, y: top - height, width: 3, height, color: GOLD });
  rightText(ctx, recipient.title, right - 14, top - 20, 8, MUTED);
  lines.forEach((line, index) => {
    rightText(
      ctx,
      truncate(ctx, line, USABLE - 28, index === 0 ? 11.5 : 9),
      right - 14,
      top - 36 - index * 14,
      index === 0 ? 11.5 : 9,
      index === 0 ? INK : MUTED,
    );
  });
  ctx.y = top - height - 20;
}

/** خطوط توقيع رسمية أسفل المستند. */
function signatureBlock(ctx: Ctx, slots: { label: string; caption?: string | null }[]): void {
  if (slots.length === 0) return;
  ensureSpace(ctx, 48);
  const right = A4.width - MARGIN;
  const gap = 24;
  const colWidth = (USABLE - gap * (slots.length - 1)) / slots.length;
  const baseY = ctx.y - 4;
  slots.forEach((slot, index) => {
    const cellRight = right - index * (colWidth + gap);
    rightText(ctx, slot.label, cellRight, baseY, 8.5, INK);
    ctx.page.drawLine({
      start: { x: cellRight - colWidth, y: baseY - 24 },
      end: { x: cellRight, y: baseY - 24 },
      thickness: 0.6,
      color: LINE,
    });
    if (slot.caption) {
      rightText(ctx, truncate(ctx, slot.caption, colWidth, 8), cellRight, baseY - 36, 8, MUTED);
    }
  });
  ctx.y = baseY - 46;
}

/**
 * بطاقة التحقق العام: رمز QR متجهي + رقم التحقق + رابط الصفحة العامة.
 * تُرسم كصندوق مستقل ولا تتصادم مع التذييل لأنها تحترم ensureSpace.
 */
function verificationQrBlock(
  ctx: Ctx,
  qr: NonNullable<PdfDocumentModel["verificationQr"]>,
): void {
  if (qr.size <= 0 || qr.modules.length < qr.size * qr.size) return;
  const boxHeight = 98;
  ensureSpace(ctx, boxHeight + 12);
  const right = A4.width - MARGIN;
  const top = ctx.y;

  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - boxHeight,
    width: USABLE,
    height: boxHeight,
    color: SURFACE,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  ctx.page.drawRectangle({ x: right - 3, y: top - boxHeight, width: 3, height: boxHeight, color: GOLD });

  // رسم الرمز كمربعات متجهية على خلفية بيضاء مع هامش صامت (4 وحدات).
  const boxSide = 74;
  const quiet = 4;
  const unit = boxSide / (qr.size + quiet * 2);
  const qrX = right - 16 - boxSide;
  const qrY = top - boxHeight + (boxHeight - boxSide) / 2;
  ctx.page.drawRectangle({
    x: qrX,
    y: qrY,
    width: boxSide,
    height: boxSide,
    color: rgb(1, 1, 1),
    borderColor: LINE,
    borderWidth: 0.5,
  });
  for (let row = 0; row < qr.size; row++) {
    let run = 0;
    for (let col = 0; col <= qr.size; col++) {
      const dark = col < qr.size && qr.modules[row * qr.size + col] === 1;
      if (dark) {
        run += 1;
        continue;
      }
      if (run > 0) {
        // تُدمج الوحدات المتجاورة في مستطيل واحد لتقليل حجم الملف.
        ctx.page.drawRectangle({
          x: qrX + (quiet + col - run) * unit,
          y: qrY + boxSide - (quiet + row + 1) * unit,
          width: unit * run,
          height: unit,
          color: INK,
        });
        run = 0;
      }
    }
  }

  const textRight = qrX - 16;
  const maxWidth = textRight - MARGIN - 14;
  rightText(ctx, "التحقق من صحة هذا المستند", textRight, top - 26, 10.5, INK);
  rightText(
    ctx,
    truncate(ctx, `رقم التحقق: ${qr.verificationId}`, maxWidth, 9),
    textRight,
    top - 44,
    9,
    INK,
  );
  rightText(
    ctx,
    truncate(
      ctx,
      qr.caption ?? "امسح الرمز للتحقق من رقم المستند وحالته ومطابقته للنسخة النهائية.",
      maxWidth,
      8,
    ),
    textRight,
    top - 60,
    8,
    MUTED,
  );
  if (qr.url) {
    rightText(ctx, truncate(ctx, qr.url, maxWidth, 8), textRight, top - 76, 8, MUTED);
  }

  ctx.y = top - boxHeight - 16;
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
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: right, y: ctx.y },
    thickness: 0.7,
    color: LINE,
  });
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
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: right, y: ctx.y },
      thickness: 0.4,
      color: LINE,
    });
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
      ctx.page.drawRectangle({
        x: right - boxWidth,
        y: ctx.y - 5,
        width: boxWidth,
        height: 20,
        color: SURFACE,
      });
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

function footer(ctx: Ctx, brand: PdfBrand): void {
  const contact = [brand.contactPhone, brand.contactEmail, brand.website]
    .filter((value): value is string => !!value && value.trim().length > 0)
    .join("  ·  ");
  const rawNote = brand.documentFooterNote?.trim()
    ? brand.documentFooterNote.trim()
    : "وثيقة قانونية صادرة وموقعة إلكترونياً من منصة مِهلة";
  
  ctx.doc.getPages().forEach((page, index, pages) => {
    const label = `صفحة ${index + 1} من ${pages.length}`;
    const labelWidth = splitDirectionalRuns(label).reduce(
      (total, run) => total + ctx.font.widthOfTextAtSize(run.glyphs, 7.5),
      0,
    );

    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 18 },
      end: { x: A4.width - MARGIN, y: MARGIN + 18 },
      thickness: 0.5,
      color: LINE,
    });

    // التنويه القانوني في أقصى اليمين (محدد بحد أقصى لمنع التصادم)
    const note = truncate(ctx, rawNote, 320, 7.5);
    const noteWidth = splitDirectionalRuns(note).reduce(
      (total, run) => total + ctx.font.widthOfTextAtSize(run.glyphs, 7.5),
      0,
    );
    drawLine(page, ctx.font, note, A4.width - MARGIN - noteWidth, MARGIN + 6, 7.5, MUTED);

    // ترقيم الصفحات في الوسط تماماً
    drawLine(page, ctx.font, label, (A4.width - labelWidth) / 2, MARGIN + 6, 7.5, MUTED);

    // بيانات التواصل في أقصى اليسار
    if (contact) {
      const contactText = truncate(ctx, contact, 140, 7.5);
      drawLine(page, ctx.font, contactText, MARGIN, MARGIN + 6, 7.5, MUTED);
    }
  });
}

/* --------------------------------------------------------------- الواجهة */

export async function renderBillingPdf(
  model: PdfDocumentModel,
  brand: PdfBrand,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(watermarkFontBytes(), { subset: true });
  doc.setTitle(`${model.title} ${model.reference}`);
  doc.setProducer("MEHLA");
  doc.setCreator("MEHLA");

  const ctx: Ctx = { doc, font, page: doc.addPage([A4.width, A4.height]), y: A4.height - MARGIN };

  header(ctx, model, brand, await embedLogo(doc, brand));
  if (model.recipient) recipientCard(ctx, model.recipient);
  metaGrid(ctx, model.meta);
  model.tables.forEach((spec) => table(ctx, spec));
  totalsBlock(ctx, model.totals);

  const blocks = [...model.blocks];
  if (model.showBankDetails && brand.bankDetails) {
    blocks.push({
      title: "بيانات التحويل البنكي",
      lines: brand.bankDetails.split("\n").slice(0, 6),
    });
  }
  textBlocks(ctx, blocks);
  if (model.signatureSlots && model.signatureSlots.length > 0) {
    signatureBlock(ctx, model.signatureSlots);
  }
  if (model.verificationQr) verificationQrBlock(ctx, model.verificationQr);
  footer(ctx, brand);

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
