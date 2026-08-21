import {
  footerLine,
  isRestricted,
  watermarkLines,
  CLASSIFICATION_STAMPS,
  type PrintStamp,
} from "./print.shared";

/**
 * Watermark rendering. Two outputs share one source of truth (`watermarkLines`):
 * an SVG tile for browser printing, and a raster overlay for PDF export where
 * the mark must be flattened into the page content so it cannot be removed.
 */

const ANGLE_DEG = -35;
const TILE = 300; // ~8 سم بين كل علامة وأخرى

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

/** يشمل الفاصلة العليا لأن encodeURIComponent لا يشفّرها، فتكسر url('…') في CSS. */
function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

/** بلاطة SVG قطرية مكررة تُستخدم كخلفية للطباعة من المتصفح. */
export function watermarkTileDataUrl(stamp: PrintStamp, opacity = 0.1): string {
  const lines = watermarkLines(stamp);
  const lineHeight = 15;
  const blockHeight = lines.length * lineHeight;
  const text = lines
    .map(
      (line, index) =>
        `<text x="0" y="${index * lineHeight - blockHeight / 2 + lineHeight}" font-family="'IBM Plex Sans Arabic',sans-serif" font-size="11" fill="#123C32" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">
  <g opacity="${opacity}" transform="translate(${TILE / 2} ${TILE / 2}) rotate(${ANGLE_DEG})">${text}</g>
</svg>`;
  return toDataUrl(svg);
}

/** ختم التصنيف (سرّي / سرّي للغاية) في منتصف الصفحة. */
export function classificationStampDataUrl(stamp: PrintStamp, opacity = 0.14): string | null {
  const label = CLASSIFICATION_STAMPS[stamp.classification];
  if (!label || !isRestricted(stamp.classification)) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360">
  <g opacity="${opacity}" transform="translate(450 180) rotate(${ANGLE_DEG})">
    <rect x="-380" y="-70" width="760" height="140" rx="18" fill="none" stroke="#8A1F1F" stroke-width="8"/>
    <text x="0" y="18" font-family="'IBM Plex Sans Arabic',sans-serif" font-size="68" font-weight="700" fill="#8A1F1F" letter-spacing="6" text-anchor="middle">${escapeXml(label)}</text>
  </g>
</svg>`;
  return toDataUrl(svg);
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("تعذّر تجهيز العلامة المائية.");
  return new Uint8Array(await blob.arrayBuffer());
}

function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز العلامة المائية.");
  return { canvas, ctx };
}

const FONT_STACK = '"IBM Plex Sans Arabic", sans-serif';

/**
 * علامة مائية نقطية بمقاس الصفحة، تُدمج داخل محتوى صفحة PDF.
 * scale = 2 لضمان حدة الطباعة عند 150dpi وما فوق.
 */
export async function renderPageOverlay(
  stamp: PrintStamp,
  widthPt: number,
  heightPt: number,
  scale = 2,
): Promise<Uint8Array> {
  const { canvas, ctx } = createCanvas(widthPt * scale, heightPt * scale);
  const lines = watermarkLines(stamp);
  const lineHeight = 15 * scale;
  const tile = TILE * scale * 0.75;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((ANGLE_DEG * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#123C32";
  ctx.font = `${11 * scale}px ${FONT_STACK}`;
  const reach = Math.ceil(Math.hypot(canvas.width, canvas.height) / tile) + 1;
  for (let row = -reach; row <= reach; row += 1) {
    for (let col = -reach; col <= reach; col += 1) {
      const cx = col * tile;
      const cy = row * tile;
      lines.forEach((line, index) => {
        ctx.fillText(line, cx, cy + index * lineHeight - (lines.length * lineHeight) / 2);
      });
    }
  }
  ctx.restore();

  const label = CLASSIFICATION_STAMPS[stamp.classification];
  if (label && isRestricted(stamp.classification)) {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((ANGLE_DEG * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.min(canvas.width, canvas.height) * 0.085;
    ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
    ctx.strokeStyle = "#8A1F1F";
    ctx.lineWidth = Math.max(2, fontSize * 0.09);
    const textWidth = ctx.measureText(label).width;
    ctx.strokeRect(-textWidth / 2 - fontSize * 0.5, -fontSize, textWidth + fontSize, fontSize * 2);
    ctx.fillStyle = "#8A1F1F";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  return canvasToPngBytes(canvas);
}

/** تذييل نقطي لكل صفحة يحتوي رقم الصفحة والبصمة الكاملة (RTL). */
export async function renderFooterStrip(
  stamp: PrintStamp,
  widthPt: number,
  page: number,
  total: number,
  scale = 3,
): Promise<{ bytes: Uint8Array; heightPt: number }> {
  const heightPt = 26;
  const { canvas, ctx } = createCanvas(widthPt * scale, heightPt * scale);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.strokeStyle = "#123C32";
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(24 * scale, 4 * scale);
  ctx.lineTo(canvas.width - 24 * scale, 4 * scale);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#123C32";
  ctx.font = `${7.5 * scale}px ${FONT_STACK}`;
  ctx.fillText(footerLine(stamp, page, total), canvas.width / 2, heightPt * scale * 0.62);
  return { bytes: await canvasToPngBytes(canvas), heightPt };
}
