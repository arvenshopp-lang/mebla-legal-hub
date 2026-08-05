/**
 * نافذة إنشاء/تعديل مرحلة خط البيع.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { upsertPipelineStage } from "@/lib/crm.functions";
import type { CrmPipelineStageRow } from "@/lib/crm.shared";

export type StageDraft = {
  name: string;
  sort_order: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
};

export function emptyStageDraft(nextOrder: number): StageDraft {
  return { name: "", sort_order: nextOrder, probability: 0, is_won: false, is_lost: false, is_active: true };
}

export function stageDraftFromRow(row: CrmPipelineStageRow): StageDraft {
  return {
    name: row.name,
    sort_order: row.sort_order,
    probability: row.probability,
    is_won: row.is_won,
    is_lost: row.is_lost,
    is_active: row.is_active,
  };
}

export function StageFormModal({
  open,
  onClose,
  onSaved,
  initial,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: StageDraft;
  editId?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upsertFn = useServerFn(upsertPipelineStage);
  const set = (patch: Partial<StageDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setErrors({});
    if (draft.name.trim().length < 2) {
      setErrors({ name: "اسم المرحلة مطلوب" });
      return;
    }
    if (draft.is_won && draft.is_lost) {
      setErrors({ is_lost: "لا يمكن أن تكون المرحلة مكسوبة ومفقودة معاً" });
      return;
    }
    setSaving(true);
    try {
      await upsertFn({ data: editId ? { id: editId, ...draft } : draft });
      toast.success(editId ? "تم تحديث المرحلة." : "تم إنشاء المرحلة.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ المرحلة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? "تعديل مرحلة" : "مرحلة جديدة"} busy={saving}>
      <div className="grid gap-4">
        <FormField label="اسم المرحلة" required error={errors.name}>
          <input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="الترتيب">
            <input type="number" min={0} className={inputCls} value={draft.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) || 0 })} />
          </FormField>
          <FormField label="احتمالية الفوز (%)">
            <input type="number" min={0} max={100} className={inputCls} value={draft.probability} onChange={(e) => set({ probability: Number(e.target.value) || 0 })} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-4 text-body-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.is_won} onChange={(e) => set({ is_won: e.target.checked, is_lost: e.target.checked ? false : draft.is_lost })} />
            مرحلة مكسوبة (تُغلق الصفقة كمكسوبة)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.is_lost} onChange={(e) => set({ is_lost: e.target.checked, is_won: e.target.checked ? false : draft.is_won })} />
            مرحلة مفقودة (تُغلق الصفقة كمفقودة)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            مرحلة نشطة
          </label>
        </div>
        {errors.is_lost && <p role="alert" className="text-[12px] text-danger">{errors.is_lost}</p>}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={submit} loading={saving}>{editId ? "حفظ التعديلات" : "إنشاء المرحلة"}</Btn>
      </div>
    </Modal>
  );
}
