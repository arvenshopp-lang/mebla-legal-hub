import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Btn, FormField, IconBtn, Modal, inputCls } from "@/lib/list-utils";
import { fmtMoney } from "@/lib/format";
import {
  createOfficeInvoice,
  updateOfficeInvoiceDraft,
} from "@/lib/office-billing/billing.functions";
import {
  DEFAULT_TAX_RATE,
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABELS,
  addDaysToDate,
  computeInvoiceTotals,
  riyadhToday,
  type DiscountType,
} from "@/lib/office-billing/billing.shared";

export type InvoiceDraftInitial = {
  invoiceId: string;
  clientId: string;
  caseId: string | null;
  title: string | null;
  issueDate: string | null;
  dueDate: string | null;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  paymentTerms: string | null;
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
};

type ItemRow = { description: string; quantity: string; unitPrice: string };

const emptyItem = (): ItemRow => ({ description: "", quantity: "1", unitPrice: "" });

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "حدث خطأ غير متوقع. أعد المحاولة.";
}

/** نموذج إنشاء/تعديل مسودة فاتورة. الإجماليات المعروضة معاينة، والقاعدة هي المرجع. */
export function InvoiceDialog({
  open,
  onClose,
  organizationId,
  initial,
  defaultCaseId,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  initial?: InvoiceDraftInitial | null;
  defaultCaseId?: string | null;
  defaultClientId?: string | null;
  onSaved?: (invoiceId: string) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createOfficeInvoice);
  const update = useServerFn(updateOfficeInvoiceDraft);

  const [clientId, setClientId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [title, setTitle] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [taxRate, setTaxRate] = useState(String(DEFAULT_TAX_RATE));
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = riyadhToday();
    setFieldError(null);
    if (initial) {
      setClientId(initial.clientId);
      setCaseId(initial.caseId ?? "");
      setTitle(initial.title ?? "");
      setIssueDate(initial.issueDate ?? today);
      setDueDate(initial.dueDate ?? addDaysToDate(today, 14));
      setDiscountType(initial.discountType);
      setDiscountValue(String(initial.discountValue));
      setTaxRate(String(initial.taxRate));
      setPaymentTerms(initial.paymentTerms ?? "");
      setNotes(initial.notes ?? "");
      setItems(
        initial.items.length
          ? initial.items.map((i) => ({
              description: i.description,
              quantity: String(i.quantity),
              unitPrice: String(i.unitPrice),
            }))
          : [emptyItem()],
      );
      return;
    }
    setClientId(defaultClientId ?? "");
    setCaseId(defaultCaseId ?? "");
    setTitle("");
    setIssueDate(today);
    setDueDate(addDaysToDate(today, 14));
    setDiscountType("amount");
    setDiscountValue("0");
    setTaxRate(String(DEFAULT_TAX_RATE));
    setPaymentTerms("");
    setNotes("");
    setItems([emptyItem()]);
  }, [open, initial, defaultCaseId, defaultClientId]);

  const { data: clients } = useQuery({
    queryKey: ["billing-clients", organizationId],
    enabled: open && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("organization_id", organizationId)
        .order("full_name")
        .limit(500);
      if (error) throw new Error("تعذّر تحميل قائمة العملاء.");
      return data ?? [];
    },
  });

  const { data: cases } = useQuery({
    queryKey: ["billing-cases", organizationId, clientId],
    enabled: open && !!organizationId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, case_title, case_number")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error("تعذّر تحميل قضايا العميل.");
      return data ?? [];
    },
  });

  const parsedItems = useMemo(
    () =>
      items.map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
      })),
    [items],
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        items: parsedItems,
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
      }),
    [parsedItems, discountType, discountValue, taxRate],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        organizationId,
        clientId,
        caseId: caseId || null,
        title: title.trim() || null,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
        items: parsedItems,
      };
      if (initial) {
        return update({ data: { ...payload, invoiceId: initial.invoiceId } });
      }
      return create({ data: payload });
    },
    onSuccess: (res) => {
      toast.success(initial ? "تم تحديث المسودة." : "تم إنشاء مسودة الفاتورة.");
      void qc.invalidateQueries({ queryKey: ["office-invoices"] });
      void qc.invalidateQueries({ queryKey: ["office-billing-summary"] });
      void qc.invalidateQueries({ queryKey: ["office-invoice", res.id] });
      onSaved?.(res.id);
      onClose();
    },
    onError: (e) => setFieldError(errMsg(e)),
  });

  function submit() {
    setFieldError(null);
    if (!clientId) return setFieldError("اختر العميل قبل الحفظ.");
    if (!parsedItems.length || parsedItems.some((i) => i.description.length < 2)) {
      return setFieldError("كل بند يحتاج وصفاً لا يقل عن حرفين.");
    }
    if (parsedItems.some((i) => i.quantity <= 0)) {
      return setFieldError("الكمية في كل بند يجب أن تكون أكبر من صفر.");
    }
    if (parsedItems.some((i) => i.unitPrice < 0)) {
      return setFieldError("سعر الوحدة لا يمكن أن يكون سالباً.");
    }
    if (issueDate && dueDate && dueDate < issueDate) {
      return setFieldError("تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الإصدار.");
    }
    save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "تعديل مسودة فاتورة" : "فاتورة جديدة"}
      description="تُحفظ الفاتورة كمسودة قابلة للتعديل، ولا تُرقَّم إلا عند الإصدار."
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="العميل" required>
            <select
              className={inputCls}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setCaseId("");
              }}
            >
              <option value="">اختر العميل…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="القضية المرتبطة" optional>
            <select
              className={inputCls}
              value={caseId}
              disabled={!clientId}
              onChange={(e) => setCaseId(e.target.value)}
            >
              <option value="">بدون ربط بقضية</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_title}
                  {c.case_number ? ` — ${c.case_number}` : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="وصف الفاتورة" optional>
            <input
              className={inputCls}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="أتعاب مرافعة — الربع الأول"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ الإصدار" optional>
              <input
                type="date"
                className={inputCls}
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </FormField>
            <FormField label="تاريخ الاستحقاق" optional>
              <input
                type="date"
                className={inputCls}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </FormField>
          </div>
        </div>

        <fieldset className="rounded-[var(--radius-m)] border border-border p-3">
          <legend className="text-label px-1">بنود الفاتورة</legend>
          <div className="grid gap-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-[var(--radius-m)] bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem_auto] sm:items-end sm:bg-transparent sm:p-0"
              >
                <FormField label={`البند ${index + 1}`} required>
                  <input
                    className={inputCls}
                    value={item.description}
                    maxLength={300}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, description: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="أتعاب إعداد مذكرة جوابية"
                  />
                </FormField>
                <FormField label="الكمية" required>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    className={inputCls}
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                  />
                </FormField>
                <FormField label="سعر الوحدة" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className={inputCls}
                    value={item.unitPrice}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, unitPrice: e.target.value } : r)),
                      )
                    }
                  />
                </FormField>
                <div className="flex items-center justify-between gap-2 sm:pb-1">
                  <span className="text-body-sm tabular-nums text-muted-foreground sm:hidden">
                    {fmtMoney(parsedItems[index]?.quantity * (parsedItems[index]?.unitPrice ?? 0))}
                  </span>
                  <IconBtn
                    tone="danger"
                    aria-label={`حذف البند ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconBtn>
                </div>
              </div>
            ))}
            <Btn
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
            >
              <Plus className="h-4 w-4" aria-hidden /> إضافة بند
            </Btn>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="نوع الخصم">
            <select
              className={inputCls}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
            >
              {DISCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DISCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="قيمة الخصم">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={inputCls}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </FormField>
          <FormField label="نسبة الضريبة %" hint="ضريبة القيمة المضافة 15% افتراضياً.">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              className={inputCls}
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="شروط الدفع" optional>
            <input
              className={inputCls}
              value={paymentTerms}
              maxLength={500}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="السداد خلال 14 يوماً من تاريخ الإصدار"
            />
          </FormField>
          <FormField label="ملاحظات" optional>
            <input
              className={inputCls}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </div>

        <dl className="grid gap-1.5 rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm">
          <Row label="الإجمالي قبل الضريبة" value={fmtMoney(totals.subtotal)} />
          <Row label="الخصم" value={fmtMoney(totals.discountTotal)} />
          <Row label={`الضريبة (${Number(taxRate) || 0}%)`} value={fmtMoney(totals.taxTotal)} />
          <Row label="الإجمالي المستحق" value={fmtMoney(totals.total)} strong />
        </dl>
        <p className="text-caption">هذه معاينة حسابية؛ القيم النهائية تُحسب في الخادم عند الحفظ.</p>

        {fieldError && (
          <p role="alert" className="text-body-sm text-danger">
            {fieldError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Btn variant="outline" onClick={onClose} disabled={save.isPending}>
            إلغاء
          </Btn>
          <Btn onClick={submit} loading={save.isPending}>
            {initial ? "حفظ التعديلات" : "حفظ كمسودة"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
