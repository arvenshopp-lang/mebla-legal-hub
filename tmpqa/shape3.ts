import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
import { formatPdfDate } from "@/lib/billing/pdf/engine.server";
const d = formatPdfDate(new Date().toISOString());
const s = `تاريخ الإصدار: ${d}`;
console.log(JSON.stringify(d), Array.from(d).map(c=>c.codePointAt(0)!.toString(16)).join(" "));
console.log(JSON.stringify(s), "=>", JSON.stringify(shapeArabic(s)));
