import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
const cases = ["MEH-INV-2026-000001", "رقم الفاتورة MEH-INV-2026-000001 لتسريع", "2026-07-01", "SAR 1,150.00", "الرصيد SAR 1,150.00 فقط"];
for (const c of cases) console.log(JSON.stringify(c), "=>", JSON.stringify(shapeArabic(c)));
