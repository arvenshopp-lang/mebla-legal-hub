/**
 * نافذة إنشاء/تعديل جهة اتصال.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { createContact, updateContact } from "@/lib/crm.functions";
import type { CrmCompanyRow, CrmContactRow, StaffOption } from "@/lib/crm.shared";

export type ContactDraft = {
  full_name: string;
  company_id: string;
  job_title: string;
  email: string;
  phone: string;
  city: string;
  is_primary: boolean;
  notes: string;
  owner_staff_id: string;
};

export function emptyContactDraft(): ContactDraft {
  return {
    full_name: "",
    company_id: "",
    job_title: "",
    email: "",
    phone: "",
    city: "",
    is_primary: false,
    notes: "",
    owner_staff_id: "",
  };
}

export function contactDraftFromRow(row: CrmContactRow): ContactDraft {
  return {
    full_name: row.full_name,
    company_id: row.company_id ?? "",
    job_title: row.job_title ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    city: row.city ?? "",
    is_primary: row.is_primary,
    notes: row.notes ?? "",
    owner_staff_id: row.owner_staff_id ?? "",
  };
}

export function ContactFormModal({
  open,
  onClose,
  onSaved,
  initial,
  editId,
  staffOptions,
  companyOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: ContactDraft;
  editId?: string;
  staffOptions: StaffOption[];
  companyOptions: Pick<CrmCompanyRow, "id" | "name">[];
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(createContact);
  const updateFn = useServerFn(updateContact);
  const set = (patch: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.full_name.trim().length < 2) {
      setErrors({ full_name: "اسم جهة الاتصال مطلوب" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateFn({ data: { id: editId, ...draft } });
        toast.success("تم تحديث جهة الاتصال.");
      } else {
        await createFn({ data: draft });
        toast.success("تم إنشاء جهة الاتصال.");
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ جهة الاتصال.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "تعديل جهة اتصال" : "جهة اتصال جديدة"}
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
        <FormField label="المسمى الوظيفي">
          <input
            className={inputCls}
            value={draft.job_title}
            onChange={(e) => set({ job_title: e.target.value })}
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
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={draft.is_primary}
            onChange={(e) => set({ is_primary: e.target.checked })}
          />
          جهة الاتصال الأساسية للشركة
        </label>
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
          {editId ? "حفظ التعديلات" : "إنشاء جهة الاتصال"}
        </Btn>
      </div>
    </Modal>
  );
}
