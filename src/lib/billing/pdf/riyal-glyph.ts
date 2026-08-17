/**
 * رمز الريال السعودي الرسمي كمسار متجهي داخل مستندات PDF.
 * المصدر البصري نفسه المستخدم في الواجهة (RIYAL_PATHS) حتى تتطابق
 * الفواتير المصدَّرة مع ما يراه المستخدم على الشاشة.
 */
import type { PDFPage, RGB } from "pdf-lib";
import { RIYAL_PATHS } from "@/components/ui/riyal";

/** أبعاد صندوق الرمز الأصلي (viewBox). */
const GLYPH_WIDTH = 1124.14;
const GLYPH_HEIGHT = 1256.39;

/** نسبة ارتفاع الرمز إلى مقاس الخط — مماثلة لـ 0.82em في الواجهة. */
const HEIGHT_RATIO = 0.72;
/** مسافة فاصلة لطيفة بين المبلغ والرمز. */
const GAP_RATIO = 0.18;

/** العرض الكلي الذي يشغله الرمز (بما فيه المسافة الفاصلة) بمقاس خط معيّن. */
export function riyalAdvance(size: number): number {
  const height = size * HEIGHT_RATIO;
  return (height * GLYPH_WIDTH) / GLYPH_HEIGHT + size * GAP_RATIO;
}

/**
 * يرسم الرمز بحيث يجلس على خط القاعدة (baseline) عند الإحداثي `x`
 * مع احتساب المسافة الفاصلة على يسار المبلغ.
 */
export function drawRiyalGlyph(
  page: PDFPage,
  x: number,
  baselineY: number,
  size: number,
  color: RGB,
): void {
  const height = size * HEIGHT_RATIO;
  const scale = height / GLYPH_HEIGHT;
  const originX = x + size * GAP_RATIO * 0.5;
  // drawSvgPath يبدأ من أعلى المسار ويتجه للأسفل، فنرفع نقطة البداية بارتفاع الرمز.
  const originY = baselineY + height;
  RIYAL_PATHS.forEach((path) => {
    page.drawSvgPath(path, { x: originX, y: originY, scale, color, borderWidth: 0 });
  });
}