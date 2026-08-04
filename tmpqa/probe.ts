import { renderBillingPdf } from "@/lib/billing/pdf/engine.server";
import { writeFileSync } from "node:fs";
const model = {
  kind: "invoice" as const,
  title: "اختبار",
  reference: "MEH-INV-2026-000001",
  statusLine: "تاريخ الإصدار: 2026-08-04",
  meta: [{ label: "تاريخ", value: "2026-08-04" }],
  tables: [],
  totals: [{ label: "الإجمالي بتاريخ 2026-08-04", value: "1,150.00 SAR", emphasis: true }],
  blocks: [{ title: "ملاحظات", lines: ["سُددت الفاتورة بتاريخ 02/07/2026 بمبلغ 1,150.00 SAR"] }],
  fileName: "probe.pdf",
};
writeFileSync("/tmp/pdfqa/probe.pdf", await renderBillingPdf(model, { sellerName: "مِهلة" }));
