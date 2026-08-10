import { salesDocModel } from "@/lib/sales-docs.pdf.server";
import { renderBillingPdf } from "@/lib/billing/pdf/engine.server";
import type { DocumentDetail } from "@/lib/sales-docs.server";

const detail = {
  document: {
    id: "11111111-2222-3333-4444-555555555555", kind: "quote", status: "sent",
    number: "MEH-QT-2026-000012", title: "تطوير منصة واتساب للأعمال — المرحلة الأولى",
    organization_id: null, organization_name: null, company_id: null, contact_id: null,
    currency: "SAR", subtotal: 48000, discount_type: "percent", discount_value: 5,
    discount_amount: 2400, tax_rate: 15, tax_amount: 6840, total: 52440,
    requires_approval: false, locked: false, owner_staff_id: null, created_by: null,
    created_at: "2026-08-10T08:00:00Z", updated_at: "2026-08-10T08:00:00Z",
    sent_at: "2026-08-10T09:00:00Z", decided_at: null, valid_until: "2026-09-10",
    starts_on: "2026-09-15", ends_on: "2026-12-15",
    converted_invoice_id: null, converted_subscription_id: null,
    recipient_name: "أ. سلطان العتيبي", recipient_company: "شركة الواتس للاتصالات",
    recipient_phone: "0551234567", recipient_email: "sultan@alwhats.sa",
    recipient_address: "الرياض — طريق الملك فهد، برج المملكة، الدور 12",
  },
  items: [
    { id: "1", document_id: "1", description: "تحليل المتطلبات وورشة عمل تفصيلية مع فريق العميل", quantity: 1, unit_price: 12000, discount_amount: 0, amount: 12000, sort_order: 0 },
    { id: "2", document_id: "1", description: "تصميم تجربة المستخدم وواجهات عربية RTL", quantity: 2, unit_price: 9000, discount_amount: 1000, amount: 17000, sort_order: 1 },
    { id: "3", document_id: "1", description: "تطوير التكامل مع واتساب للأعمال (WABA) واختبار التسليم", quantity: 1, unit_price: 19000, discount_amount: 0, amount: 19000, sort_order: 2 },
  ],
  events: [], signatures: [],
} as unknown as DocumentDetail;

const model = salesDocModel(detail,
  { companyName: null, contactName: null, contactEmail: null },
  { intro: "يسرّنا في مِهلة تقديم هذا العرض لتنفيذ المشروع وفق النطاق الموضح أدناه.\nيشمل العرض الدعم الفني لمدة ثلاثين يوماً بعد التسليم.",
    terms: "١) يسري هذا العرض حتى التاريخ الموضح أعلاه.\n٢) الدفعة الأولى 50% عند التوقيع والباقي عند التسليم.\n٣) أي نطاق إضافي يُسعَّر بعرض مستقل.",
    signatoryName: "م. عبدالله المهيدب", signatoryTitle: "المدير التنفيذي" });

const bytes = await renderBillingPdf(model, {
  sellerName: "مِهلة | MEHLA للتقنية القانونية", sellerAddress: "الرياض — حي الملقا، مكتب 405",
  taxNumber: "310123456700003", bankDetails: "", commercialRegistration: "1010999888",
  contactPhone: "+966920000123", contactEmail: "sales@mehlalex.com", website: "mehlalex.com",
  signatoryName: "م. عبدالله المهيدب", signatoryTitle: "المدير التنفيذي", documentFooterNote: "",
});
await Bun.write("/tmp/pdfqa/quote.pdf", bytes);
console.log("ok", bytes.length);
