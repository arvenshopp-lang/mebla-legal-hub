import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { writeFileSync } from "node:fs";

const S = "تاريخ الإصدار: 2026-08-04";
const shaped = shapeArabic(S);
console.log("shaped codepoints:", Array.from(shaped).map((c) => c.codePointAt(0)!.toString(16)).join(" "));
console.log("first char is digit:", /[0-9]/.test(shaped[0]!));

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(watermarkFontBytes(), { subset: true });

// A: single drawText of shaped string
const a = doc.addPage([400, 80]);
a.drawText(shaped, { x: 20, y: 30, size: 18, font, color: rgb(0, 0, 0) });

// B: manual placement — date first at x=20, then rest, using per-piece widths
const b = doc.addPage([400, 80]);
let x = 20;
for (const ch of shaped) {
  b.drawText(ch, { x, y: 30, size: 18, font, color: rgb(0, 0, 0) });
  x += font.widthOfTextAtSize(ch, 18);
}
writeFileSync("/tmp/pdfqa/calib.pdf", await doc.save());
