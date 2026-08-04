import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { writeFileSync } from "node:fs";
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(watermarkFontBytes(), { subset: true });
const page = doc.addPage([600, 300]);
const s = "تاريخ الإصدار: 2026-08-04";
const variants: [string, string][] = [["raw", s], ["once", shapeArabic(s)], ["twice", shapeArabic(shapeArabic(s))]];
variants.forEach(([name, text], i) => {
  page.drawText(text, { x: 40, y: 240 - i * 50, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText(name, { x: 480, y: 240 - i * 50, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
});
writeFileSync("/tmp/pdfqa/probe2.pdf", await doc.save());
