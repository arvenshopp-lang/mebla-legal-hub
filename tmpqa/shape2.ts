import { shapeArabic } from "@/lib/secure-view/arabic-shaper";
for (const c of ["تاريخ الإصدار: 2026-08-04", "بتاريخ 02/07/2026 مع", "2026-08-04", "صالح حتى: 2026-07-15", "من 2025-08-01 إلى 2026-07-31"]) console.log(JSON.stringify(c), "=>", JSON.stringify(shapeArabic(c)));
