import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Download, FileText, Mail, Receipt } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Btn, ErrorBlock, FormField, SectionCard, SectionLoader, Td, Th, inputCls } from "@/lib/list-utils";
import {
  billingAddNote,
  billingInvoiceDetail,
  billingInvoicePdf,
  billingQuotePdf,
  billingReceiptPdf,
  billingSendInvoiceEmail,
  billingStatementPdf,
} from "@/lib/billing/billing.functions";
import { downloadPdfPayload, type PdfPayload } from "@/lib/billing/download-pdf";
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, type InvoiceDetail } from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { InvoiceStatusBadge, Money, PaymentStatusBadge, RefundStatusBadge } from "@/components/admin/billing/shared";
import { useState } from "react";

export const Route = createFileRoute("/mehla-admin/billing/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الفاتورة · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [note, setNote] = useState("");

  const detailFn = useServerFn(billingInvoiceDetail);
  const pdfFn = useServerFn(billingInvoicePdf);
  const quoteFn = useServerFn(billingQuotePdf);
  const receiptFn = useServerFn(billingReceiptPdf);
  const statementFn = useServerFn(billingStatementPdf);
  const emailFn = useServerFn(billingSendInvoiceEmail);
  const noteFn = useServerFn(billingAddNote);

  const query = useQuery({ queryKey: ["billing-invoice", id], queryFn: () => detailFn({ data: { id } }) });
  const invoice = query.data as InvoiceDetail | undefined;

  const pdf = useMutation({
    mutationFn: () => pdfFn({ data: { id } }),
    onSuccess: (result) => downloadPdfPayload(result as PdfPayload),
    onError: (error: Error) => toast.error(error.message),
  });

  const quote = useMutation({
    mutationFn: () => quoteFn({ data: { id } }),
    onSuccess: (result) => downloadPdfPayload(result as PdfPayload),
    onError: (error: Error) => toast.error(error.message),
  });

  const receipt = useMutation({
    mutationFn: (paymentId: string) => receiptFn({ data: { paymentId } }),
    onSuccess: (result) => downloadPdfPayload(result as PdfPayload),
    onError: (error: Error) => toast.error(error.message),
  });

  const statement = useMutation({
    mutationFn: () => {
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
      return statementFn({
        data: {
          organizationId: invoice?.organization_id ?? "",
          from: from.toISOString(),
          to: to.toISOString(),
        } as never,
      });
    },
    onSuccess: (result) => downloadPdfPayload(result as PdfPayload),
    onError: (error: Error) => toast.error(error.message),
  });

  const email = useMutation({
    mutationFn: () => emailFn({ data: { id } as never }),
    onSuccess: () => toast.success("تم إرسال الفاتورة إلى بريد العميل."),
    onError: (error: Error) => toast.error(error.message),
  });

  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { resourceType: "invoice", resourceId: id, body: note } as never }),
    onSuccess: () => {
      setNote("");
      toast.success("تمت إضافة الملاحظة.");
      qc.invalidateQueries({ queryKey: ["billing-invoice", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell
      title={invoice ? `فاتورة ${invoice.number}` : "تفاصيل الفاتورة"}
      description={invoice ? invoice.customer_name : undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/mehla-admin/billing" search={{ tab: "invoices" }} className="inline-flex">
            <Btn variant="outline" size="sm">
              <ArrowRight className="h-4 w-4" aria-hidden /> عودة
            </Btn>
          </Link>
          {can("billing.export") && (
            <Btn variant="outline" size="sm" loading={pdf.isPending} onClick={() => pdf.mutate()}>
              <Download className="h-4 w-4" aria-hidden /> تنزيل PDF
            </Btn>
          )}
          {can("billing.export") && invoice?.status === "draft" && (
            <Btn variant="outline" size="sm" loading={quote.isPending} onClick={() => quote.mutate()}>
              <FileText className="h-4 w-4" aria-hidden /> عرض سعر PDF
            </Btn>
          )}
          {can("billing.export") && invoice?.organization_id && (
            <Btn variant="outline" size="sm" loading={statement.isPending} onClick={() => statement.mutate()}>
              <FileText className="h-4 w-4" aria-hidden /> كشف حساب المكتب
            </Btn>
          )}
          {can("billing.issue") && invoice?.customer_email && invoice.status !== "draft" && (
            <Btn variant="outline" size="sm" loading={email.isPending} onClick={() => email.mutate()}>
              <Mail className="h-4 w-4" aria-hidden /> إرسال بالبريد
            </Btn>
          )}
        </div>
      }
    >
      {query.isPending ? (
        <SectionLoader label="جاري تحميل الفاتورة…" rows={6} />
      ) : query.isError || !invoice ? (
        <ErrorBlock message={(query.error as Error | undefined)?.message ?? "تعذّر جلب الفاتورة."} />
      ) : (
        <div className="space-y-5">
          <SectionCard title="بيانات الفاتورة">
            <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="الحالة" value={<InvoiceStatusBadge status={invoice.status} />} />
              <Field label="العميل" value={invoice.customer_legal_name || invoice.customer_name} />
              <Field label="المكتب" value={invoice.organization_name ?? "—"} />
              <Field label="البريد" value={invoice.customer_email ?? "—"} />
              <Field label="تاريخ الإصدار" value={formatDate(invoice.issued_at)} />
              <Field label="تاريخ الاستحقاق" value={formatDate(invoice.due_at)} />
              <Field label="الإجمالي" value={<Money value={invoice.total} currency={invoice.currency} />} />
              <Field label="المسدّد" value={<Money value={invoice.paid_total} currency={invoice.currency} />} />
              <Field label="المتبقي" value={<Money value={invoice.remaining} currency={invoice.currency} />} />
              <Field
                label="الضريبة"
                value={
                  invoice.tax_exempt
                    ? `معفاة — ${invoice.tax_exemption_reason ?? "بدون سبب مسجّل"}`
                    : `${invoice.tax_rate}% (${invoice.tax_total})`
                }
              />
              <Field label="الباقة" value={invoice.plan_label ?? "—"} />
              <Field label="أنشأها" value={invoice.created_by_email ?? "—"} />
            </dl>
          </SectionCard>

          <SectionCard title="البنود">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr>
                    <Th>البند</Th>
                    <Th>الكمية</Th>
                    <Th>سعر الوحدة</Th>
                    <Th>الخصم</Th>
                    <Th>الضريبة</Th>
                    <Th>الإجمالي</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <Td>{item.description}</Td>
                      <Td className="tabular-nums">{item.quantity}</Td>
                      <Td>
                        <Money value={item.unitPrice} currency={invoice.currency} />
                      </Td>
                      <Td>
                        <Money value={item.discountAmount} currency={invoice.currency} />
                      </Td>
                      <Td>
                        <Money value={item.lineTax} currency={invoice.currency} />
                      </Td>
                      <Td>
                        <Money value={item.lineTotal} currency={invoice.currency} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="الدفعات">
              {invoice.payments.length === 0 ? (
                <p className="text-caption p-5">لا توجد دفعات مسجّلة.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoice.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium">
                          <Money value={payment.amount} currency={payment.currency} /> —{" "}
                          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                        </p>
                        <p className="text-caption">{formatDateTime(payment.paid_at ?? payment.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {can("billing.export") && payment.status !== "pending" && payment.status !== "failed" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            loading={receipt.isPending && receipt.variables === payment.id}
                            onClick={() => receipt.mutate(payment.id)}
                            aria-label={`تنزيل إيصال السداد بمبلغ ${payment.amount}`}
                          >
                            <Receipt className="h-4 w-4" aria-hidden /> إيصال
                          </Btn>
                        )}
                        <PaymentStatusBadge status={payment.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="الاستردادات وإشعارات الخصم">
              {invoice.refunds.length === 0 && invoice.credit_notes.length === 0 ? (
                <p className="text-caption p-5">لا توجد استردادات أو إشعارات خصم.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoice.refunds.map((refund) => (
                    <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium">
                          استرداد <Money value={refund.amount} currency={invoice.currency} />
                        </p>
                        <p className="text-caption truncate">{refund.reason}</p>
                      </div>
                      <RefundStatusBadge status={refund.status} />
                    </li>
                  ))}
                  {invoice.credit_notes.map((creditNote) => (
                    <li key={creditNote.id} className="p-4">
                      <p className="text-body-sm font-medium">
                        إشعار خصم {creditNote.number} — <Money value={creditNote.amount} currency={invoice.currency} />
                      </p>
                      <p className="text-caption truncate">{creditNote.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title="الملاحظات الداخلية" description="تُحفظ في سجل الفاتورة ولا تُرسل للعميل.">
            <div className="space-y-4 p-5">
              {can("billing.update") && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addNote.mutate();
                  }}
                >
                  <FormField label="إضافة ملاحظة">
                    <textarea
                      className={`${inputCls} min-h-20`}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </FormField>
                  <Btn type="submit" size="sm" loading={addNote.isPending} disabled={note.trim().length < 2}>
                    حفظ الملاحظة
                  </Btn>
                </form>
              )}
              {invoice.notes_log.length === 0 ? (
                <p className="text-caption">لا توجد ملاحظات.</p>
              ) : (
                <ul className="space-y-3">
                  {invoice.notes_log.map((entry) => (
                    <li key={entry.id} className="rounded-[var(--radius-m)] bg-surface-muted p-3">
                      <p className="text-body-sm">{entry.body}</p>
                      <p className="text-caption mt-1">
                        {entry.author_email ?? "—"} · {formatDateTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption">{label}</dt>
      <dd className="text-body-sm mt-0.5 break-words">{value}</dd>
    </div>
  );
}
