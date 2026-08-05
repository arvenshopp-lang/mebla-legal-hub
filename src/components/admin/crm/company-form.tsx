/**
 * نافذة إنشاء/تعديل شركة.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { createCompany, updateCompany } from "@/lib/crm.functions";
import type { CrmCompanyRow, StaffOption } from "@/lib/crm.shared";

export type CompanyDraft = {
  name: string;
  legal_name: string;
  sector: string;
  size_bracket: string;
  city: string;
  website: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  notes: string;
  owner_staff_id: string;
};

export function emptyCompanyDraft(): CompanyDraft {
  return {
    name: "", legal_name: "", sector: "", size_bracket: "", city: "", website: "",
    email: "", phone: "", status: "active", source: "", notes: "", owner_staff_id: "",
  };
}

export function companyDraftFromRow(row: CrmCompanyRow): CompanyDraft {
  return {
    name: row.name,
    legal_name: row.legal_name ?? "",
    sector: row.sector ?? "",
    size_bracket: row.size_bracket ?? "",
    city: row.city ?? "",
    website: row.website ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    status: row.status,
    source: row.source ?? "",
    notes: row.notes ?? "",
    owner_staff_id: row.owner_staff_id ?? "",
  };
}

export function CompanyFormModal({
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
  initial: CompanyDraft;
  editId?: string;
  staffOptions: StaffOption[];
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(createCompany);
  const updateFn = useServerFn(updateCompany);
  const set = (patch: Partial<CompanyDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.name.trim().length < 2) {
      setErrors({ name: "اسم الشركة مطلوب" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateFn({ data: { id: editId, ...draft } });
        toast.success("تم تحديث الشركة.");
      } else {
        await createFn({ data: draft });
        toast.success("تم إنشاء الشركة.");
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ الشركة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? "تعديل شركة" : "شركة جديدة"} size="lg" busy={saving}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="اسم الشركة" required error={errors.name}>
          <input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <FormField label="الاسم القانوني">
          <input className={inputCls} value={draft.legal_name} onChange={(e) => set({ legal_name: e.target.value })} />
        </FormField>
        <FormField label="القطاع">
          <input className={inputCls} value={draft.sector} onChange={(e) => set({ sector: e.target.value })} />
        </FormField>
        <FormField label="حجم الشركة">
          <input className={inputCls} value={draft.size_bracket} onChange={(e) => set({ size_bracket: e.target.value })} placeholder="صغيرة، متوسطة، كبيرة…" />
        </FormField>
        <FormField label="المدينة">
          <input className={inputCls} value={draft.city} onChange={(e) => set({ city: e.target.value })} />
        </FormField>
        <FormField label="الموقع الإلكتروني">
          <input className={inputCls} value={draft.website} onChange={(e) => set({ website: e.target.value })} />
        </FormField>
        <FormField label="البريد الإلكتروني">
          <input type="email" className={inputCls} value={draft.email} onChange={(e) => set({ email: e.target.value })} />
        </FormField>
        <FormField label="الجوال">
          <input className={inputCls} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
        </FormField>
        <FormField label="الحالة">
          <select className={inputCls} value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="active">نشطة</option>
            <option value="inactive">غير نشطة</option>
          </select>
        </FormField>
        <FormField label="المصدر">
          <input className={inputCls} value={draft.source} onChange={(e) => set({ source: e.target.value })} />
        </FormField>
        <FormField label="المسؤول">
          <select className={inputCls} value={draft.owner_staff_id} onChange={(e) => set({ owner_staff_id: e.target.value })}>
            <option value="">بلا مسؤول</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="ملاحظات">
          <textarea className={inputCls} rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </FormField>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={submit} loading={saving}>{editId ? "حفظ التعديلات" : "إنشاء الشركة"}</Btn>
      </div>
    </Modal>
  );
}
