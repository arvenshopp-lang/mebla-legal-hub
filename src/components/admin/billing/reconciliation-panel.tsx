import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Lock, Plus, Unlock, XCircle } from "lucide-react";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  Pagination,
  SectionCard,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import {
  billingAddBankEntry,
  billingApproveReopen,
  billingClosePeriod,
  billingIgnoreBankEntry,
  billingListPayments,
  billingListPeriods,
  billingListReconciliations,
  billingMatchBankEntry,
  billingRequestReopen,
} from "@/lib/billing/billing.functions";
import { formatDate, formatDateTime, type BillingRow } from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Money } from "./shared";

const PAGE_SIZE = 20;

export function ReconciliationPanel() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [entry, setEntry] = useState({ statementRef: "", bankName: "", amount: "", valueDate: "", payerName: "", notes: "" });
  const [matching, setMatching] = useState<BillingRow | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");
  const [ignoring, setIgnoring] = useState<BillingRow | null>(null);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [period, setPeriod] = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [reopening, setReopening] = useState<BillingRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const listFn = useServerFn(billingListReconciliations);
  const paymentsFn = useServerFn(billingListPayments);
  const periodsFn = useServerFn(billingListPeriods);
  const addFn = useServerFn(billingAddBankEntry);
  const matchFn = useServerFn(billingMatchBankEntry);
  const ignoreFn = useServerFn(billingIgnoreBankEntry);
  const closeFn = useServerFn(billingClosePeriod);
  const requestFn = useServerFn(billingRequestReopen);
  const approveFn = useServerFn(billingApproveReopen);

  const entries = useQuery({
    queryKey: ["billing-reconciliation", status, page],
    queryFn: () => listFn({ data: { status, page, pageSize: PAGE_SIZE, method: null, search: null } }),
  });

  const openPayments = useQuery({
    queryKey: ["billing-payments-unmatched"],
    queryFn: () => paymentsFn({ data: { status: "paid", page: 1, pageSize: 100, method: null, search: null } }),
    enabled: Boolean(matching),
  });

  const periods = useQuery({ queryKey: ["billing-periods"], queryFn: () => periodsFn({}) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["billing-periods"] });
  };

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          statementRef: entry.statementRef,
          bankName: entry.bankName || null,
          amount: Number(entry.amount),
          valueDate: entry.valueDate,
          payerName: entry.payerName || null,
          notes: entry.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم إضافة الحركة البنكية");
      setAddOpen(false);
      setEntry({ statementRef: "", bankName: "", amount: "", valueDate: "", payerName: "", notes: "" });
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر إضافة الحركة", { description: error.message }),
  });

  const match = useMutation({
    mutationFn: () => matchFn({ data: { entryId: (matching?.["id"] as string) ?? "", paymentId: matchPaymentId } }),
    onSuccess: () => {
      toast.success("تمت المطابقة بنجاح");
      setMatching(null);
      setMatchPaymentId("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّرت المطابقة", { description: error.message }),
  });

  const ignore = useMutation({
    mutationFn: () => ignoreFn({ data: { entryId: (ignoring?.["id"] as string) ?? "", reason: ignoreReason } }),
    onSuccess: () => {
      toast.success("تم تجاهل الحركة مع تسجيل السبب");
      setIgnoring(null);
      setIgnoreReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر التجاهل", { description: error.message }),
  });

  const closePeriod = useMutation({
    mutationFn: () =>
      closeFn({ data: { periodStart: period.periodStart, periodEnd: period.periodEnd, notes: period.notes || null } }),
    onSuccess: () => {
      toast.success("تم إقفال الفترة المالية");
      setCloseOpen(false);
      setPeriod({ periodStart: "", periodEnd: "", notes: "" });
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر الإقفال", { description: error.message }),
  });

  const requestReopen = useMutation({
    mutationFn: () => requestFn({ data: { periodId: (reopening?.["id"] as string) ?? "", reason: reopenReason } }),
    onSuccess: () => {
      toast.success("تم تسجيل طلب إعادة الفتح بانتظار اعتماد موظف آخر");
      setReopening(null);
      setReopenReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر تسجيل الطلب", { description: error.message }),
  });

  const approveReopen = useMutation({
    mutationFn: (approvalId: string) => approveFn({ data: { approvalId } }),
    onSuccess: () => {
      toast.success("تمت الموافقة وأُعيد فتح الفترة");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّرت الموافقة", { description: error.message }),
  });

  const rows = entries.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="المطابقة البنكية"
        description="تُدخل حركات كشف الحساب وتُطابق بالدفعات المسجّلة — كل مطابقة موثقة باسم الموظف."
        actions={
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2">
              <span className="sr-only">تصفية الحركات</span>
              <select
                className={`${inputCls} h-10 w-auto`}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">الجميع</option>
                <option value="unmatched">غير مطابقة</option>
                <option value="matched">مطابقة</option>
                <option value="ignored">متجاهلة</option>
              </select>
            </label>
            {can("billing.reconcile") && (
              <Btn size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden /> حركة بنكية
              </Btn>
            )}
          </div>
        }
      >
        {entries.isLoading ? (
          <LoadingBlock rows={5} cols={5} />
        ) : entries.isError ? (
          <ErrorBlock message={(entries.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState title="لا توجد حركات بنكية" hint="أضف حركات كشف الحساب لمطابقتها بالتحويلات المسجّلة." />
        ) : (
          <DataCard>
            <table className="w-full text-body-sm">
              <thead>
                <tr>
                  <Th>المرجع</Th>
                  <Th>البنك</Th>
                  <Th>المبلغ</Th>
                  <Th>تاريخ القيمة</Th>
                  <Th>المُحوِّل</Th>
                  <Th>الحالة</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row["id"] as string} className="border-t border-border">
                    <Td>
                      <span dir="ltr" className="font-medium">
                        {row["statement_ref"] as string}
                      </span>
                    </Td>
                    <Td>{(row["bank_name"] as string) ?? "—"}</Td>
                    <Td>
                      <Money value={row["amount"] as number} />
                    </Td>
                    <Td>{formatDate((row["value_date"] as string) ?? null)}</Td>
                    <Td className="max-w-[180px] truncate">{(row["payer_name"] as string) ?? "—"}</Td>
                    <Td>
                      <Badge
                        tone={row["status"] === "matched" ? "green" : row["status"] === "ignored" ? "muted" : "warn"}
                      >
                        {row["status"] === "matched" ? "مطابقة" : row["status"] === "ignored" ? "متجاهلة" : "غير مطابقة"}
                      </Badge>
                    </Td>
                    <Td className="text-left">
                      {row["status"] === "unmatched" && can("billing.reconcile") && (
                        <div className="flex items-center justify-end gap-1">
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="مطابقة بدفعة"
                            onClick={() => {
                              setMatching(row);
                              setMatchPaymentId("");
                            }}
                          >
                            <Link2 className="h-4 w-4 text-primary" aria-hidden />
                          </Btn>
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="تجاهل الحركة"
                            onClick={() => {
                              setIgnoring(row);
                              setIgnoreReason("");
                            }}
                          >
                            <XCircle className="h-4 w-4 text-danger" aria-hidden />
                          </Btn>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
        )}
        <Pagination page={page} setPage={setPage} total={entries.data?.total ?? 0} pageSize={PAGE_SIZE} />
      </SectionCard>

      <SectionCard
        title="الفترات المالية"
        description="الفترة المقفلة تمنع أي تسجيل أو تعديل بتاريخ يقع داخلها، ولا تُفتح إلا بموافقة موظف ثانٍ."
        actions={
          can("billing.close_period") ? (
            <Btn size="sm" onClick={() => setCloseOpen(true)}>
              <Lock className="h-4 w-4" aria-hidden /> إقفال فترة
            </Btn>
          ) : undefined
        }
      >
        {periods.isLoading ? (
          <LoadingBlock rows={3} cols={4} />
        ) : (
          <div className="space-y-6">
            {(periods.data?.periods ?? []).length === 0 ? (
              <p className="text-body-sm text-muted-foreground">لا توجد فترات مقفلة.</p>
            ) : (
              <DataCard>
                <table className="w-full text-body-sm">
                  <thead>
                    <tr>
                      <Th>من</Th>
                      <Th>إلى</Th>
                      <Th>الحالة</Th>
                      <Th>أُقفلت بواسطة</Th>
                      <Th>تاريخ الإقفال</Th>
                      <Th className="text-left">إجراءات</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(periods.data?.periods ?? []).map((row) => (
                      <tr key={row["id"] as string} className="border-t border-border">
                        <Td>{formatDate((row["period_start"] as string) ?? null)}</Td>
                        <Td>{formatDate((row["period_end"] as string) ?? null)}</Td>
                        <Td>
                          <Badge tone={row["status"] === "closed" ? "red" : "green"}>
                            {row["status"] === "closed" ? "مقفلة" : "مفتوحة"}
                          </Badge>
                        </Td>
                        <Td className="max-w-[180px] truncate">{(row["closed_by_email"] as string) ?? "—"}</Td>
                        <Td>{formatDateTime((row["closed_at"] as string) ?? null)}</Td>
                        <Td className="text-left">
                          {row["status"] === "closed" && can("billing.close_period") && (
                            <Btn
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReopening(row);
                                setReopenReason("");
                              }}
                            >
                              <Unlock className="h-4 w-4" aria-hidden /> طلب إعادة فتح
                            </Btn>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}

            <div>
              <h4 className="text-label mb-2">طلبات إعادة الفتح</h4>
              {(periods.data?.requests ?? []).length === 0 ? (
                <p className="text-body-sm text-muted-foreground">لا توجد طلبات.</p>
              ) : (
                <ul className="space-y-2">
                  {(periods.data?.requests ?? []).map((row) => (
                    <li
                      key={row["id"] as string}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-medium">{row["reason"] as string}</p>
                        <p className="text-caption">
                          {(row["requested_by_email"] as string) ?? "—"} · {formatDateTime((row["created_at"] as string) ?? null)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={row["status"] === "approved" ? "green" : row["status"] === "rejected" ? "red" : "warn"}>
                          {row["status"] === "approved" ? "معتمد" : row["status"] === "rejected" ? "مرفوض" : "بانتظار الاعتماد"}
                        </Badge>
                        {row["status"] === "pending" && can("billing.reopen_period") && (
                          <Btn
                            size="sm"
                            loading={approveReopen.isPending}
                            onClick={() => approveReopen.mutate(row["id"] as string)}
                          >
                            اعتماد
                          </Btn>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة حركة بنكية" size="lg">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="مرجع الحركة" required>
              <input
                dir="ltr"
                className={inputCls}
                value={entry.statementRef}
                onChange={(e) => setEntry({ ...entry, statementRef: e.target.value })}
              />
            </FormField>
            <FormField label="البنك">
              <input className={inputCls} value={entry.bankName} onChange={(e) => setEntry({ ...entry, bankName: e.target.value })} />
            </FormField>
            <FormField label="المبلغ" required>
              <input
                type="number"
                min="0.01"
                step="0.01"
                dir="ltr"
                className={inputCls}
                value={entry.amount}
                onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
              />
            </FormField>
            <FormField label="تاريخ القيمة" required>
              <input
                type="date"
                className={inputCls}
                value={entry.valueDate}
                onChange={(e) => setEntry({ ...entry, valueDate: e.target.value })}
              />
            </FormField>
            <FormField label="اسم المُحوِّل">
              <input className={inputCls} value={entry.payerName} onChange={(e) => setEntry({ ...entry, payerName: e.target.value })} />
            </FormField>
            <FormField label="ملاحظات">
              <input className={inputCls} value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} />
            </FormField>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setAddOpen(false)} disabled={add.isPending}>
              إلغاء
            </Btn>
            <Btn
              loading={add.isPending}
              disabled={entry.statementRef.trim().length < 3 || !(Number(entry.amount) > 0) || !entry.valueDate}
              onClick={() => add.mutate()}
            >
              إضافة
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(matching)} onClose={() => setMatching(null)} title="مطابقة الحركة بدفعة">
        <div className="space-y-4">
          <FormField label="الدفعة" required hint="تظهر الدفعات المعتمدة فقط.">
            <select className={inputCls} value={matchPaymentId} onChange={(e) => setMatchPaymentId(e.target.value)}>
              <option value="">اختر دفعة…</option>
              {(openPayments.data?.rows ?? []).map((row) => {
                const joined = row["platform_invoices"] as { number?: string } | null;
                return (
                  <option key={row["id"] as string} value={row["id"] as string}>
                    {joined?.number ?? "—"} · {Number(row["amount"] ?? 0).toFixed(2)} ريال
                  </option>
                );
              })}
            </select>
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setMatching(null)} disabled={match.isPending}>
              رجوع
            </Btn>
            <Btn loading={match.isPending} disabled={!matchPaymentId} onClick={() => match.mutate()}>
              تأكيد المطابقة
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(ignoring)} onClose={() => setIgnoring(null)} title="تجاهل الحركة البنكية">
        <div className="space-y-4">
          <FormField label="سبب التجاهل" required hint="5 أحرف على الأقل.">
            <textarea rows={3} className={inputCls} value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setIgnoring(null)} disabled={ignore.isPending}>
              رجوع
            </Btn>
            <Btn variant="danger" loading={ignore.isPending} disabled={ignoreReason.trim().length < 5} onClick={() => ignore.mutate()}>
              تأكيد
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="إقفال فترة مالية">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="من تاريخ" required>
              <input
                type="date"
                className={inputCls}
                value={period.periodStart}
                onChange={(e) => setPeriod({ ...period, periodStart: e.target.value })}
              />
            </FormField>
            <FormField label="إلى تاريخ" required>
              <input
                type="date"
                className={inputCls}
                value={period.periodEnd}
                onChange={(e) => setPeriod({ ...period, periodEnd: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="ملاحظات">
            <textarea rows={2} className={inputCls} value={period.notes} onChange={(e) => setPeriod({ ...period, notes: e.target.value })} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setCloseOpen(false)} disabled={closePeriod.isPending}>
              إلغاء
            </Btn>
            <Btn
              loading={closePeriod.isPending}
              disabled={!period.periodStart || !period.periodEnd || period.periodEnd < period.periodStart}
              onClick={() => closePeriod.mutate()}
            >
              إقفال الفترة
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(reopening)} onClose={() => setReopening(null)} title="طلب إعادة فتح فترة">
        <div className="space-y-4">
          <FormField label="المبرر" required hint="10 أحرف على الأقل — يُعتمد الطلب من موظف آخر.">
            <textarea rows={3} className={inputCls} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setReopening(null)} disabled={requestReopen.isPending}>
              رجوع
            </Btn>
            <Btn loading={requestReopen.isPending} disabled={reopenReason.trim().length < 10} onClick={() => requestReopen.mutate()}>
              تسجيل الطلب
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
