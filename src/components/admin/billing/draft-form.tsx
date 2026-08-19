import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Btn, FormField, Modal, inputCls } from "@/lib/list-utils";
import {
  computeTotals,
  formatMoney,
  type InvoiceDetail,
  type InvoiceItemInput,
} from "@/lib/billing/billing.shared";
import { num } from "./shared";

export type DraftFormValue = {
  id: string | null;
  organizationId: string | null;
  customerName: string;
  customerLegalName: string;
  customerEmail: string;
  customerPhone: string;
  billingAddress: string;
  commercialRegistration: string;
  taxNumber: string;
  planLabel: string;
  taxRate: number;
  taxExempt: boolean;
  taxExemptionReason: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  dueAt: string;
  notes: string;
  internalNotes: string;
  items: InvoiceItemInput[];
};

const emptyItem: InvoiceItemInput = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  discountAmount: 0,
};

export function emptyDraft(defaultRate: number): DraftFormValue {
  return {
    id: null,
    organizationId: null,
    customerName: "",
    customerLegalName: "",
    customerEmail: "",
    customerPhone: "",
    billingAddress: "",
    commercialRegistration: "",
    taxNumber: "",
    planLabel: "",
    taxRate: defaultRate,
    taxExempt: false,
    taxExemptionReason: "",
    servicePeriodStart: "",
    servicePeriodEnd: "",
    dueAt: "",
    notes: "",
    internalNotes: "",
    items: [{ ...emptyItem }],
  };
}

export function draftFromInvoice(invoice: InvoiceDetail): DraftFormValue {
  return {
    id: invoice.id,
    organizationId: invoice.organization_id,
    customerName: invoice.customer_name ?? "",
    customerLegalName: invoice.customer_legal_name ?? "",
    customerEmail: invoice.customer_email ?? "",
    customerPhone: invoice.customer_phone ?? "",
    billingAddress: invoice.billing_address ?? "",
    commercialRegistration: invoice.commercial_registration ?? "",
    taxNumber: invoice.tax_number ?? "",
    planLabel: invoice.plan_label ?? "",
    taxRate: Number(invoice.tax_rate ?? 15),
    taxExempt: Boolean(invoice.tax_exempt),
    taxExemptionReason: invoice.tax_exemption_reason ?? "",
    servicePeriodStart: invoice.service_period_start ?? "",
    servicePeriodEnd: invoice.service_period_end ?? "",
    dueAt: invoice.due_at ? invoice.due_at.slice(0, 10) : "",
    notes: invoice.notes ?? "",
    internalNotes: invoice.internal_notes ?? "",
    items: invoice.items.length
      ? invoice.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
        }))
      : [{ ...emptyItem }],
  };
}

