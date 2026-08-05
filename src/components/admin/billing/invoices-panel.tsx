import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Eye, FileCheck2, Pencil } from "lucide-react";
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
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import {
  billingCancelInvoice,
  billingInvoiceDetail,
  billingIssueInvoice,
  billingListInvoices,
  billingSaveDraft,
} from "@/lib/billing/billing.functions";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  formatDate,
  type InvoiceRow,
} from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { DraftFormModal, draftFromInvoice, emptyDraft, type DraftFormValue } from "./draft-form";
import { InvoiceStatusBadge, Money } from "./shared";

const PAGE_SIZE = 20;

export function InvoicesPanel({ defaultTaxRate }: { defaultTaxRate: number }) {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftValue, setDraftValue] = useState<DraftFormValue>(() => emptyDraft(defaultTaxRate));
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [issuing, setIssuing] = useState<InvoiceRow | null>(null);
  const [issueDueAt, setIssueDueAt] = useState("");
  const [issueNotify, setIssueNotify] = useState(true);
  const [cancelling, setCancelling] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const listFn = useServerFn(billingListInvoices);
  const detailFn = useServerFn(billingInvoiceDetail);
  const saveFn = useServerFn(billingSaveDraft);
  const issueFn = useServerFn(billingIssueInvoice);
  const cancelFn = useServerFn(billingCancelInvoice);

  const query = useQuery({
    queryKey: ["billing-invoices", debounced, status, page],
    queryFn: () =>
      listFn({
        data: {
          search: debounced || null,
          status,
          page,
          pageSize: PAGE_SIZE,
          organizationId: null,
          from: null,
          to: null,
        },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-invoices"] });
    qc.invalidateQueries({ queryKey: ["billing-overview"] });
  };

  const save = useMutation({
    mutationFn: (value: DraftFormValue) =>
      saveFn({
        data: {
          id: value.id,
          organizationId: value.organizationId,
          customerName: value.customerName,
          customerLegalName: value.customerLegalName,
          customerEmail: value.customerEmail,
          customerPhone: value.customerPhone,
          billingAddress: value.billingAddress,
          commercialRegistration: value.commercialRegistration,
          taxNumber: value.taxNumber,
          planLabel: value.planLabel,
          currency: "SAR",
          taxRate: value.taxRate,
          taxExempt: value.taxExempt,
          taxExemptionReason: value.taxExemptionReason,
          servicePeriodStart: value.servicePeriodStart || null,
          servicePeriodEnd: value.servicePeriodEnd || null,
          dueAt: value.dueAt ? `${value.dueAt}T00:00:00Z` : null,
          notes: value.notes,
          internalNotes: value.internalNotes,
          items: value.items,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ مسودة الفاتورة");
      setDraftOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر حفظ المسودة", { description: error.message }),
  });

  const issue = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          id: issuing?.id ?? "",
          dueAt: issueDueAt ? `${issueDueAt}T00:00:00Z` : null,
          notify: issueNotify,
        },
      }),
    onSuccess: (result) => {
      toast.success(`تم إصدار الفاتورة ${result.number}`, {
        description: issueNotify
          ? result.emailed
            ? "تم إرسالها بالبريد."
            : "تعذّر إرسال البريد — سُجّل العطل."
          : undefined,
      });
      setIssuing(null);
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر إصدار الفاتورة", { description: error.message }),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: cancelling?.id ?? "", reason: cancelReason } }),
    onSuccess: () => {
      toast.success("تم إلغاء الفاتورة");
      setCancelling(null);
      setCancelReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error("تعذّر إلغاء الفاتورة", { description: error.message }),
  });

  const openNewDraft = () => {
    setDraftValue(emptyDraft(defaultTaxRate));
    setDraftOpen(true);
  };

  const openEditDraft = async (row: InvoiceRow) => {
    setLoadingDraft(true);
    try {
      const detail = await detailFn({ data: { id: row.id } });
      setDraftValue(draftFromInvoice(detail.invoice));
      setDraftOpen(true);
    } catch (error) {
      toast.error("تعذّر جلب المسودة", { description: (error as Error).message });
    } finally {
      setLoadingDraft(false);
    }
  };

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const statusOptions = useMemo(() => ["all", "unpaid", ...INVOICE_STATUSES], []);

  return (
    <>
      <PageToolbar
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="بحث برقم الفاتورة أو اسم العميل أو البريد…"
        searching={query.isFetching && !query.isLoading}
        onAdd={can("billing.create") ? openNewDraft : undefined}
        addLabel="فاتورة جديدة"
        filters={
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">تصفية بالحالة</span>
            <select
              className={`${inputCls} h-11 w-auto`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">جميع الحالات</option>
              <option value="unpaid">غير مسددة</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorBlock message={(query.error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا توجد فواتير مطابقة"
          hint="ابدأ بإنشاء مسودة فاتورة، ثم أصدرها لتحصل على رقم نظامي نهائي."
          action={
            can("billing.create") ? <Btn onClick={openNewDraft}>فاتورة جديدة</Btn> : undefined
          }
        />
      ) : (
        <DataCard>
          <table className="w-full text-body-sm">
            <thead>
              <tr>
                <Th>الرقم</Th>
                <Th>العميل</Th>
                <Th>الإجمالي</Th>
                <Th>المسدد</Th>
                <Th>المتبقي</Th>
                <Th>الحالة</Th>
                <Th>الاستحقاق</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <Td>
                    <Link
                      to="/mehla-admin/billing/$id"
                      params={{ id: row.id }}
                      className="font-semibold tabular-nums text-primary underline-offset-4 hover:underline"
                    >
                      {row.number}
                    </Link>
                  </Td>
                  <Td>
                    <span className="block truncate font-medium">{row.customer_name}</span>
                    {row.organization_name && (
                      <span className="text-caption block truncate">{row.organization_name}</span>
                    )}
                  </Td>
                  <Td>
                    <Money value={row.total} currency={row.currency} />
                  </Td>
                  <Td>
                    <Money value={row.paid_total} currency={row.currency} />
                  </Td>
                  <Td>
                    <Money value={row.remaining} currency={row.currency} />
                  </Td>
                  <Td>
                    <InvoiceStatusBadge status={row.status} />
                  </Td>
                  <Td>{formatDate(row.due_at)}</Td>
                  <Td className="text-left">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to="/mehla-admin/billing/$id"
                        params={{ id: row.id }}
                        aria-label={`عرض الفاتورة ${row.number}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-s)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </Link>
                      {row.status === "draft" && can("billing.update") && (
                        <Btn
                          variant="ghost"
                          size="icon"
                          aria-label={`تعديل مسودة ${row.number}`}
                          loading={loadingDraft}
                          onClick={() => void openEditDraft(row)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Btn>
                      )}
                      {row.status === "draft" && can("billing.issue") && (
                        <Btn
                          variant="ghost"
                          size="icon"
                          aria-label={`إصدار ${row.number}`}
                          onClick={() => {
                            setIssuing(row);
                            setIssueDueAt(row.due_at ? row.due_at.slice(0, 10) : "");
                            setIssueNotify(true);
                          }}
                        >
                          <FileCheck2 className="h-4 w-4 text-success" aria-hidden />
                        </Btn>
                      )}
                      {["issued", "pending", "partially_paid", "overdue", "draft"].includes(
                        row.status,
                      ) &&
                        can("billing.cancel") && (
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label={`إلغاء ${row.number}`}
                            onClick={() => {
                              setCancelling(row);
                              setCancelReason("");
                            }}
                          >
                            <Ban className="h-4 w-4 text-danger" aria-hidden />
                          </Btn>
                        )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Pagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} />

      <DraftFormModal
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        initial={draftValue}
        saving={save.isPending}
        onSubmit={(value) => save.mutate(value)}
      />

      <Modal
        open={Boolean(issuing)}
        onClose={() => setIssuing(null)}
        title={`إصدار الفاتورة ${issuing?.number ?? ""}`}
        description="بعد الإصدار لا يمكن تعديل البنود — يمكن التحصيل أو الإلغاء بسبب مُسجّل فقط."
      >
        <div className="space-y-4">
          <FormField
            label="تاريخ الاستحقاق"
            hint="يُحتسب من مهلة السداد الافتراضية إن تُرك فارغاً."
          >
            <input
              type="date"
              className={inputCls}
              value={issueDueAt}
              onChange={(e) => setIssueDueAt(e.target.value)}
            />
          </FormField>
          <label className="flex items-center gap-2.5 text-body-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary)]"
              checked={issueNotify}
              onChange={(e) => setIssueNotify(e.target.checked)}
            />
            إرسال الفاتورة للعميل بالبريد
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setIssuing(null)} disabled={issue.isPending}>
              إلغاء
            </Btn>
            <Btn onClick={() => issue.mutate()} loading={issue.isPending}>
              إصدار الفاتورة
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title={`إلغاء الفاتورة ${cancelling?.number ?? ""}`}
        description="لا تُحذف الفاتورة نهائياً — تُوسم كملغاة ويُسجّل السبب في سجل التدقيق."
      >
        <div className="space-y-4">
          <FormField label="سبب الإلغاء" required hint="5 أحرف على الأقل.">
            <textarea
              rows={3}
              className={inputCls}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setCancelling(null)} disabled={cancel.isPending}>
              رجوع
            </Btn>
            <Btn
              variant="danger"
              disabled={cancelReason.trim().length < 5}
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              تأكيد الإلغاء
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
