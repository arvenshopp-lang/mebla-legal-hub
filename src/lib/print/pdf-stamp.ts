import { PDFDocument, degrees } from "pdf-lib";
import { renderFooterStrip, renderPageOverlay } from "./watermark";
import { CLASSIFICATION_LABELS, footerLine, type PrintStamp } from "./print.shared";

/**
 * Flattens the dynamic watermark and the audit footer into every page of an
 * exported PDF. The overlay becomes part of the page content stream, so it
 * survives re-printing and cannot be toggled off in a PDF viewer.
 */

const A4 = { width: 595.28, height: 841.89 };

function sizeKey(width: number, height: number) {
  return `${Math.round(width)}x${Math.round(height)}`;
}

export async function stampPdfBytes(source: ArrayBuffer | Uint8Array, stamp: PrintStamp): Promise<Blob> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const overlayCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle % 360;
    const isSideways = rotation === 90 || rotation === 270;
    const visibleWidth = isSideways ? height : width;
    const visibleHeight = isSideways ? width : height;

    const key = sizeKey(visibleWidth, visibleHeight);
    let overlay = overlayCache.get(key);
    if (!overlay) {
      overlay = await pdf.embedPng(await renderPageOverlay(stamp, visibleWidth, visibleHeight));
      overlayCache.set(key, overlay);
    }
    page.drawImage(overlay, { x: 0, y: 0, width, height, opacity: 0.11, rotate: degrees(-rotation) });

    const footer = await renderFooterStrip(stamp, visibleWidth, index + 1, pages.length);
    const footerImage = await pdf.embedPng(footer.bytes);
    page.drawImage(footerImage, {
      x: 0,
      y: 0,
      width: isSideways ? footer.heightPt : width,
      height: isSideways ? height : footer.heightPt,
      opacity: 0.95,
    });
  }

  pdf.setTitle(`${stamp.documentTitle} — ${stamp.documentRef}`);
  pdf.setSubject(`${CLASSIFICATION_LABELS[stamp.classification]} · ${stamp.documentTypeLabel}`);
  pdf.setProducer("مِهلة | MehlaLex");
  pdf.setCreator("مِهلة | MehlaLex");
  pdf.setKeywords([stamp.printRef, stamp.documentRef, `copy-${stamp.copyNumber}`, stamp.sessionId]);
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** يحوّل صورة إلى PDF بحجم A4 ثم يطبّق العلامة المائية والتذييل. */
export async function stampImageAsPdf(
  source: ArrayBuffer,
  mimeType: string,
  stamp: PrintStamp,
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const image = /png/i.test(mimeType) ? await pdf.embedPng(source) : await pdf.embedJpg(source);
  const page = pdf.addPage([A4.width, A4.height]);
  const margin = 36;
  const scale = Math.min((A4.width - margin * 2) / image.width, (A4.height - margin * 2 - 40) / image.height);
  page.drawImage(image, {
    x: (A4.width - image.width * scale) / 2,
    y: (A4.height - image.height * scale) / 2 + 12,
    width: image.width * scale,
    height: image.height * scale,
  });
  const bytes = await pdf.save();
  return stampPdfBytes(bytes, stamp);
}

/** بطاقة تحقق نصية تُستخدم في رسائل التنزيل والسجل. */
export function stampSummary(stamp: PrintStamp): string {
  return footerLine(stamp);
}