/** نموذج مسودة الفاتورة — الإجماليات معروضة للاستئناس فقط وتُحتسب نهائياً على الخادم. */
export function DraftFormModal({
  open,
  onClose,
  initial,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial: DraftFormValue;
  saving: boolean;
  onSubmit: (value: DraftFormValue) => void;
}) {
  const [value, setValue] = useState<DraftFormValue>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setValue(initial);
      setErrors({});
    }
    // نُعيد التهيئة عند الفتح فقط حتى لا تُفقد مدخلات المستخدم أثناء الكتابة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial.id]);

  const totals = useMemo(
    () => computeTotals(value.items, value.taxRate, value.taxExempt),
    [value.items, value.taxExempt, value.taxRate],
  );

  const patch = (part: Partial<DraftFormValue>) => setValue((prev) => ({ ...prev, ...part }));
  const patchItem = (index: number, part: Partial<InvoiceItemInput>) =>
    setValue((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...part } : item)),
    }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (value.customerName.trim().length < 2) next["customerName"] = "اسم العميل مطلوب.";
    if (value.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.customerEmail.trim()))
      next["customerEmail"] = "البريد الإلكتروني غير صالح.";
    if (value.taxExempt && value.taxExemptionReason.trim().length < 2)
      next["taxExemptionReason"] = "سبب الإعفاء الضريبي مطلوب.";
    value.items.forEach((item, index) => {
      if (item.description.trim().length < 2)
        next[`item-${index}-description`] = "وصف البند مطلوب.";
      if (!(item.quantity > 0)) next[`item-${index}-quantity`] = "الكمية أكبر من صفر.";
      if (item.discountAmount > item.quantity * item.unitPrice)
        next[`item-${index}-discount`] = "الخصم يتجاوز قيمة البند.";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={value.id ? "تعديل مسودة الفاتورة" : "مسودة فاتورة جديدة"}
      description="تُحتسب الإجماليات والضريبة على الخادم — القيم المعروضة هنا للاستئناس فقط."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) onSubmit(value);
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم العميل" required error={errors["customerName"]}>
            <input
              className={inputCls}
              value={value.customerName}
              onChange={(e) => patch({ customerName: e.target.value })}
              autoComplete="off"
            />
          </FormField>
          <FormField label="الاسم النظامي (اختياري)">
            <input
              className={inputCls}
              value={value.customerLegalName}
              onChange={(e) => patch({ customerLegalName: e.target.value })}
            />
          </FormField>
          <FormField
            label="البريد الإلكتروني"
            hint="يُستخدم لإرسال الفاتورة والتذكيرات."
            error={errors["customerEmail"]}
          >
            <input
              type="email"
              dir="ltr"
              className={inputCls}
              value={value.customerEmail}
              onChange={(e) => patch({ customerEmail: e.target.value })}
            />
          </FormField>
          <FormField label="الجوال">
            <input
              dir="ltr"
              className={inputCls}
              value={value.customerPhone}
              onChange={(e) => patch({ customerPhone: e.target.value })}
            />
          </FormField>
          <FormField label="السجل التجاري">
            <input
              dir="ltr"
              className={inputCls}
              value={value.commercialRegistration}
              onChange={(e) => patch({ commercialRegistration: e.target.value })}
            />
          </FormField>
          <FormField label="الرقم الضريبي">
            <input
              dir="ltr"
              className={inputCls}
              value={value.taxNumber}
              onChange={(e) => patch({ taxNumber: e.target.value })}
            />
          </FormField>
          <FormField label="عنوان الفوترة">
            <input
              className={inputCls}
              value={value.billingAddress}
              onChange={(e) => patch({ billingAddress: e.target.value })}
            />
          </FormField>
          <FormField label="وصف الباقة (اختياري)">
            <input
              className={inputCls}
              value={value.planLabel}
              onChange={(e) => patch({ planLabel: e.target.value })}
            />
          </FormField>
          <FormField label="بداية فترة الخدمة">
            <input
              type="date"
              className={inputCls}
              value={value.servicePeriodStart}
              onChange={(e) => patch({ servicePeriodStart: e.target.value })}
            />
          </FormField>
          <FormField label="نهاية فترة الخدمة">
            <input
              type="date"
              className={inputCls}
              value={value.servicePeriodEnd}
              onChange={(e) => patch({ servicePeriodEnd: e.target.value })}
            />
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            <input
              type="date"
              className={inputCls}
              value={value.dueAt}
              onChange={(e) => patch({ dueAt: e.target.value })}
            />
          </FormField>
          <FormField label="نسبة الضريبة %">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              className={inputCls}
              disabled={value.taxExempt}
              value={String(value.taxRate)}
              onChange={(e) => patch({ taxRate: num(e.target.value) })}
            />
          </FormField>
        </div>

        <label className="flex items-center gap-2.5 text-body-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-primary)]"
            checked={value.taxExempt}
            onChange={(e) => patch({ taxExempt: e.target.checked })}
          />
          فاتورة معفاة من الضريبة
        </label>
        {value.taxExempt && (
          <FormField label="سبب الإعفاء الضريبي" required error={errors["taxExemptionReason"]}>
            <input
              className={inputCls}
              value={value.taxExemptionReason}
              onChange={(e) => patch({ taxExemptionReason: e.target.value })}
            />
          </FormField>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-label">بنود الفاتورة</h4>
            <Btn
              variant="outline"
              size="sm"
              onClick={() =>
                setValue((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }))
              }
            >
              <Plus className="h-4 w-4" aria-hidden /> بند
            </Btn>
          </div>
          <div className="space-y-3">
            {value.items.map((item, index) => (
              <div key={index} className="rounded-[var(--radius-m)] border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
                  <FormField label="الوصف" required error={errors[`item-${index}-description`]}>
                    <input
                      className={inputCls}
                      value={item.description}
                      onChange={(e) => patchItem(index, { description: e.target.value })}
                    />
                  </FormField>
                  <FormField label="الكمية" error={errors[`item-${index}-quantity`]}>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      dir="ltr"
                      className={inputCls}
                      value={String(item.quantity)}
                      onChange={(e) => patchItem(index, { quantity: num(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="سعر الوحدة">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      className={inputCls}
                      value={String(item.unitPrice)}
                      onChange={(e) => patchItem(index, { unitPrice: num(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="الخصم" error={errors[`item-${index}-discount`]}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      className={inputCls}
                      value={String(item.discountAmount)}
                      onChange={(e) => patchItem(index, { discountAmount: num(e.target.value) })}
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Btn
                      variant="ghost"
                      size="icon"
                      aria-label={`حذف البند ${index + 1}`}
                      disabled={value.items.length === 1}
                      onClick={() =>
                        setValue((prev) => ({
                          ...prev,
                          items: prev.items.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                    </Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm">
          <div className="flex justify-between">
            <span>المجموع قبل الضريبة</span>
            <Money value={totals.subtotal} />
          </div>
          <div className="mt-1 flex justify-between">
            <span>الخصم</span>
            <Money value={totals.discountTotal} />
          </div>
          <div className="mt-1 flex justify-between">
            <span>الضريبة</span>
            <Money value={totals.taxTotal} />
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>الإجمالي التقديري</span>
            <Money value={totals.total} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="ملاحظات تظهر للعميل">
            <textarea
              rows={3}
              className={inputCls}
              value={value.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </FormField>
          <FormField label="ملاحظات داخلية" hint="لا تظهر للعميل.">
            <textarea
              rows={3}
              className={inputCls}
              value={value.internalNotes}
              onChange={(e) => patch({ internalNotes: e.target.value })}
            />
          </FormField>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Btn variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Btn>
          <Btn type="submit" loading={saving}>
            حفظ المسودة
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
