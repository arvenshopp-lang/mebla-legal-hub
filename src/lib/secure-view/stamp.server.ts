import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { shapeArabic } from "./arabic-shaper";
import { watermarkFontBytes } from "./watermark-font";

/**
 * Server-side watermarking. Originals never leave the server: the raw bytes are
 * read with the service role, flattened into a fresh PDF whose every page
 * carries the diagonal office/user mark, and only that copy is streamed out.
 */

const ANGLE = -35;
const OPACITY = 0.07;
const TILE_X = 260;
const TILE_Y = 190;
const FONT_SIZE = 11;
const LINE_GAP = 15;
const INK = rgb(0.07, 0.24, 0.2);
const A4 = { width: 595.28, height: 841.89 };

export type StampInput = {
  bytes: Uint8Array;
  kind: "pdf" | "image" | "text";
  mimeType: string | null;
  /** يُستخدم فقط عندما يتعذّر ختم الملف الأصلي (نسخة نصية مائية). */
  fallbackText?: string | null;
  lines: [string, string];
  note: string | null;
  title: string;
};

function drawWatermark(page: PDFPage, font: PDFFont, lines: string[]) {
  const { width, height } = page.getSize();
  const shaped = lines.map((line) => shapeArabic(line));
  const radians = (ANGLE * Math.PI) / 180;
  const reach = Math.ceil(Math.hypot(width, height) / Math.min(TILE_X, TILE_Y)) + 1;

  for (let row = -reach; row <= reach; row += 1) {
    for (let col = -reach; col <= reach; col += 1) {
      const localX = col * TILE_X;
      const localY = row * TILE_Y;
      const baseX = width / 2 + localX * Math.cos(radians) - localY * Math.sin(radians);
      const baseY = height / 2 + localX * Math.sin(radians) + localY * Math.cos(radians);
      if (baseX < -TILE_X || baseX > width + TILE_X) continue;
      if (baseY < -TILE_Y || baseY > height + TILE_Y) continue;

      shaped.forEach((line, index) => {
        const size = index === shaped.length - 1 && shaped.length > 2 ? FONT_SIZE - 2 : FONT_SIZE;
        const textWidth = font.widthOfTextAtSize(line, size);
        const offset = (index - (shaped.length - 1) / 2) * LINE_GAP;
        const x = baseX - (textWidth / 2) * Math.cos(radians) + offset * Math.sin(radians);
        const y = baseY - (textWidth / 2) * Math.sin(radians) - offset * Math.cos(radians);
        page.drawText(line, {
          x,
          y,
          size,
          font,
          color: INK,
          opacity: OPACITY,
          rotate: degrees(ANGLE),
        });
      });
    }
  }
}

/** سطر خفيف أسفل الصفحة يحمل نفس المعلومتين فقط. */
function drawFooter(page: PDFPage, font: PDFFont, lines: [string, string]) {
  const { width } = page.getSize();
  const text = shapeArabic(`${lines[0]} — ${lines[1]}`);
  const size = 7.5;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: Math.max(8, (width - textWidth) / 2),
    y: 12,
    size,
    font,
    color: INK,
    opacity: 0.45,
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(shapeArabic(candidate), size) > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

async function buildTextPdf(text: string, title: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(watermarkFontBytes(), { subset: false });
  const margin = 56;
  const size = 11;
  const lineHeight = 18;
  const maxWidth = A4.width - margin * 2;
  const lines = wrapText(text.trim() || "لا يوجد نص قابل للعرض في هذا الملف.", font, size, maxWidth);

  let page = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - margin;
  const heading = shapeArabic(title);
  page.drawText(heading, {
    x: A4.width - margin - font.widthOfTextAtSize(heading, 14),
    y,
    size: 14,
    font,
    color: INK,
  });
  y -= lineHeight * 2;

  for (const line of lines) {
    if (y < margin + 30) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - margin;
    }
    const shaped = shapeArabic(line);
    page.drawText(shaped, {
      x: A4.width - margin - font.widthOfTextAtSize(shaped, size),
      y,
      size,
      font,
      color: rgb(0.09, 0.13, 0.11),
    });
    y -= lineHeight;
  }
  return pdf;
}

async function buildImagePdf(
  bytes: Uint8Array,
  mimeType: string | null,
): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const isPng = /png/i.test(mimeType ?? "") || bytes[0] === 0x89;
  const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const margin = 32;
  const scale = Math.min(
    (A4.width - margin * 2) / image.width,
    (A4.height - margin * 2) / image.height,
    1,
  );
  const page = pdf.addPage([A4.width, A4.height]);
  page.drawImage(image, {
    x: (A4.width - image.width * scale) / 2,
    y: (A4.height - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
  return pdf;
}

/**
 * ينتج نسخة PDF مائية من أي ملف: PDF كما هو، أو صورة مُدرجة في صفحة، أو
 * نصاً مستخرجاً عندما تكون الصيغة غير قابلة للعرض المباشر.
 */
export async function buildWatermarkedPdf(input: StampInput): Promise<Uint8Array> {
  let pdf: PDFDocument;

  if (input.kind === "pdf") {
    pdf = await PDFDocument.load(input.bytes, { ignoreEncryption: true });
    pdf.registerFontkit(fontkit);
  } else if (input.kind === "image") {
    pdf = await buildImagePdf(input.bytes, input.mimeType);
  } else {
    pdf = await buildTextPdf(input.fallbackText ?? "", input.title);
  }

  const font = await pdf.embedFont(watermarkFontBytes(), { subset: false });
  const marks = input.note ? [...input.lines, input.note] : [...input.lines];

  for (const page of pdf.getPages()) {
    drawWatermark(page, font, marks);
    drawFooter(page, font, input.lines);
  }

  pdf.setTitle(input.title);
  pdf.setProducer("مِهلة | MehlaLex");
  pdf.setCreator("مِهلة | MehlaLex");
  return pdf.save();
}
