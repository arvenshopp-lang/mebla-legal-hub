import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Btn, FormField, IconBtn, Modal, inputCls } from "@/lib/list-utils";
import { salesOptions, salesSaveDraft, salesListTemplates } from "@/lib/sales-docs.functions";
import {
  APPROVAL_DISCOUNT_PERCENT_THRESHOLD,
  KIND_LABELS,
  computeSalesDocTotals,
  type DiscountType,
  type SalesDocKind,
} from "@/lib/sales-docs.shared";
import { Money } from "./shared";

export type DraftItem = { description: string; quantity: number; unitPrice: number; discountAmount: number };

export type DraftFormValue = {
  id?: string;
  kind: SalesDocKind;
  title: string;
  organizationId: string;
  companyId: string;
  contactId: string;
  templateId: string;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  intro: string;
  terms: string;
  notes: string;
  validUntil: string;
  startsOn: string;
  endsOn: string;
  items: DraftItem[];
};

export const emptyDraft = (kind: SalesDocKind): DraftFormValue => ({
  kind,
  title: "",
  organizationId: "",
  companyId: "",
  contactId: "",
  templateId: "",
  discountType: "percent",
  discountValue: 0,
  taxRate: 15,
  intro: "",
  terms: "",
  notes: "",
  validUntil: "",
  startsOn: "",
  endsOn: "",
  items: [{ description: "", quantity: 1, unitPrice: 0, discountAmount: 0 }],
});

const nullable = (value: string) => (value.trim() === "" ? null : value.trim());

