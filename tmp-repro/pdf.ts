import { invoiceModel } from "../src/lib/billing/pdf/models.server";
import { renderBillingPdf, toBase64 } from "../src/lib/billing/pdf/engine.server";

const inv: any = {
  id: "x", number: "MEH-INV-2026-000057", organization_id: null, subscription_id: null,
  user_id: null, plan_code: null, plan_label: "باقة اشتراك سنوي لمدة 365 يوم",
  customer_name: "مؤسسة كيوب اب", customer_legal_name: null, customer_email: "zez.aaple4@gmail.com",
  customer_phone: "0533475051", billing_address: "اشتراك سنوي", commercial_registration: "73638448",
  tax_number: "838388383838288192938399", currency: "SAR", tax_rate: 15, tax_exempt: false,
  tax_exemption_reason: null, subtotal: 500, discount_total: 0, tax_total: 75, total: 575,
  paid_total: 0, refunded_total: 0, remaining: 575, status: "overdue",
  service_period_start: "2026-08-10", service_period_end: "2026-08-31",
  issued_at: "2026-08-10T01:31:54.108Z", due_at: "2026-08-10T00:00:00Z", created_at: "2026-08-10T01:31:42Z",
  organization_name: null, notes: null,
  items: [{ id: "i", description: "اشتراك باقة المؤسسات", quantity: 1, unitPrice: 500, discountAmount: 0, taxRate: 15, lineSubtotal: 0, lineTax: 0, lineTotal: 0 }],
  payments: [], refunds: [], credit_notes: [], notes_log: [],
};
const model = invoiceModel(inv);
const bytes = await renderBillingPdf(model, { taxRate: 15 } as any);
console.log("OK", model.fileName, bytes.length, toBase64(bytes).length);
