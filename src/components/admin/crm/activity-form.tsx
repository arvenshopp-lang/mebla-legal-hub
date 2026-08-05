/**
 * نافذة إنشاء نشاط (اجتماع/مكالمة/ملاحظة/مهمة/متابعة/بريد) مرتبط بسجل CRM.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { createActivity } from "@/lib/crm.functions";
import {
  CRM_ACTIVITY_KIND_LABEL,
  CRM_ENTITY_KIND_LABEL,
  type CrmActivityKind,
  type CrmEntityKind,
  type StaffOption,
} from "@/lib/crm.shared";

export type ActivityDraft = {
  kind: CrmActivityKind;
  entity_kind: CrmEntityKind;
  subject: string;
  body: string;
  due_at: string;
  owner_staff_id: string;
  lead_id: string;
  company_id: string;
  contact_id: string;
  deal_id: string;
};

export function emptyActivityDraft(entityKind: CrmEntityKind, entityId: string): ActivityDraft {
  return {
    kind: "note",
    entity_kind: entityKind,
    subject: "",
    body: "",
    due_at: "",
    owner_staff_id: "",
    lead_id: entityKind === "lead" ? entityId : "",
    company_id: entityKind === "company" ? entityId : "",
    contact_id: entityKind === "contact" ? entityId : "",
    deal_id: entityKind === "deal" ? entityId : "",
  };
}

export function ActivityFormModal({
  open,
  onClose,
  onSaved,
  initial,
  staffOptions,
  lockEntity = true,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: ActivityDraft;
  staffOptions: StaffOption[];
  lockEntity?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(createActivity);
  const set = (patch: Partial<ActivityDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.subject.trim().length < 2) {
      setErrors({ subject: "عنوان النشاط مطلوب" });
      return;
    }
    setSaving(true);
    try {
      await createFn({ data: draft });
      toast.success("تم إنشاء النشاط.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إنشاء النشاط.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="نشاط جديد" size="lg" busy={saving}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="النوع" required>
          <select
            className={inputCls}
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as CrmActivityKind })}
          >
            {(Object.keys(CRM_ACTIVITY_KIND_LABEL) as CrmActivityKind[]).map((k) => (
              <option key={k} value={k}>
                {CRM_ACTIVITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="مرتبط بـ" required>
          <select
            className={inputCls}
            value={draft.entity_kind}
            disabled={lockEntity}
            onChange={(e) => set({ entity_kind: e.target.value as CrmEntityKind })}
          >
            {(Object.keys(CRM_ENTITY_KIND_LABEL) as CrmEntityKind[]).map((k) => (
              <option key={k} value={k}>
                {CRM_ENTITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="العنوان" required error={errors.subject}>
          <input
            className={inputCls}
            value={draft.subject}
            onChange={(e) => set({ subject: e.target.value })}
          />
        </FormField>
        <FormField label="الاستحقاق">
          <input
            type="datetime-local"
            className={inputCls}
            value={draft.due_at}
            onChange={(e) => set({ due_at: e.target.value })}
          />
        </FormField>
        <FormField label="المسؤول">
          <select
            className={inputCls}
            value={draft.owner_staff_id}
            onChange={(e) => set({ owner_staff_id: e.target.value })}
          >
            <option value="">أنا (تلقائياً)</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="تفاصيل" hint="اختياري">
          <textarea
            className={inputCls}
            rows={3}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
          />
        </FormField>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={submit} loading={saving}>
          إنشاء النشاط
        </Btn>
      </div>
    </Modal>
  );
}
