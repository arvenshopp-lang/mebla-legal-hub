/**
 * نافذة إنشاء/تعديل صفقة.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { createDeal, updateDeal } from "@/lib/crm.functions";
import type {
  CrmCompanyRow,
  CrmContactRow,
  CrmDealRow,
  CrmPipelineStageRow,
  StaffOption,
} from "@/lib/crm.shared";

export type DealDraft = {
  title: string;
  amount: number;
  currency: string;
  stage_id: string;
  company_id: string;
  contact_id: string;
  expected_close_date: string;
  source: string;
  notes: string;
  owner_staff_id: string;
};

export function emptyDealDraft(defaultStageId: string): DealDraft {
  return {
    title: "",
    amount: 0,
    currency: "SAR",
    stage_id: defaultStageId,
    company_id: "",
    contact_id: "",
    expected_close_date: "",
    source: "",
    notes: "",
    owner_staff_id: "",
  };
}

export function dealDraftFromRow(row: CrmDealRow): DealDraft {
  return {
    title: row.title,
    amount: row.amount,
    currency: row.currency,
    stage_id: row.stage_id ?? "",
    company_id: row.company_id ?? "",
    contact_id: row.contact_id ?? "",
    expected_close_date: row.expected_close_date ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    owner_staff_id: row.owner_staff_id ?? "",
  };
}

export function DealFormModal({
  open,
  onClose,
  onSaved,
  initial,
  editId,
  staffOptions,
  companyOptions,
  contactOptions,
  stageOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: DealDraft;
  editId?: string;
  staffOptions: StaffOption[];
  companyOptions: Pick<CrmCompanyRow, "id" | "name">[];
  contactOptions: Pick<CrmContactRow, "id" | "full_name">[];
  stageOptions: CrmPipelineStageRow[];
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(createDeal);
  const updateFn = useServerFn(updateDeal);
  const set = (patch: Partial<DealDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.title.trim().length < 2) {
      setErrors({ title: "عنوان الصفقة مطلوب" });
      return;
    }
    if (!draft.stage_id) {
      setErrors({ stage_id: "اختر مرحلة خط البيع" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateFn({ data: { id: editId, ...draft } });
        toast.success("تم تحديث الصفقة.");
      } else {
        await createFn({ data: draft });
        toast.success("تم إنشاء الصفقة.");
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ الصفقة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "تعديل صفقة" : "صفقة جديدة"}
      size="lg"
      busy={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="عنوان الصفقة" required error={errors.title}>
          <input
            className={inputCls}
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </FormField>
        <FormField label="مرحلة خط البيع" required error={errors.stage_id}>
          <select
            className={inputCls}
            value={draft.stage_id}
            onChange={(e) => set({ stage_id: e.target.value })}
            disabled={!!editId}
          >
            <option value="">اختر مرحلة</option>
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="القيمة">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={draft.amount}
            onChange={(e) => set({ amount: Number(e.target.value) || 0 })}
          />
        </FormField>
        <FormField label="العملة">
          <input
            className={inputCls}
            maxLength={3}
            value={draft.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
          />
        </FormField>
        <FormField label="الشركة">
          <select
            className={inputCls}
            value={draft.company_id}
            onChange={(e) => set({ company_id: e.target.value })}
          >
            <option value="">بلا شركة</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="جهة الاتصال">
          <select
            className={inputCls}
            value={draft.contact_id}
            onChange={(e) => set({ contact_id: e.target.value })}
          >
            <option value="">بلا جهة اتصال</option>
            {contactOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="تاريخ الإغلاق المتوقع">
          <input
            type="date"
            className={inputCls}
            value={draft.expected_close_date}
            onChange={(e) => set({ expected_close_date: e.target.value })}
          />
        </FormField>
        <FormField label="المصدر">
          <input
            className={inputCls}
            value={draft.source}
            onChange={(e) => set({ source: e.target.value })}
          />
        </FormField>
        <FormField label="المسؤول">
          <select
            className={inputCls}
            value={draft.owner_staff_id}
            onChange={(e) => set({ owner_staff_id: e.target.value })}
          >
            <option value="">بلا مسؤول</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="ملاحظات">
          <textarea
            className={inputCls}
            rows={3}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </FormField>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={submit} loading={saving}>
          {editId ? "حفظ التعديلات" : "إنشاء الصفقة"}
        </Btn>
      </div>
    </Modal>
  );
}