export function DocumentFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: DraftFormValue;
  onSaved?: (id: string) => void;
}) {
  const [form, setForm] = useState<DraftFormValue>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const optionsFn = useServerFn(salesOptions);
  const templatesFn = useServerFn(salesListTemplates);
  const saveFn = useServerFn(salesSaveDraft);

  const options = useQuery({
    queryKey: ["sales-options"],
    queryFn: () => optionsFn({ data: undefined as never }),
    enabled: open,
    staleTime: 60_000,
  });
  const templates = useQuery({
    queryKey: ["sales-templates"],
    queryFn: () => templatesFn({ data: undefined as never }),
    enabled: open,
    staleTime: 60_000,
  });

  const totals = useMemo(
    () =>
      computeSalesDocTotals(
        form.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unitPrice) || 0,
          discount_amount: Number(item.discountAmount) || 0,
        })),
        form.discountType,
        Number(form.discountValue) || 0,
        Number(form.taxRate) || 0,
      ),
    [form.items, form.discountType, form.discountValue, form.taxRate],
  );

  const set = <K extends keyof DraftFormValue>(key: K, value: DraftFormValue[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setItem = (index: number, patch: Partial<DraftItem>) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const applyTemplate = (templateId: string) => {
    set("templateId", templateId);
    const template = templates.data?.templates.find((t) => t.id === templateId);
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      kind: template.kind,
      intro: template.intro ?? prev.intro,
      terms: template.terms ?? prev.terms,
      taxRate: template.default_tax_rate,
      items:
        template.items.length > 0
          ? template.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              discountAmount: item.discount_amount,
            }))
          : prev.items,
      validUntil:
        template.default_validity_days > 0
          ? new Date(Date.now() + template.default_validity_days * 86_400_000).toISOString().slice(0, 10)
          : prev.validUntil,
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        id: form.id ?? null,
        kind: form.kind,
        title: form.title.trim(),
        organizationId: nullable(form.organizationId),
        companyId: nullable(form.companyId),
        contactId: nullable(form.contactId),
        templateId: nullable(form.templateId),
        currency: "SAR" as const,
        discountType: form.discountType,
        discountValue: Number(form.discountValue) || 0,
        taxRate: Number(form.taxRate) || 0,
        intro: nullable(form.intro),
        terms: nullable(form.terms),
        notes: nullable(form.notes),
        validUntil: nullable(form.validUntil),
        startsOn: nullable(form.startsOn),
        endsOn: nullable(form.endsOn),
        items: form.items.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          discountAmount: Number(item.discountAmount) || 0,
        })),
      };
      return saveFn({ data: payload });
    },
    onSuccess: (result) => {
      toast.success(form.id ? "تم تحديث المستند." : "تم حفظ المسودة.");
      void queryClient.invalidateQueries({ queryKey: ["sales-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["sales-detail"] });
      onSaved?.(result.id);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "تعذّر حفظ المستند."),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (form.title.trim().length < 2) nextErrors.title = "عنوان المستند مطلوب.";
    if (form.items.length === 0) nextErrors.items = "أضف بنداً واحداً على الأقل.";
    form.items.forEach((item, index) => {
      if (item.description.trim().length < 2) nextErrors[`item-${index}`] = "وصف البند مطلوب.";
      if (!(Number(item.quantity) > 0)) nextErrors[`item-${index}`] = "الكمية يجب أن تكون أكبر من صفر.";
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    save.mutate();
  };

  const contacts = (options.data?.contacts ?? []).filter(
    (contact) => !form.companyId || contact.companyId === form.companyId || !contact.companyId,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={form.id ? `تعديل ${KIND_LABELS[form.kind]}` : `${KIND_LABELS[form.kind]} جديد`}
      description="الإجماليات تُحسب آلياً وتُعاد التحقق منها على الخادم قبل الحفظ."
      busy={save.isPending}
      busyLabel="جاري الحفظ…"
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="نوع المستند" required>
            <select className={inputCls} value={form.kind} onChange={(e) => set("kind", e.target.value as SalesDocKind)}>
              {(Object.keys(KIND_LABELS) as SalesDocKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="القالب" hint="اختيار القالب يعبّئ المقدمة والشروط والبنود.">
            <select className={inputCls} value={form.templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">بدون قالب</option>
              {(templates.data?.templates ?? [])
                .filter((template) => template.is_active)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
            </select>
          </FormField>
        </div>

        <FormField label="عنوان المستند" required error={errors.title}>
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="المكتب" hint="مطلوب للتحويل لاشتراك.">
            <select className={inputCls} value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)}>
              <option value="">غير مرتبط</option>
              {(options.data?.organizations ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الشركة (CRM)">
            <select className={inputCls} value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
              <option value="">غير مرتبط</option>
              {(options.data?.companies ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="جهة الاتصال">
            <select className={inputCls} value={form.contactId} onChange={(e) => set("contactId", e.target.value)}>
              <option value="">غير مرتبط</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="rounded-[var(--radius-m)] border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h4 className="text-label">البنود</h4>
            <Btn
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { description: "", quantity: 1, unitPrice: 0, discountAmount: 0 }],
                }))
              }
            >
              <Plus className="h-4 w-4" aria-hidden /> بند
            </Btn>
          </div>
          <div className="divide-y divide-border">
            {form.items.map((item, index) => (
              <div key={index} className="grid gap-3 p-4 sm:grid-cols-[1fr_5rem_7rem_7rem_auto] sm:items-end">
                <FormField label="الوصف" error={errors[`item-${index}`]}>
                  <input
                    className={inputCls}
                    value={item.description}
                    onChange={(e) => setItem(index, { description: e.target.value })}
                    maxLength={300}
                  />
                </FormField>
                <FormField label="الكمية">
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    className={inputCls}
                    value={item.quantity}
                    onChange={(e) => setItem(index, { quantity: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="سعر الوحدة">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputCls}
                    value={item.unitPrice}
                    onChange={(e) => setItem(index, { unitPrice: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="خصم البند">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputCls}
                    value={item.discountAmount}
                    onChange={(e) => setItem(index, { discountAmount: Number(e.target.value) })}
                  />
                </FormField>
                <IconBtn
                  aria-label="حذف البند" tone="danger"
                  onClick={() => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconBtn>
              </div>
            ))}
          </div>
          {errors.items && (
            <p role="alert" className="px-4 pb-3 text-[12px] text-danger">
              {errors.items}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="نوع الخصم">
            <select
              className={inputCls}
              value={form.discountType}
              onChange={(e) => set("discountType", e.target.value as DiscountType)}
            >
              <option value="percent">نسبة %</option>
              <option value="amount">مبلغ</option>
            </select>
          </FormField>
          <FormField label="قيمة الخصم">
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={form.discountValue}
              onChange={(e) => set("discountValue", Number(e.target.value))}
            />
          </FormField>
          <FormField label="نسبة الضريبة %">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className={inputCls}
              value={form.taxRate}
              onChange={(e) => set("taxRate", Number(e.target.value))}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="صالح حتى">
            <input type="date" className={inputCls} value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
          </FormField>
          <FormField label="بداية السريان">
            <input type="date" className={inputCls} value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
          </FormField>
          <FormField label="نهاية السريان">
            <input type="date" className={inputCls} value={form.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
          </FormField>
        </div>

        <FormField label="المقدمة">
          <textarea className={inputCls} rows={3} value={form.intro} onChange={(e) => set("intro", e.target.value)} maxLength={2000} />
        </FormField>
        <FormField label="الشروط والأحكام">
          <textarea className={inputCls} rows={4} value={form.terms} onChange={(e) => set("terms", e.target.value)} maxLength={4000} />
        </FormField>
        <FormField label="ملاحظات داخلية" hint="لا تظهر للعميل في ملف PDF.">
          <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
        </FormField>

        <div className="rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الإجمالي قبل الخصم</dt>
              <dd>
                <Money value={totals.subtotal} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الخصم</dt>
              <dd>
                <Money value={totals.discount_amount} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الضريبة</dt>
              <dd>
                <Money value={totals.tax_amount} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <dt>الإجمالي</dt>
              <dd>
                <Money value={totals.total} />
              </dd>
            </div>
          </dl>
          {totals.requires_approval && (
            <p className="mt-3 text-[12px] text-warning">
              نسبة الخصم {totals.effective_discount_percent}% تتجاوز الحد المسموح ({APPROVAL_DISCOUNT_PERCENT_THRESHOLD}%)، لذا
              يلزم اعتماد موظف آخر قبل الإرسال.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={submit} loading={save.isPending}>
            حفظ المسودة
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
