import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileDown, MessageCircle, PenLine } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  Modal,
  SectionCard,
  SectionLoader,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { downloadPdfPayload } from "@/lib/billing/download-pdf";
import {
  salesActivate,
  salesConvertToInvoice,
  salesConvertToSubscription,
  salesDecideApproval,
  salesDeleteDraft,
  salesDetail,
  salesDocumentPdf,
  salesOptions,
  salesRecordDecision,
  salesRequestApproval,
  salesSend,
  salesSign,
  salesTerminate,
} from "@/lib/sales-docs.functions";
import { KIND_LABELS, STATUS_LABELS, type SalesDocStatus } from "@/lib/sales-docs.shared";
import { DocumentFormModal, type DraftFormValue } from "@/components/admin/sales/document-form";
import {
  KindBadge,
  Money,
  StatusBadge,
  formatDate,
  formatDateTime,
} from "@/components/admin/sales/shared";

export const Route = createFileRoute("/mehla-admin/sales/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المستند · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SalesDocumentPage,
});

type DialogKind = "send" | "sign" | "decision" | "invoice" | "subscription" | "terminate" | null;

/** تطبيع رقم الجوال السعودي إلى صيغة واتساب الدولية بدون رموز. */
function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

function SalesDocumentPage() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();

  const detailFn = useServerFn(salesDetail);
  const pdfFn = useServerFn(salesDocumentPdf);
  const optionsFn = useServerFn(salesOptions);
  const requestApprovalFn = useServerFn(salesRequestApproval);
  const decideApprovalFn = useServerFn(salesDecideApproval);
  const sendFn = useServerFn(salesSend);
  const decisionFn = useServerFn(salesRecordDecision);
  const signFn = useServerFn(salesSign);
  const activateFn = useServerFn(salesActivate);
  const terminateFn = useServerFn(salesTerminate);
  const invoiceFn = useServerFn(salesConvertToInvoice);
  const subscriptionFn = useServerFn(salesConvertToSubscription);
  const deleteFn = useServerFn(salesDeleteDraft);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendForm, setSendForm] = useState({ toEmail: "", message: "" });
  const [signForm, setSignForm] = useState({ signerName: "", signerEmail: "", signerRole: "" });
  const [decisionForm, setDecisionForm] = useState<{
    decision: "accepted" | "rejected" | "expired" | "cancelled";
    note: string;
  }>({
    decision: "accepted",
    note: "",
  });
  const [convertForm, setConvertForm] = useState({
    dueAt: "",
    planCode: "",
    startsOn: "",
    endsOn: "",
  });
  const [note, setNote] = useState("");

  const detail = useQuery({
    queryKey: ["sales-detail", id],
    queryFn: () => detailFn({ data: { id } }),
    enabled: can("sales_docs.read"),
  });

  const options = useQuery({
    queryKey: ["sales-options"],
    queryFn: () => optionsFn({ data: undefined as never }),
    enabled: dialog === "subscription",
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-detail", id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-documents"] });
  };

  const runner = useMutation({
    mutationFn: async (task: {
      run: () => Promise<unknown>;
      success: string;
      fallback: string;
    }) => {
      await task.run();
      return task.success;
    },
    onSuccess: (message) => {
      toast.success(message);
      setDialog(null);
      setNote("");
      refresh();
    },
    onError: (error: Error, task) => toast.error(error.message || task.fallback),
  });

  const run = (run: () => Promise<unknown>, success: string, fallback: string) =>
    runner.mutate({ run, success, fallback });

  const downloadPdf = async () => {
    try {
      const payload = await pdfFn({ data: { id } });
      downloadPdfPayload(payload);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر توليد ملف PDF.");
      return false;
    }
  };

  if (!can("sales_docs.read")) {
    return (
      <AdminShell title="تفاصيل المستند">
        <EmptyState
          title="لا تملك صلاحية الوصول"
          hint="الوصول يتطلب صلاحية «مشاهدة العروض والعقود»."
        />
      </AdminShell>
    );
  }

  if (detail.isLoading) {
    return (
      <AdminShell title="تفاصيل المستند">
        <SectionLoader label="جاري تحميل المستند…" rows={5} />
      </AdminShell>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <AdminShell title="تفاصيل المستند">
        <ErrorBlock message="تعذّر جلب المستند. قد يكون محذوفاً أو لا تملك صلاحية الوصول إليه." />
      </AdminShell>
    );
  }

  const { document: doc, items, events, signatures, content } = detail.data;
  const status = doc.status as SalesDocStatus;
  const editable = !doc.locked && ["draft", "pending_approval", "approved"].includes(status);

  const editInitial: DraftFormValue = {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    organizationId: doc.organization_id ?? "",
    companyId: doc.company_id ?? "",
    contactId: doc.contact_id ?? "",
    templateId: content.templateId ?? "",
    discountType: doc.discount_type === "amount" ? "amount" : "percent",
    discountValue: doc.discount_value,
    taxRate: doc.tax_rate,
    intro: content.intro ?? "",
    terms: content.terms ?? "",
    notes: content.notes ?? "",
    validUntil: doc.valid_until ?? "",
    startsOn: doc.starts_on ?? "",
    endsOn: doc.ends_on ?? "",
    recipientName: doc.recipient_name ?? "",
    recipientCompany: doc.recipient_company ?? "",
    recipientPhone: doc.recipient_phone ?? "",
    recipientEmail: doc.recipient_email ?? "",
    recipientAddress: doc.recipient_address ?? "",
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      discountAmount: item.discount_amount,
    })),
  };

  return (
    <AdminShell
      title={`${KIND_LABELS[doc.kind]} ${doc.number ?? "(مسودة)"}`}
      description={doc.title}
      breadcrumb={`${KIND_LABELS[doc.kind]} ${doc.number ?? "(مسودة)"}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="outline" size="sm" onClick={downloadPdf}>
            <FileDown className="h-4 w-4" aria-hidden /> ملف PDF
          </Btn>
          <Link
            to="/mehla-admin/sales"
            search={{ tab: "all" as const }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-m)] border border-border px-3 text-body-sm text-foreground transition hover:bg-surface-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> القائمة
          </Link>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <SectionCard title="ملخص المستند">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-caption">النوع والحالة</dt>
                <dd className="mt-1 flex gap-2">
                  <KindBadge kind={doc.kind} />
                  <StatusBadge status={status} />
                </dd>
              </div>
              <div>
                <dt className="text-caption">العميل</dt>
                <dd className="mt-1 text-body-sm">
                  {content.companyName ?? doc.organization_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-caption">جهة الاتصال</dt>
                <dd className="mt-1 text-body-sm">
                  {content.contactName ?? "—"}
                  {content.contactEmail ? ` · ${content.contactEmail}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-caption">صالح حتى</dt>
                <dd className="mt-1 text-body-sm">{formatDate(doc.valid_until)}</dd>
              </div>
              <div>
                <dt className="text-caption">مدة السريان</dt>
                <dd className="mt-1 text-body-sm">
                  {doc.starts_on
                    ? `${formatDate(doc.starts_on)} — ${formatDate(doc.ends_on)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-caption">أُرسل في</dt>
                <dd className="mt-1 text-body-sm">{formatDateTime(doc.sent_at)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="البنود">
            <DataCard>
              <table className="w-full text-body-sm">
                <thead>
                  <tr>
                    <Th>الوصف</Th>
                    <Th>الكمية</Th>
                    <Th>سعر الوحدة</Th>
                    <Th>الخصم</Th>
                    <Th>الإجمالي</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <Td>{item.description}</Td>
                      <Td className="tabular-nums">{item.quantity}</Td>
                      <Td>
                        <Money value={item.unit_price} currency={doc.currency} />
                      </Td>
                      <Td>
                        <Money value={item.discount_amount} currency={doc.currency} />
                      </Td>
                      <Td>
                        <Money value={item.amount} currency={doc.currency} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
            <dl className="mt-4 grid gap-2 sm:max-w-sm sm:ms-auto">
              <div className="flex justify-between gap-3 text-body-sm">
                <dt className="text-muted-foreground">الإجمالي قبل الخصم</dt>
                <dd>
                  <Money value={doc.subtotal} currency={doc.currency} />
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-body-sm">
                <dt className="text-muted-foreground">الخصم</dt>
                <dd>
                  <Money value={doc.discount_amount} currency={doc.currency} />
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-body-sm">
                <dt className="text-muted-foreground">ضريبة القيمة المضافة {doc.tax_rate}%</dt>
                <dd>
                  <Money value={doc.tax_amount} currency={doc.currency} />
                </dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>الإجمالي</dt>
                <dd>
                  <Money value={doc.total} currency={doc.currency} />
                </dd>
              </div>
            </dl>
          </SectionCard>

          {(content.intro || content.terms) && (
            <SectionCard title="المقدمة والشروط">
              {content.intro && <p className="whitespace-pre-line text-body-sm">{content.intro}</p>}
              {content.terms && (
                <p className="mt-4 whitespace-pre-line text-body-sm text-muted-foreground">
                  {content.terms}
                </p>
              )}
            </SectionCard>
          )}

          <SectionCard
            title="التوقيعات الإلكترونية"
            description="كل توقيع مرتبط ببصمة تحقق SHA-256 غير قابلة للتعديل."
          >
            {signatures.length === 0 ? (
              <EmptyState title="لا توجد توقيعات" hint="يُسجّل التوقيع عند قبول العميل للمستند." />
            ) : (
              <ul className="grid gap-3">
                {signatures.map((signature) => (
                  <li
                    key={signature.id}
                    className="rounded-[var(--radius-m)] border border-border p-4 text-body-sm"
                  >
                    <p className="font-semibold">
                      {signature.signer_name}{" "}
                      <span className="text-muted-foreground">· {signature.signer_email}</span>
                    </p>
                    <p className="text-caption mt-1">
                      {signature.signer_role ? `${signature.signer_role} · ` : ""}
                      {formatDateTime(signature.signed_at)}
                    </p>
                    <p className="text-caption mt-1 break-all font-mono">
                      {signature.evidence_hash}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="سجل الأحداث" description="سجل غير قابل للتعديل يوثّق كل انتقال حالة.">
            {events.length === 0 ? (
              <EmptyState title="لا توجد أحداث" />
            ) : (
              <ol className="grid gap-3">
                {events.map((event) => (
                  <li key={event.id} className="border-s-2 border-border ps-4 text-body-sm">
                    <p className="font-semibold">
                      {event.to_status ? STATUS_LABELS[event.to_status] : event.event}
                    </p>
                    <p className="text-caption mt-0.5">
                      {formatDateTime(event.created_at)}
                      {event.actor_email ? ` · ${event.actor_email}` : ""}
                    </p>
                    {event.note && <p className="mt-1 text-muted-foreground">{event.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-5 self-start">
          <SectionCard
            title="الإجراءات المتاحة"
            description="تظهر الإجراءات المسموحة بحالة المستند وصلاحياتك فقط."
          >
            <div className="grid gap-2">
              {editable && can("sales_docs.update") && (
                <Btn variant="outline" onClick={() => setEditOpen(true)}>
                  <PenLine className="h-4 w-4" aria-hidden /> تعديل المستند
                </Btn>
              )}
              {status === "draft" && can("sales_docs.update") && (
                <Btn
                  variant="outline"
                  loading={runner.isPending}
                  onClick={() =>
                    run(
                      () => requestApprovalFn({ data: { id, note: null } }),
                      "تم إرسال طلب الاعتماد.",
                      "تعذّر إرسال طلب الاعتماد.",
                    )
                  }
                >
                  طلب اعتماد
                </Btn>
              )}
              {status === "pending_approval" && can("sales_docs.approve") && (
                <>
                  <Btn
                    loading={runner.isPending}
                    onClick={() =>
                      run(
                        () => decideApprovalFn({ data: { id, approve: true, note: null } }),
                        "تم اعتماد المستند.",
                        "تعذّر اعتماد المستند.",
                      )
                    }
                  >
                    اعتماد
                  </Btn>
                  <Btn
                    variant="outline"
                    loading={runner.isPending}
                    onClick={() =>
                      run(
                        () => decideApprovalFn({ data: { id, approve: false, note: null } }),
                        "تمت إعادة المستند لمسودة.",
                        "تعذّر رفض الاعتماد.",
                      )
                    }
                  >
                    رفض وإعادة لمسودة
                  </Btn>
                </>
              )}
              {["draft", "approved"].includes(status) && can("sales_docs.send") && (
                <Btn onClick={() => setDialog("send")}>إرسال للعميل</Btn>
              )}
              {["sent", "viewed"].includes(status) && can("sales_docs.decide") && (
                <Btn onClick={() => setDialog("decision")}>تسجيل قرار العميل</Btn>
              )}
              {status === "accepted" && can("sales_docs.decide") && (
                <>
                  <Btn onClick={() => setDialog("sign")}>إضافة توقيع إلكتروني</Btn>
                  {doc.kind === "contract" && (
                    <Btn
                      variant="outline"
                      loading={runner.isPending}
                      onClick={() =>
                        run(
                          () => activateFn({ data: { id, note: null } }),
                          "تم تفعيل العقد.",
                          "تعذّر تفعيل العقد.",
                        )
                      }
                    >
                      تفعيل العقد
                    </Btn>
                  )}
                </>
              )}
              {status === "active" && can("sales_docs.decide") && (
                <Btn variant="outline" onClick={() => setDialog("terminate")}>
                  إنهاء العقد
                </Btn>
              )}
              {["accepted", "active"].includes(status) && can("sales_docs.convert") && (
                <>
                  <Btn
                    variant="outline"
                    disabled={!!doc.converted_invoice_id}
                    onClick={() => setDialog("invoice")}
                  >
                    {doc.converted_invoice_id ? "حُوّل لفاتورة" : "تحويل لفاتورة"}
                  </Btn>
                  <Btn
                    variant="outline"
                    disabled={!!doc.converted_subscription_id}
                    onClick={() => setDialog("subscription")}
                  >
                    {doc.converted_subscription_id ? "حُوّل لاشتراك" : "تحويل لاشتراك"}
                  </Btn>
                </>
              )}
              {status === "draft" && can("sales_docs.delete") && (
                <Btn variant="danger" onClick={() => setConfirmDelete(true)}>
                  حذف المسودة
                </Btn>
              )}
            </div>
          </SectionCard>

          {doc.requires_approval && (
            <SectionCard title="تنبيه الخصم">
              <p className="text-body-sm text-warning">
                الخصم على هذا المستند يتجاوز الحد المسموح، ولا يمكن إرساله قبل اعتماد موظف آخر.
              </p>
            </SectionCard>
          )}

          {(doc.converted_invoice_id || doc.converted_subscription_id) && (
            <SectionCard title="الارتباطات">
              <ul className="grid gap-2 text-body-sm">
                {doc.converted_invoice_id && (
                  <li>
                    <Link
                      to="/mehla-admin/billing/$id"
                      params={{ id: doc.converted_invoice_id }}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      الفاتورة المرتبطة
                    </Link>
                  </li>
                )}
                {doc.converted_subscription_id && (
                  <li className="text-muted-foreground">اشتراك مرتبط بهذا المستند.</li>
                )}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>

      {editOpen && (
        <DocumentFormModal
          open
          onClose={() => setEditOpen(false)}
          initial={editInitial}
          onSaved={() => refresh()}
        />
      )}

      <Modal open={dialog === "send"} onClose={() => setDialog(null)} title="إرسال المستند للعميل">
        <div className="grid gap-4">
          <FormField label="البريد الإلكتروني للمستلم" required>
            <input
              className={inputCls}
              type="email"
              value={sendForm.toEmail}
              onChange={(e) => setSendForm({ ...sendForm, toEmail: e.target.value })}
            />
          </FormField>
          <FormField label="رسالة مصاحبة">
            <textarea
              className={inputCls}
              rows={3}
              maxLength={1000}
              value={sendForm.message}
              onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              loading={runner.isPending}
              onClick={() =>
                run(
                  () =>
                    sendFn({
                      data: {
                        id,
                        toEmail: sendForm.toEmail.trim(),
                        message: sendForm.message.trim() === "" ? null : sendForm.message.trim(),
                      },
                    }),
                  "تم إرسال المستند وتوليد رقمه النظامي.",
                  "تعذّر إرسال المستند.",
                )
              }
            >
              إرسال
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "decision"} onClose={() => setDialog(null)} title="تسجيل قرار العميل">
        <div className="grid gap-4">
          <FormField label="القرار" required>
            <select
              className={inputCls}
              value={decisionForm.decision}
              onChange={(e) =>
                setDecisionForm({
                  ...decisionForm,
                  decision: e.target.value as typeof decisionForm.decision,
                })
              }
            >
              <option value="accepted">قبول</option>
              <option value="rejected">رفض</option>
              <option value="expired">انتهاء الصلاحية</option>
              <option value="cancelled">إلغاء</option>
            </select>
          </FormField>
          <FormField label="ملاحظة">
            <textarea
              className={inputCls}
              rows={3}
              maxLength={400}
              value={decisionForm.note}
              onChange={(e) => setDecisionForm({ ...decisionForm, note: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              loading={runner.isPending}
              onClick={() =>
                run(
                  () =>
                    decisionFn({
                      data: {
                        id,
                        decision: decisionForm.decision,
                        note: decisionForm.note.trim() === "" ? null : decisionForm.note.trim(),
                      },
                    }),
                  "تم تسجيل القرار.",
                  "تعذّر تسجيل القرار.",
                )
              }
            >
              تسجيل
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "sign"} onClose={() => setDialog(null)} title="توقيع إلكتروني">
        <div className="grid gap-4">
          <FormField label="اسم الموقّع" required>
            <input
              className={inputCls}
              value={signForm.signerName}
              onChange={(e) => setSignForm({ ...signForm, signerName: e.target.value })}
            />
          </FormField>
          <FormField label="بريد الموقّع" required>
            <input
              type="email"
              className={inputCls}
              value={signForm.signerEmail}
              onChange={(e) => setSignForm({ ...signForm, signerEmail: e.target.value })}
            />
          </FormField>
          <FormField label="الصفة">
            <input
              className={inputCls}
              value={signForm.signerRole}
              onChange={(e) => setSignForm({ ...signForm, signerRole: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              loading={runner.isPending}
              onClick={() =>
                run(
                  () =>
                    signFn({
                      data: {
                        id,
                        signerName: signForm.signerName.trim(),
                        signerEmail: signForm.signerEmail.trim(),
                        signerRole:
                          signForm.signerRole.trim() === "" ? null : signForm.signerRole.trim(),
                      },
                    }),
                  "تم تسجيل التوقيع مع بصمة التحقق.",
                  "تعذّر تسجيل التوقيع.",
                )
              }
            >
              توقيع
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "invoice"} onClose={() => setDialog(null)} title="تحويل إلى فاتورة">
        <div className="grid gap-4">
          <FormField label="تاريخ الاستحقاق">
            <input
              type="date"
              className={inputCls}
              value={convertForm.dueAt}
              onChange={(e) => setConvertForm({ ...convertForm, dueAt: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              loading={runner.isPending}
              onClick={() =>
                run(
                  () =>
                    invoiceFn({
                      data: { id, dueAt: convertForm.dueAt === "" ? null : convertForm.dueAt },
                    }),
                  "تم إنشاء مسودة الفاتورة في المركز المالي.",
                  "تعذّر تحويل المستند لفاتورة.",
                )
              }
            >
              تحويل
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={dialog === "subscription"}
        onClose={() => setDialog(null)}
        title="تحويل إلى اشتراك"
      >
        <div className="grid gap-4">
          <FormField label="الباقة" required>
            <select
              className={inputCls}
              value={convertForm.planCode}
              onChange={(e) => setConvertForm({ ...convertForm, planCode: e.target.value })}
            >
              <option value="">اختر الباقة</option>
              {(options.data?.plans ?? []).map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="بداية الاشتراك">
              <input
                type="date"
                className={inputCls}
                value={convertForm.startsOn}
                onChange={(e) => setConvertForm({ ...convertForm, startsOn: e.target.value })}
              />
            </FormField>
            <FormField label="نهاية الاشتراك">
              <input
                type="date"
                className={inputCls}
                value={convertForm.endsOn}
                onChange={(e) => setConvertForm({ ...convertForm, endsOn: e.target.value })}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              loading={runner.isPending}
              disabled={convertForm.planCode === ""}
              onClick={() =>
                run(
                  () =>
                    subscriptionFn({
                      data: {
                        id,
                        planCode: convertForm.planCode,
                        startsOn: convertForm.startsOn === "" ? null : convertForm.startsOn,
                        endsOn: convertForm.endsOn === "" ? null : convertForm.endsOn,
                      },
                    }),
                  "تم إنشاء الاشتراك للمكتب.",
                  "تعذّر تحويل المستند لاشتراك.",
                )
              }
            >
              تحويل
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "terminate"} onClose={() => setDialog(null)} title="إنهاء العقد">
        <div className="grid gap-4">
          <FormField label="سبب الإنهاء">
            <textarea
              className={inputCls}
              rows={3}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDialog(null)}>
              إلغاء
            </Btn>
            <Btn
              variant="danger"
              loading={runner.isPending}
              onClick={() =>
                run(
                  () =>
                    terminateFn({ data: { id, note: note.trim() === "" ? null : note.trim() } }),
                  "تم إنهاء العقد.",
                  "تعذّر إنهاء العقد.",
                )
              }
            >
              إنهاء
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="حذف المسودة"
        message="سيُحذف هذا المستند نهائياً. لا يمكن حذف مستند أُرسل للعميل."
        confirmLabel="حذف"
        loading={runner.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          runner.mutate({
            run: async () => {
              await deleteFn({ data: { id } });
              void navigate({ to: "/mehla-admin/sales" } as never);
            },
            success: "تم حذف المسودة.",
            fallback: "تعذّر حذف المسودة.",
          })
        }
      />
    </AdminShell>
  );
}
