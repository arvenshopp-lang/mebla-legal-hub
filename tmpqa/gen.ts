import { writeFileSync, mkdirSync } from "node:fs";
import { renderBillingPdf } from "@/lib/billing/pdf/engine.server";
import { invoiceModel, quoteModel, receiptModel, statementModel } from "@/lib/billing/pdf/models.server";
import type { InvoiceDetail, PaymentRow, RefundRow } from "@/lib/billing/billing.shared";

mkdirSync("/tmp/pdfqa", { recursive: true });

const brand = {
  sellerName: "مؤسسة مِهلة لتقنية المعلومات القانونية والاستشارات النظامية",
  sellerAddress: "الرياض — حي الملقا، طريق الأمير محمد بن سلمان، مبنى ١٢٤، الدور الرابع",
  taxNumber: "310123456700003",
  bankDetails: "البنك الأهلي السعودي\nاسم الحساب: مؤسسة مِهلة لتقنية المعلومات\nIBAN: SA0380000000608010167519\nرقم الحساب: 60801016751900",
};

const LONG_CUSTOMER = "شركة المحاماة والاستشارات القانونية الدولية المتحدة للخدمات النظامية المتكاملة";
const LONG_ORG = "مكتب الأستاذ عبدالرحمن بن محمد العتيبي للمحاماة والاستشارات القانونية بالمملكة العربية السعودية";

const item = (index: number) => ({
  id: `item-${index}`,
  description:
    index % 3 === 0
      ? `اشتراك منصة مِهلة — الباقة المؤسسية للفترة ${2026}-08 حتى 2027-07 (بند رقم ${index + 1})`
      : `خدمة استشارية قانونية رقم ${index + 1} بمبلغ SAR 400.00 لكل ساعة عمل`,
  quantity: (index % 4) + 1,
  unitPrice: 400 + index * 25,
  discountAmount: index % 5 === 0 ? 50 : 0,
  lineTax: 60 + index,
  lineTotal: 460 + index * 30,
});

const payment = (index: number, status: PaymentRow["status"] = "paid"): PaymentRow =>
  ({
    id: `9f8e7d6c-1234-4a5b-8c9d-00000000000${index}`,
    invoice_id: "inv-1",
    amount: 1150 + index * 100,
    currency: "SAR",
    method: index % 2 === 0 ? "bank_transfer" : "mada",
    status,
    provider: "manual",
    provider_payment_id: `PAY-2026-00${index}`,
    bank_reference: `TRX-88213${index}`,
    paid_at: `2026-08-0${(index % 8) + 1}T15:30:00Z`,
    received_at: `2026-08-0${(index % 8) + 1}T15:30:00Z`,
    created_at: `2026-08-0${(index % 8) + 1}T15:30:00Z`,
    approved_at: `2026-08-0${(index % 8) + 1}T18:30:00Z`,
    approved_by_email: "finance.manager@mehlalex.com",
    notes: "سُدد المبلغ بحوالة بنكية من حساب العميل رقم SA0380000000608010167519 بتاريخ 2026-08-04 18:30 بمبلغ SAR 1,150.00",
  }) as unknown as PaymentRow;

const refund: RefundRow = {
  id: "ref-1",
  amount: 250,
  status: "completed",
  reason: "استرداد جزئي لتعديل مدة الاشتراك من 12 شهراً إلى 10 أشهر بموجب الطلب رقم REQ-2026-0142",
  processed_at: "2026-08-04T09:15:00Z",
  created_at: "2026-08-03T09:15:00Z",
} as unknown as RefundRow;

