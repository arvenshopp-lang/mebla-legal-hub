import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Pencil, Send, Trash2, Wallet, Printer, Ban } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { DataView, type Column } from "@/components/data/data-view";
import { BillingSummaryCards } from "@/components/office-billing/summary-cards";
import { InvoiceStatusBadge } from "@/components/office-billing/status-badge";
import {
  InvoiceDialog,
  type InvoiceDraftInitial,
} from "@/components/office-billing/invoice-dialog";
import {
  Btn,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { Money } from "@/components/ui/money";
import { Riyal } from "@/components/ui/riyal";
import { fmtDate, fmtMoney, isoToRiyadhLocalInput, riyadhLocalToIso } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/office-billing/permissions";
import {
  OFFICE_INVOICE_DISPLAY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type DiscountType,
  type PaymentMethod,
} from "@/lib/office-billing/billing.shared";
import {
  cancelOfficeInvoice,
  deleteOfficeInvoiceDraft,
  getClientStatement,
  getOfficeBillingSummary,
  getOfficeInvoice,
  issueOfficeInvoice,
  listOfficeInvoices,
  recordOfficePayment,
} from "@/lib/office-billing/billing.functions";
import { downloadStatementCsv } from "@/lib/office-billing/export";
import {
  clientStatementPdf,
  invoicePdf,
  paymentReceiptPdf,
} from "@/lib/office-billing/pdf.functions";
import { downloadPdfPayload } from "@/lib/billing/download-pdf";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: Page,
  head: () => ({
    meta: [
      { title: "فواتير المكتب والأتعاب | مِهلة" },
      {
        name: "description",
        content: "إصدار فواتير أتعاب المكتب وتسجيل الدفعات ومتابعة الأرصدة وكشوف حسابات العملاء.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "فواتير المكتب والأتعاب | مِهلة" },
      {
        property: "og:description",
        content: "إدارة فواتير الأتعاب والدفعات والأرصدة داخل مكتبك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["all", "draft", "issued", "partially_paid", "overdue", "paid", "cancelled"];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "حدث خطأ غير متوقع. أعد المحاولة.";
}

type Row = Awaited<ReturnType<typeof listOfficeInvoices>>["rows"][number];

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const canView = can(activeRole, "billing.view");
  const canManage = can(activeRole, "billing.create");

  const fetchList = useServerFn(listOfficeInvoices);
  const fetchSummary = useServerFn(getOfficeBillingSummary);
  const fetchInvoice = useServerFn(getOfficeInvoice);
  const fetchStatement = useServerFn(getClientStatement);
  const issueFn = useServerFn(issueOfficeInvoice);
  const cancelFn = useServerFn(cancelOfficeInvoice);
  const deleteFn = useServerFn(deleteOfficeInvoiceDraft);
  const payFn = useServerFn(recordOfficePayment);
  const invoicePdfFn = useServerFn(invoicePdf);
  const statementPdfFn = useServerFn(clientStatementPdf);
  const receiptPdfFn = useServerFn(paymentReceiptPdf);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceDraftInitial | null>(null);
  const [issuing, setIssuing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [cancelling, setCancelling] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [paying, setPaying] = useState<Row | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [payAt, setPayAt] = useState(isoToRiyadhLocalInput(new Date().toISOString()));
  const [payRef, setPayRef] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const list = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["office-invoices", activeOrgId, q, status, page],
    enabled: canView && !!activeOrgId,
    queryFn: () =>
      fetchList({
        data: {
          organizationId: activeOrgId!,
          search: q || undefined,
          status,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const summary = useQuery({
    queryKey: ["office-billing-summary", activeOrgId, "office"],
    enabled: canView && !!activeOrgId,
    queryFn: () => fetchSummary({ data: { organizationId: activeOrgId! } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["office-invoices"] });
    void qc.invalidateQueries({ queryKey: ["office-billing-summary"] });
  };

  const issue = useMutation({
    mutationFn: (row: Row) =>
      issueFn({ data: { organizationId: activeOrgId!, invoiceId: row.id } }),
    onSuccess: (res) => {
      toast.success(`تم إصدار الفاتورة ${res.invoice_number ?? ""}`.trim());
      setIssuing(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: (row: Row) =>
      deleteFn({ data: { organizationId: activeOrgId!, invoiceId: row.id } }),
    onSuccess: () => {
      toast.success("تم حذف المسودة.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const cancel = useMutation({
    mutationFn: (row: Row) =>
      cancelFn({ data: { organizationId: activeOrgId!, invoiceId: row.id, reason: cancelReason } }),
    onSuccess: () => {
      toast.success("تم إلغاء الفاتورة وتسجيل السبب.");
      setCancelling(null);
      setCancelReason("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pay = useMutation({
    mutationFn: async () => {
      const iso = riyadhLocalToIso(payAt);
      if (!iso) throw new Error("تاريخ التحصيل غير صالح.");
      return payFn({
        data: {
          organizationId: activeOrgId!,
          invoiceId: paying!.id,
          amount: Number(payAmount),
          method: payMethod,
          paidAt: iso,
          referenceNumber: payRef.trim() || null,
        },
      });
    },
    onSuccess: (created) => {
      toast.success("تم تسجيل الدفعة وتحديث حالة الفاتورة.");
      const invoiceId = paying?.id;
      if (invoiceId) {
        toast("هل تريد إيصال الدفعة؟", {
          action: {
            label: "تنزيل الإيصال PDF",
            onClick: () => void downloadReceipt(invoiceId, created.id),
          },
        });
      }
      setPaying(null);
      setPayAmount("");
      setPayRef("");
      refresh();
    },
    onError: (e) => setPayError(errMsg(e)),
  });

  async function openEdit(row: Row) {
    try {
      const detail = await fetchInvoice({
        data: { organizationId: activeOrgId!, invoiceId: row.id },
      });
      setEditing({
        invoiceId: detail.invoice.id,
        clientId: detail.invoice.client_id,
        caseId: detail.invoice.case_id,
        title: detail.invoice.title,
        issueDate: detail.invoice.issue_date,
        dueDate: detail.invoice.due_date,
        discountType: detail.invoice.discount_type as DiscountType,
        discountValue: detail.invoice.discount_value,
        taxRate: detail.invoice.tax_rate,
        paymentTerms: detail.invoice.payment_terms,
        notes: detail.invoice.notes,
        items: detail.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unit_price,
        })),
      });
      setDialogOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  /** تنزيل الفاتورة PDF بهوية المكتب — التوليد والتحقق على الخادم. */
  async function downloadInvoice(row: Row) {
    setPdfBusy(row.id);
    try {
      downloadPdfPayload(
        await invoicePdfFn({ data: { organizationId: activeOrgId!, invoiceId: row.id } }),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadReceipt(invoiceId: string, paymentId: string) {
    try {
      downloadPdfPayload(
        await receiptPdfFn({ data: { organizationId: activeOrgId!, invoiceId, paymentId } }),
      );
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function statement(row: Row, mode: "pdf" | "csv") {
    if (!row.client) return;
    const clientId = row.client.id;
    try {
      if (mode === "csv") {
        downloadStatementCsv(
          await fetchStatement({ data: { organizationId: activeOrgId!, clientId } }),
        );
      } else {
        downloadPdfPayload(
          await statementPdfFn({ data: { organizationId: activeOrgId!, clientId } }),
        );
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const columns: Column<Row>[] = [
    {
      id: "number",
      header: "الفاتورة",
      mobile: "title",
      width: "md",
      cell: (r) => (
        <span className="font-semibold">
          {r.invoice_number ?? "مسودة"}
          {r.title ? <span className="block text-caption font-normal">{r.title}</span> : null}
        </span>
      ),
    },
    {
      id: "client",
      header: "العميل",
      mobile: "subtitle",
      width: "md",
      cell: (r) => r.client?.full_name ?? "—",
    },
    {
      id: "status",
      header: "الحالة",
      mobileLabel: "الحالة",
      cell: (r) => <InvoiceStatusBadge status={r.displayStatus} />,
    },
    {
      id: "due",
      header: "الاستحقاق",
      mobileLabel: "الاستحقاق",
      cell: (r) => (r.due_date ? <span className="whitespace-nowrap tabular-nums">{fmtDate(r.due_date)}</span> : "—"),
    },
    {
      id: "total",
      header: "الإجمالي",
      width: "num",
      mobileLabel: "الإجمالي",
      cell: (r) => <Money value={r.total} />,
    },
    {
      id: "balance",
      header: "المتبقي",
      width: "num",
      mobileLabel: "المتبقي",
      cell: (r) => <Money value={r.balance} />,
    },
    {
      id: "actions",
      header: "إجراءات",
      mobile: "actions",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <IconBtn
            aria-label="تنزيل الفاتورة PDF"
            title="تنزيل الفاتورة PDF"
            loading={pdfBusy === r.id}
            onClick={() => void downloadInvoice(r)}
          >
            <Printer className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn aria-label="كشف حساب العميل PDF" onClick={() => void statement(r, "pdf")}>
            <FileText className="h-4 w-4" aria-hidden />
          </IconBtn>
          {canManage && r.status === "draft" && (
            <>
              <IconBtn aria-label="تعديل المسودة" onClick={() => void openEdit(r)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn aria-label="إصدار المطالبة" onClick={() => setIssuing(r)}>
                <Send className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn tone="danger" aria-label="حذف المسودة" onClick={() => setDeleting(r)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconBtn>
            </>
          )}
          {canManage && (r.status === "issued" || r.status === "partially_paid") && (
            <>
              <IconBtn
                aria-label="تسجيل دفعة"
                onClick={() => {
                  setPayError(null);
                  setPayAmount(String(r.balance));
                  setPayAt(isoToRiyadhLocalInput(new Date().toISOString()));
                  setPaying(r);
                }}
              >
                <Wallet className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn tone="danger" aria-label="إلغاء المطالبة" onClick={() => setCancelling(r)}>
                <Ban className="h-4 w-4" aria-hidden />
              </IconBtn>
            </>
          )}
        </div>
      ),
    },
  ];

  if (!canView) {
    return (
      <DashboardShell title="الأتعاب والمطالبات" description="أتعاب المكتب والدفعات">
        <EmptyState
          title="لا تملك صلاحية الاطلاع على البيانات المالية"
          hint="الوصول المالي متاح لمالك المكتب والمدير والمحامي. راجع مالك المكتب لتعديل دورك."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="الأتعاب والمطالبات المالية"
      description="إدارة أتعاب القضايا وعروض الأسعار وإشعارات السداد ومتابعة الأرصدة"
    >
      <BillingSummaryCards summary={summary.data} loading={summary.isLoading} />

      <div className="mt-6">
        <PageToolbar
          search={search}
          setSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          searching={list.isFetching}
          placeholder="بحث برقم المستند أو وصفه…"
          canAdd={canManage}
          addLabel="مطالبة / عرض أتعاب"
          onAdd={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          activeFilters={status === "all" ? 0 : 1}
          filters={
            <select
              className={inputCls}
              aria-label="تصفية بالحالة"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "all"
                    ? "كل الحالات"
                    : OFFICE_INVOICE_DISPLAY_LABELS[
                        s as keyof typeof OFFICE_INVOICE_DISPLAY_LABELS
                      ]}
                </option>
              ))}
            </select>
          }
        />

        {list.isLoading ? (
          <LoadingBlock rows={6} cols={5} />
        ) : list.error ? (
          <ErrorBlock message={errMsg(list.error)} />
        ) : !list.data?.rows.length ? (
          <EmptyState
            title="لا توجد فواتير مطابقة"
            hint={canManage ? "أنشئ فاتورة أتعاب جديدة لعميل المكتب." : "لا توجد بيانات للعرض."}
          />
        ) : (
          <>
            <DataView
              label="فواتير المكتب"
              columns={columns}
              rows={list.data.rows}
              rowKey={(r) => r.id}
              rowTone={(r) => (r.displayStatus === "overdue" ? "text-danger" : undefined)}
            />
            <Pagination
              page={page}
              setPage={setPage}
              total={list.data.count}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </div>

      {activeOrgId && (
        <InvoiceDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          organizationId={activeOrgId}
          initial={editing}
        />
      )}

      <ConfirmDialog
        open={!!issuing}
        onClose={() => setIssuing(null)}
        onConfirm={() => issuing && issue.mutate(issuing)}
        title="إصدار الفاتورة"
        message="بعد الإصدار يُخصَّص رقم متسلسل للفاتورة ولا يمكن تعديل بنودها. هل تريد المتابعة؟"
        confirmLabel="إصدار"
        danger={false}
        loading={issue.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="حذف المسودة"
        message="سيتم حذف مسودة الفاتورة وبنودها. الفواتير المُصدرة لا تُحذف بل تُلغى."
        loading={remove.isPending}
      />

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="إلغاء فاتورة مُصدرة"
        description="الإلغاء يُسجَّل في سجل العمليات ولا يمكن التراجع عنه."
      >
        <div className="grid gap-4">
          <FormField label="سبب الإلغاء" required>
            <input
              className={inputCls}
              value={cancelReason}
              maxLength={500}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="اتفاق جديد مع العميل"
            />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setCancelling(null)} disabled={cancel.isPending}>
              رجوع
            </Btn>
            <Btn
              variant="danger"
              loading={cancel.isPending}
              disabled={cancelReason.trim().length < 3}
              onClick={() => cancelling && cancel.mutate(cancelling)}
            >
              تأكيد الإلغاء
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="تسجيل دفعة"
        description={
          paying ? (
            <>
              المتبقي على الفاتورة {paying.invoice_number ?? ""}:{" "}
              <Money value={paying.balance} className="font-semibold text-foreground" />
            </>
          ) : undefined
        }
      >
        <div className="grid gap-4">
          <FormField
            label={
              <>
                المبلغ (<Riyal />)
              </>
            }
            required
            hint="لا يمكن أن يتجاوز المتبقي على الفاتورة."
          >
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className={inputCls}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </FormField>
          <FormField label="طريقة الدفع" required>
            <select
              className={inputCls}
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="تاريخ ووقت التحصيل" required hint="بتوقيت الرياض.">
            <input
              type="datetime-local"
              className={inputCls}
              value={payAt}
              onChange={(e) => setPayAt(e.target.value)}
            />
          </FormField>
          <FormField label="الرقم المرجعي" optional>
            <input
              className={inputCls}
              value={payRef}
              maxLength={120}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="رقم عملية التحويل"
            />
          </FormField>
          {payError && (
            <p role="alert" className="text-body-sm text-danger">
              {payError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setPaying(null)} disabled={pay.isPending}>
              إلغاء
            </Btn>
            <Btn
              loading={pay.isPending}
              disabled={!(Number(payAmount) > 0)}
              onClick={() => pay.mutate()}
            >
              تسجيل الدفعة
            </Btn>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}
