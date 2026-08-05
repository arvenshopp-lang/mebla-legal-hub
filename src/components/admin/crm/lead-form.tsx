/**
 * نافذة إنشاء/تعديل عميل محتمل.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { createLead, updateLead } from "@/lib/crm.functions";
import type { CrmLeadRow, StaffOption } from "@/lib/crm.shared";

export type LeadDraft = {
  full_name: string;
  company_name: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  notes: string;
  owner_staff_id: string;
};

export function emptyLeadDraft(): LeadDraft {
  return {
    full_name: "",
    company_name: "",
    email: "",
    phone: "",
    city: "",
    source: "",
    notes: "",
    owner_staff_id: "",
  };
}

export function leadDraftFromRow(row: CrmLeadRow): LeadDraft {
  return {
    full_name: row.full_name,
    company_name: row.company_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    city: row.city ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    owner_staff_id: row.owner_staff_id ?? "",
  };
}

export function LeadFormModal({
  open,
  onClose,
  onSaved,
  initial,
  editId,
  staffOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: LeadDraft;
  editId?: string;
  staffOptions: StaffOption[];
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(createLead);
  const updateFn = useServerFn(updateLead);

  const set = (patch: Partial<LeadDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.full_name.trim().length < 2) {
      setErrors({ full_name: "اسم العميل المحتمل مطلوب" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateFn({ data: { id: editId, ...draft } });
        toast.success("تم تحديث العميل المحتمل.");
      } else {
        await createFn({ data: draft });
        toast.success("تم إنشاء العميل المحتمل.");
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ العميل المحتمل.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "تعديل عميل محتمل" : "عميل محتمل جديد"}
      size="lg"
      busy={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الاسم الكامل" required error={errors.full_name}>
          <input
            className={inputCls}
            value={draft.full_name}
            onChange={(e) => set({ full_name: e.target.value })}
          />
        </FormField>
        <FormField label="اسم الشركة">
          <input
            className={inputCls}
            value={draft.company_name}
            onChange={(e) => set({ company_name: e.target.value })}
          />
        </FormField>
        <FormField label="البريد الإلكتروني">
          <input
            type="email"
            className={inputCls}
            value={draft.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField label="الجوال">
          <input
            className={inputCls}
            value={draft.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField label="المدينة">
          <input
            className={inputCls}
            value={draft.city}
            onChange={(e) => set({ city: e.target.value })}
          />
        </FormField>
        <FormField label="المصدر">
          <input
            className={inputCls}
            value={draft.source}
            onChange={(e) => set({ source: e.target.value })}
            placeholder="موقع، إحالة، معرض…"
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
        <FormField label="ملاحظات" hint="اختياري">
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
          {editId ? "حفظ التعديلات" : "إنشاء العميل المحتمل"}
        </Btn>
      </div>
    </Modal>
  );
}