const invoice = (itemCount: number, opts: Partial<InvoiceDetail> = {}): InvoiceDetail =>
  ({
    id: "inv-1",
    number: "MEH-INV-2026-000001",
    status: "partially_paid",
    currency: "SAR",
    customer_name: LONG_CUSTOMER,
    customer_legal_name: LONG_CUSTOMER,
    customer_email: "billing.department@united-legal-consultants.com.sa",
    customer_phone: "+966512345678",
    commercial_registration: "1010456789",
    tax_number: "300123456700003",
    organization_name: LONG_ORG,
    plan_label: "الباقة المؤسسية السنوية",
    issued_at: "2026-08-04T12:00:00Z",
    due_at: "2026-09-03T12:00:00Z",
    created_at: "2026-08-01T12:00:00Z",
    service_period_start: "2026-08-01",
    service_period_end: "2027-07-31",
    subtotal: 24000,
    discount_total: 500,
    tax_rate: 15,
    tax_exempt: false,
    tax_exemption_reason: null,
    tax_total: 3525,
    total: 27025,
    paid_total: 4600,
    refunded_total: 250,
    remaining: 22425,
    notes:
      "تُسدد الفاتورة خلال 30 يوماً من تاريخ الإصدار 2026-08-04 عبر تحويل بنكي إلى الحساب IBAN: SA0380000000608010167519، وللاستفسار يرجى التواصل عبر البريد billing@mehlalex.com أو الجوال +966555000111 من الأحد إلى الخميس 09:00 — 17:00.",
    created_by_email: "finance.manager@mehlalex.com",
    items: Array.from({ length: itemCount }, (_, index) => item(index)),
    payments: [payment(1), payment(2), payment(3, "pending")],
    refunds: [refund],
    credit_notes: [],
    notes_log: [],
    ...opts,
  }) as unknown as InvoiceDetail;

const statement = {
  accountName: LONG_ORG,
  taxNumber: "310123456700003",
  commercialRegistration: "1010456789",
  email: "accounts@mehlalex.com",
  currency: "SAR",
  from: "2025-08-01T00:00:00Z",
  to: "2026-07-31T23:59:59Z",
  openingOutstanding: 8400,
  invoices: Array.from({ length: 34 }, (_, index) => ({
    number: `MEH-INV-2026-${String(index + 1).padStart(6, "0")}`,
    issued_at: `2026-0${(index % 8) + 1}-1${index % 9}T10:00:00Z`,
    due_at: `2026-0${(index % 8) + 1}-2${index % 8}T10:00:00Z`,
    status: index % 3 === 0 ? "paid" : index % 3 === 1 ? "partially_paid" : "overdue",
    total: 1150 + index * 75,
    paid_total: index % 3 === 0 ? 1150 + index * 75 : 500,
    remaining: index % 3 === 0 ? 0 : 650 + index * 75,
  })),
  payments: Array.from({ length: 22 }, (_, index) => ({
    date: `2026-0${(index % 8) + 1}-1${index % 9}T18:30:00Z`,
    invoice_number: `MEH-INV-2026-${String(index + 1).padStart(6, "0")}`,
    method: index % 2 === 0 ? "bank_transfer" : "mada",
    status: "paid",
    amount: 1150 + index * 50,
  })),
  totals: { invoiced: 68450, collected: 41200, refunded: 250, outstanding: 27000 },
};

const docs: Array<[string, ReturnType<typeof invoiceModel>]> = [
  ["invoice", invoiceModel(invoice(14))],
  ["quote", quoteModel(invoice(9, { status: "draft", paid_total: 0, refunded_total: 0, remaining: 27025, payments: [], refunds: [] } as Partial<InvoiceDetail>))],
  ["receipt", receiptModel({
    payment: payment(1),
    refunds: [refund],
    invoice: {
      number: "MEH-INV-2026-000001",
      currency: "SAR",
      customer_name: LONG_CUSTOMER,
      customer_legal_name: LONG_CUSTOMER,
      customer_email: "billing.department@united-legal-consultants.com.sa",
      tax_number: "300123456700003",
      organization_name: LONG_ORG,
      total: 27025,
      paid_total: 4600,
      remaining: 22425,
    },
  })],
  ["statement", statementModel(statement)],
];

for (const [name, model] of docs) {
  const bytes = await renderBillingPdf(model, brand);
  writeFileSync(`/tmp/pdfqa/${name}.pdf`, bytes);
  console.log(name, "bytes:", bytes.length, "file:", model.fileName);
}
