import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import {
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  SectionCard,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import {
  billingCreateRefund,
  billingDecidePayment,
  billingListAttempts,
  billingListPayments,
} from "@/lib/billing/billing.functions";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  formatDateTime,
  type BillingRow,
} from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Money, PaymentStatusBadge } from "./shared";

const PAGE_SIZE = 20;

const invoiceRef = (row: BillingRow): { number: string; id: string | null } => {
  const joined = row["platform_invoices"] as { number?: string } | null;
  return { number: joined?.number ?? "—", id: (row["invoice_id"] as string | null) ?? null };
};

export function PaymentsPanel() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const [deciding, setDeciding] = useState<{ row: BillingRow; decision: "approve" | "reject" } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [refunding, setRefunding] = useState<BillingRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const listFn = useServerFn(billingListPayments);
  const attemptsFn = useServerFn(billingListAttempts);
  const decideFn = useServerFn(billingDecidePayment);
  const refundFn = useServerFn(billingCreateRefund);

  const query = useQuery({
    queryKey: ["billing-payments", debounced, status, method, page],
    queryFn: () => listFn({ data: { search: debounced || null, status, method, page, pageSize: PAGE_SIZE } }),
  });

  const attempts = useQuery({
    queryKey: ["billing-attempts"],
    queryFn: () => attemptsFn({ data: { page: 1, pageSize: 15, status: null, method: null, search: null } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-payments"] });
    qc.invalidateQueries({ queryKey: ["billing-invoices"] });
    qc.invalidateQueries({ queryKey: ["billing-refunds"] });
    qc.invalidateQueries({ queryKey: ["billing-overview"] });
    qc.invalidateQueries({ queryKey: ["billing-attempts"] });
  };

  const decide = useMutation({
    mutationFn: () =>
      decideFn({
        data: {
          paymentId: (deciding?.row["id"] as string) ?? "",
          decision: deciding?.decision ?? "approve",
          reason: decisionReason || null,
        },
      }),
    onSuccess: () => {
      toast.success(deciding?.decision === "approve" ? "تم اعتماد الدفعة" : "تم رفض الدفعة");
      setDeciding(null);
      setDecisionReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر تنفيذ القرار", { description: error.message }),
  });

  const refund = useMutation({
    mutationFn: () =>
      refundFn({
        data: {
          paymentId: (refunding?.["id"] as string) ?? "",
          amount: Number(refundAmount),
          reason: refundReason,
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل طلب الاسترداد بانتظار الاعتماد");
      setRefunding(null);
      setRefundAmount("");
      setRefundReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر تسجيل الاسترداد", { description: error.message }),
  });

  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageToolbar
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="بحث بمرجع التحويل أو معرّف المزوّد…"
        searching={query.isFetching && !query.isLoading}
        filters={
          <>
            <label className="inline-flex items-center gap-2">
              <span className="sr-only">تصفية بحالة الدفعة</span>
              <select
                className={`${inputCls} h-11 w-auto`}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">جميع الحالات</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="sr-only">تصفية بطريقة السداد</span>
              <select
                className={`${inputCls} h-11 w-auto`}
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">جميع الطرق</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorBlock message={(query.error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد دفعات مطابقة" hint="تُسجّل الدفعات من صفحة الفاتورة أو تُستقبل من مزوّد الدفع." />
      ) : (
        <DataCard>
          <table className="w-full text-body-sm">
            <thead>
              <tr>
                <Th>الفاتورة</Th>
                <Th>المبلغ</Th>
                <Th>الطريقة</Th>
                <Th>الحالة</Th>
                <Th>المرجع</Th>
                <Th>التاريخ</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ref = invoiceRef(row);
                const rowStatus = row["status"] as string;
                const refunded = Number(row["refunded_amount"] ?? 0);
                const amount = Number(row["amount"] ?? 0);
                return (
                  <tr key={row["id"] as string} className="border-t border-border">
                    <Td>
                      {ref.id ? (
                        <Link
                          to="/mehla-admin/billing/$id"
                          params={{ id: ref.id }}
                          className="font-semibold tabular-nums text-primary underline-offset-4 hover:underline"
                        >
                          {ref.number}
                        </Link>
                      ) : (
                        ref.number
                      )}
                    </Td>
                    <Td>
                      <Money value={amount} currency={(row["currency"] as string) ?? "SAR"} />
                      {refunded > 0 && (
                        <span className="text-caption block">
                          مُسترد: <Money value={refunded} />
                        </span>
                      )}
                    </Td>
                    <Td>{PAYMENT_METHOD_LABELS[row["method"] as never] ?? (row["method"] as string)}</Td>
                    <Td>
                      <PaymentStatusBadge status={rowStatus} />
                    </Td>
                    <Td className="max-w-[180px] truncate" >
                      <span dir="ltr">{(row["bank_reference"] as string) ?? (row["provider_payment_id"] as string) ?? "—"}</span>
                    </Td>
                    <Td>{formatDateTime((row["created_at"] as string) ?? null)}</Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {rowStatus === "pending" && can("billing.approve_payment") && (
                          <>
                            <Btn
                              variant="ghost"
                              size="icon"
                              aria-label="اعتماد الدفعة"
                              onClick={() => setDeciding({ row, decision: "approve" })}
                            >
                              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                            </Btn>
                            <Btn
                              variant="ghost"
                              size="icon"
                              aria-label="رفض الدفعة"
                              onClick={() => setDeciding({ row, decision: "reject" })}
                            >
                              <XCircle className="h-4 w-4 text-danger" aria-hidden />
                            </Btn>
                          </>
                        )}
                        {rowStatus === "paid" && refunded < amount && can("billing.refund") && (
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="طلب استرداد"
                            onClick={() => {
                              setRefunding(row);
                              setRefundAmount(String(amount - refunded));
                              setRefundReason("");
                            }}
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          </Btn>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataCard>
      )}

      <Pagination page={page} setPage={setPage} total={query.data?.total ?? 0} pageSize={PAGE_SIZE} />

      <SectionCard title="محاولات الدفع والاتصال" description="أحدث 15 محاولة — تُستخدم لتشخيص أعطال المزوّد.">
        {attempts.isLoading ? (
          <LoadingBlock rows={4} cols={4} />
        ) : (attempts.data?.rows ?? []).length === 0 ? (
          <p className="text-body-sm text-muted-foreground">لا توجد محاولات مسجّلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr>
                  <Th>العملية</Th>
                  <Th>المزوّد</Th>
                  <Th>النتيجة</Th>
                  <Th>الرسالة</Th>
                  <Th>التاريخ</Th>
                </tr>
              </thead>
              <tbody>
                {(attempts.data?.rows ?? []).map((row) => (
                  <tr key={row["id"] as string} className="border-t border-border">
                    <Td>{row["operation"] as string}</Td>
                    <Td>{row["provider"] as string}</Td>
                    <Td>
                      <PaymentStatusBadge status={row["status"] === "success" ? "paid" : "failed"} />
                    </Td>
                    <Td className="max-w-[280px] truncate">{(row["error_message"] as string) ?? "—"}</Td>
                    <Td>{formatDateTime((row["created_at"] as string) ?? null)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === "approve" ? "اعتماد الدفعة" : "رفض الدفعة"}
        description={
          deciding?.decision === "approve"
            ? "سيُحدَّث المسدد والمتبقي في الفاتورة، ويُرسل إشعار للعميل."
            : "يُسجّل الرفض مع السبب ويُبلَّغ العميل."
        }
      >
        <div className="space-y-4">
          <FormField
            label={deciding?.decision === "approve" ? "ملاحظة الاعتماد (اختياري)" : "سبب الرفض"}
            required={deciding?.decision === "reject"}
          >
            <textarea
              rows={3}
              className={inputCls}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
            />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setDeciding(null)} disabled={decide.isPending}>
              رجوع
            </Btn>
            <Btn
              variant={deciding?.decision === "approve" ? "primary" : "danger"}
              loading={decide.isPending}
              disabled={deciding?.decision === "reject" && decisionReason.trim().length < 5}
              onClick={() => decide.mutate()}
            >
              تأكيد
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(refunding)}
        onClose={() => setRefunding(null)}
        title="طلب استرداد"
        description="يُسجّل الطلب بانتظار اعتماد موظف مخوّل، ثم يُنفّذ عبر المزوّد أو يدوياً."
      >
        <div className="space-y-4">
          <FormField label="المبلغ" required>
            <input
              type="number"
              min="0.01"
              step="0.01"
              dir="ltr"
              className={inputCls}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </FormField>
          <FormField label="سبب الاسترداد" required hint="5 أحرف على الأقل.">
            <textarea rows={3} className={inputCls} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setRefunding(null)} disabled={refund.isPending}>
              رجوع
            </Btn>
            <Btn
              loading={refund.isPending}
              disabled={!(Number(refundAmount) > 0) || refundReason.trim().length < 5}
              onClick={() => refund.mutate()}
            >
              تسجيل الطلب
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
