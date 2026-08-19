import { renderBillingPdf } from "../../src/lib/billing/pdf/engine.server";
import { buildQrMatrix, buildVerificationUrl } from "../../src/lib/pdf/verification-qr.server";
const url = buildVerificationUrl("MHL-A1B2C-3D4E5");
const m = buildQrMatrix(url)!;
const bytes = await renderBillingPdf(
  {
    kind: "عقد أتعاب محاماة",
    number: "CT-2026-0007",
    issuedAt: new Date().toISOString(),
    title: "عقد أتعاب محاماة واستشارات قانونية",
    meta: [{ label: "رقم العقد", value: "CT-2026-0007" }, { label: "الحالة", value: "موقّع إلكترونياً" }],
    tables: [], sections: [{ heading: "البند الأول: نطاق الأعمال", body: "يتولى الطرف الأول تمثيل الطرف الثاني أمام المحاكم المختصة في مدينة الرياض وفق الأنظمة السعودية." }],
    signatureSlots: [{ label: "توقيع الطرف الأول (المكتب)", caption: "المحامي المعتمد" }, { label: "توقيع الطرف الثاني (الموكل)", caption: "موكل الاختبار" }],
    verificationQr: { size: m.size, modules: m.modules, verificationId: "MHL-A1B2C-3D4E5", url, caption: "امسح الرمز للتحقق من رقم العقد وحالته ومطابقته للنسخة النهائية." },
  } as never,
  { name: "مكتب اختبار للمحاماة", city: "الرياض", identifier: "1010101010" } as never,
);
await Bun.write("/tmp/qrcheck/out.pdf", bytes);
console.log("bytes", bytes.byteLength);
