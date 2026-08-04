import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { writeFileSync } from "node:fs";
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(watermarkFontBytes(), { subset: true });
const raw = "تاريخ الإصدار: 2026-08-04";
for (const t of [raw, shapeArabic(raw), "2026-08-04"]) {
  const p = doc.addPage([400, 80]);
  p.drawText(t, { x: 20, y: 30, size: 18, font, color: rgb(0, 0, 0) });
}
writeFileSync("/tmp/pdfqa/calib3.pdf", await doc.save());
