import { renderBillingPdf } from "@/lib/billing/pdf/engine.server";
import { invoiceModel, quoteModel, receiptModel, statementModel } from "@/lib/billing/pdf/models.server";
import { writeFileSync } from "node:fs";

const brand = {
  sellerName: "مِهلة | MEHLA",
  sellerAddress: "الرياض، حي الملقا، طريق الأمير محمد بن سلمان",
  taxNumber: "310123456700003",
  bankDetails: "البنك: مصرف الراجحي\nاسم الحساب: شركة مِهلة لتقنية المعلومات\nIBAN: SA0380000000608010167519",
};

const items = Array.from({ length: 14 }, (_, i) => ({
  id: `it-${i}`,
  description: i % 3 === 0 ? `اشتراك باقة الأعمال — ترخيص مستخدم إضافي رقم ${i + 1} لمدة سنة كاملة مع الدعم الفني الممتد` : `خدمة أرشفة إلكترونية للقضايا (${i + 1})`,
  quantity: 1 + (i % 4),
  unitPrice: 450 + i * 37.5,
  discountAmount: i % 5 === 0 ? 50 : 0,
  taxRate: 15,
  lineSubtotal: 0, lineTax: 0, lineTotal: 0,
})).map((it) => {
  const sub = it.quantity * it.unitPrice - it.discountAmount;
  return { ...it, lineSubtotal: sub, lineTax: sub * 0.15, lineTotal: sub * 1.15 };
});
const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
const discount = items.reduce((s, i) => s + i.discountAmount, 0);
const tax = items.reduce((s, i) => s + i.lineTax, 0);
const total = subtotal - discount + tax;

const payments = [
  { id: "3f8c923b-a9bf-4e1a-b097-1bf145bebe56", invoice_id: "x", amount: 3000, currency: "SAR", method: "bank_transfer", provider: "manual", status: "paid", provider_payment_id: null, bank_reference: "TRF-99120", proof_path: null, refunded_amount: 1000, received_at: "2026-07-02T09:30:00Z", paid_at: "2026-07-02T09:35:00Z", submitted_by_email: "ops@mehlalex.com", approved_by_email: "cfo@mehlalex.com", approved_at: "2026-07-02T10:00:00Z", rejection_reason: null, failure_message: null, notes: "تحويل بنكي مع إشعار من العميل بتاريخ 02/07/2026", created_at: "2026-07-02T09:00:00Z" },
  { id: "e058d1f8-5413-47fc-8b07-c6f4f504e2dd", invoice_id: "x", amount: 5165, currency: "SAR", method: "mada", provider: "moyasar", status: "paid", provider_payment_id: "pay_9x8", bank_reference: null, proof_path: null, refunded_amount: 0, received_at: "2026-07-15T12:00:00Z", paid_at: "2026-07-15T12:01:00Z", submitted_by_email: null, approved_by_email: "system@mehlalex.com", approved_at: "2026-07-15T12:02:00Z", rejection_reason: null, failure_message: null, notes: null, created_at: "2026-07-15T12:00:00Z" },
] as never[];

const invoice = {
  id: "inv", number: "MEH-INV-2026-000001", organization_id: "org", organization_name: "مكتب الأثر للمحاماة والاستشارات القانونية",
  customer_name: "مكتب الأثر", customer_legal_name: "شركة الأثر للمحاماة والاستشارات القانونية", customer_email: "billing@alathar-law.sa",
  customer_phone: "+966501234567", billing_address: "جدة، حي الشاطئ", commercial_registration: "4030512345", tax_number: "300123456700003",
  currency: "SAR", subtotal, discount_total: discount, tax_total: tax, total, paid_total: 8165, refunded_total: 1000, remaining: total - 8165 + 1000,
  tax_rate: 15, tax_exempt: false, tax_exemption_reason: null, status: "partially_paid", issued_at: "2026-07-01T08:00:00Z", due_at: "2026-07-15T08:00:00Z",
  created_at: "2026-06-30T08:00:00Z", plan_code: "business", plan_label: "باقة الأعمال — سنوي", payment_method: null, payment_reference: null,
  service_period_start: "2026-07-01", service_period_end: "2027-06-30", paid_at: null, cancelled_at: null, cancellation_reason: null,
  notes: "تُسدد الفاتورة خلال ١٤ يوماً من تاريخ الإصدار، ويُرجى إرسال إشعار التحويل إلى قسم الحسابات مع ذكر رقم الفاتورة MEH-INV-2026-000001 لتسريع المطابقة.",
  internal_notes: null, coupon_code: null, created_by_email: "finance@mehlalex.com",
  items, payments, refunds: [{ id: "r1", payment_id: payments[0]!.id, invoice_id: "inv", amount: 1000, reason: "استرداد جزئي بعد إلغاء ترخيصين", status: "completed", provider: "manual", requested_by_email: "ops@mehlalex.com", approved_by_email: "cfo@mehlalex.com", processed_at: "2026-07-20T10:00:00Z", failure_message: null, created_at: "2026-07-19T10:00:00Z" }] as never[],
  credit_notes: [], notes_log: [],
} as never;

const statement = {
  accountName: "مكتب الأثر للمحاماة والاستشارات القانونية", taxNumber: "300123456700003", commercialRegistration: "4030512345",
  email: "billing@alathar-law.sa", currency: "SAR", from: "2025-08-01T00:00:00Z", to: "2026-07-31T23:59:59Z", openingOutstanding: 2300,
  invoices: Array.from({ length: 16 }, (_, i) => ({ number: `MEH-INV-2026-${String(i + 1).padStart(6, "0")}`, issued_at: `2026-0${(i % 9) + 1}-05T08:00:00Z`, due_at: `2026-0${(i % 9) + 1}-19T08:00:00Z`, status: ["paid", "partially_paid", "overdue", "issued"][i % 4]!, total: 1150 + i * 220, paid_total: i % 4 === 0 ? 1150 + i * 220 : 500, remaining: i % 4 === 0 ? 0 : 650 + i * 220 })),
  payments: Array.from({ length: 12 }, (_, i) => ({ date: `2026-0${(i % 9) + 1}-11T10:00:00Z`, invoice_number: `MEH-INV-2026-${String(i + 1).padStart(6, "0")}`, method: ["bank_transfer", "mada", "credit_card"][i % 3]!, status: "paid", amount: 500 + i * 130 })),
  totals: { invoiced: 45820.5, collected: 31200, refunded: 1000, outstanding: 15620.5 },
};

const receipt = { payment: payments[0]!, refunds: (invoice as never as { refunds: never[] }).refunds, invoice: { number: invoice.number, currency: "SAR", customer_name: invoice.customer_name, customer_legal_name: invoice.customer_legal_name, customer_email: invoice.customer_email, tax_number: invoice.tax_number, organization_name: invoice.organization_name, total, paid_total: 8165, remaining: total - 8165 + 1000 } } as never;

const out = [
  ["invoice", invoiceModel(invoice)],
  ["quote", quoteModel({ ...(invoice as object), status: "draft" } as never)],
  ["receipt", receiptModel(receipt)],
  ["statement", statementModel(statement as never)],
] as const;

for (const [name, model] of out) {
  const bytes = await renderBillingPdf(model as never, brand);
  writeFileSync(`/tmp/pdfqa/${name}.pdf`, bytes);
  console.log(name, model.fileName, bytes.length);
}
