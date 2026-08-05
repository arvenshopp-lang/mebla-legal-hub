import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
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
  billingDecideRefund,
  billingListCreditNotes,
  billingListRefunds,
} from "@/lib/billing/billing.functions";
import { formatDateTime, type BillingRow } from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Money, RefundStatusBadge } from "./shared";

const PAGE_SIZE = 20;

export function RefundsPanel() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [page, setPage] = useState(1);
  const [notesPage, setNotesPage] = useState(1);
  const [deciding, setDeciding] = useState<{
    row: BillingRow;
    decision: "approve" | "reject";
  } | null>(null);
  const [reason, setReason] = useState("");

  const listFn = useServerFn(billingListRefunds);
  const notesFn = useServerFn(billingListCreditNotes);
  const decideFn = useServerFn(billingDecideRefund);

  const refunds = useQuery({
    queryKey: ["billing-refunds", page],
    queryFn: () =>
      listFn({ data: { page, pageSize: PAGE_SIZE, status: null, method: null, search: null } }),
  });

  const creditNotes = useQuery({
    queryKey: ["billing-credit-notes", notesPage],
    queryFn: () => notesFn({ data: { page: notesPage, pageSize: PAGE_SIZE } }),
  });

  const decide = useMutation({
    mutationFn: () =>
      decideFn({
        data: {
          refundId: (deciding?.row["id"] as string) ?? "",
          decision: deciding?.decision ?? "approve",
          reason: reason || null,
        },
      }),
    onSuccess: () => {
      toast.success(deciding?.decision === "approve" ? "تم اعتماد الاسترداد" : "تم رفض الاسترداد");
      setDeciding(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["billing-refunds"] });
      qc.invalidateQueries({ queryKey: ["billing-payments"] });
      qc.invalidateQueries({ queryKey: ["billing-invoices"] });
      qc.invalidateQueries({ queryKey: ["billing-overview"] });
    },
    onError: (error: Error) => toast.error("تعذّر تنفيذ القرار", { description: error.message }),
  });

  const rows = refunds.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="طلبات الاسترداد"
        description="لا يُنفّذ أي استرداد دون اعتماد موظف مخوّل."
      >
        {refunds.isLoading ? (
          <LoadingBlock rows={5} cols={5} />
        ) : refunds.isError ? (
          <ErrorBlock message={(refunds.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات استرداد"
            hint="تُنشأ الطلبات من قائمة المدفوعات أو صفحة الفاتورة."
          />
        ) : (
          <DataCard>
            <table className="w-full text-body-sm">
              <thead>
                <tr>
                  <Th>الفاتورة</Th>
                  <Th>المبلغ</Th>
                  <Th>السبب</Th>
                  <Th>الحالة</Th>
                  <Th>مقدّم الطلب</Th>
                  <Th>التاريخ</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const joined = row["platform_invoices"] as { number?: string } | null;
                  const invoiceId = row["invoice_id"] as string | null;
                  return (
                    <tr key={row["id"] as string} className="border-t border-border">
                      <Td>
                        {invoiceId ? (
                          <Link
                            to="/mehla-admin/billing/$id"
                            params={{ id: invoiceId }}
                            className="font-semibold tabular-nums text-primary underline-offset-4 hover:underline"
                          >
                            {joined?.number ?? "—"}
                          </Link>
                        ) : (
                          (joined?.number ?? "—")
                        )}
                      </Td>
                      <Td>
                        <Money value={row["amount"] as number} />
                      </Td>
                      <Td className="max-w-[240px] truncate">{row["reason"] as string}</Td>
                      <Td>
                        <RefundStatusBadge status={row["status"] as string} />
                      </Td>
                      <Td className="max-w-[180px] truncate">
                        {(row["requested_by_email"] as string) ?? "—"}
                      </Td>
                      <Td>{formatDateTime((row["created_at"] as string) ?? null)}</Td>
                      <Td className="text-left">
                        {row["status"] === "pending" && can("billing.refund") && (
                          <div className="flex items-center justify-end gap-1">
                            <Btn
                              variant="ghost"
                              size="icon"
                              aria-label="اعتماد الاسترداد"
                              onClick={() => setDeciding({ row, decision: "approve" })}
                            >
                              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                            </Btn>
                            <Btn
                              variant="ghost"
                              size="icon"
                              aria-label="رفض الاسترداد"
                              onClick={() => setDeciding({ row, decision: "reject" })}
                            >
                              <XCircle className="h-4 w-4 text-danger" aria-hidden />
                            </Btn>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
        )}
        <Pagination
          page={page}
          setPage={setPage}
          total={refunds.data?.total ?? 0}
          pageSize={PAGE_SIZE}
        />
      </SectionCard>

      <SectionCard
        title="إشعارات الخصم"
        description="تُصدر بأرقام نظامية مستقلة ولا تُحذف نهائياً."
      >
        {creditNotes.isLoading ? (
          <LoadingBlock rows={4} cols={4} />
        ) : (creditNotes.data?.rows ?? []).length === 0 ? (
          <p className="text-body-sm text-muted-foreground">لم تُصدر إشعارات خصم بعد.</p>
        ) : (
          <DataCard>
            <table className="w-full text-body-sm">
              <thead>
                <tr>
                  <Th>الرقم</Th>
                  <Th>الفاتورة</Th>
                  <Th>المبلغ</Th>
                  <Th>الضريبة</Th>
                  <Th>السبب</Th>
                  <Th>التاريخ</Th>
                </tr>
              </thead>
              <tbody>
                {(creditNotes.data?.rows ?? []).map((row) => {
                  const joined = row["platform_invoices"] as { number?: string } | null;
                  return (
                    <tr key={row["id"] as string} className="border-t border-border">
                      <Td>
                        <span className="font-semibold tabular-nums">
                          {row["number"] as string}
                        </span>
                      </Td>
                      <Td>{joined?.number ?? "—"}</Td>
                      <Td>
                        <Money value={row["amount"] as number} />
                      </Td>
                      <Td>
                        <Money value={row["tax_amount"] as number} />
                      </Td>
                      <Td className="max-w-[240px] truncate">{row["reason"] as string}</Td>
                      <Td>{formatDateTime((row["issued_at"] as string) ?? null)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
        )}
        <Pagination
          page={notesPage}
          setPage={setNotesPage}
          total={creditNotes.data?.total ?? 0}
          pageSize={PAGE_SIZE}
        />
      </SectionCard>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === "approve" ? "اعتماد الاسترداد" : "رفض الاسترداد"}
        description={
          deciding?.decision === "approve"
            ? "سيُنفّذ عبر المزوّد إن كان إلكترونياً، ويُحدَّث إجمالي المسترد في الفاتورة."
            : "يُسجّل الرفض مع السبب في سجل التدقيق."
        }
      >
        <div className="space-y-4">
          <FormField
            label={deciding?.decision === "approve" ? "ملاحظة (اختياري)" : "سبب الرفض"}
            required={deciding?.decision === "reject"}
          >
            <textarea
              rows={3}
              className={inputCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setDeciding(null)} disabled={decide.isPending}>
              رجوع
            </Btn>
            <Btn
              variant={deciding?.decision === "approve" ? "primary" : "danger"}
              loading={decide.isPending}
              disabled={deciding?.decision === "reject" && reason.trim().length < 5}
              onClick={() => decide.mutate()}
            >
              تأكيد
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
