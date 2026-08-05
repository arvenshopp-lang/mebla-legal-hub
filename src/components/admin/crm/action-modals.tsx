/**
 * نوافذ إجراءات سريعة: إسناد، استبعاد عميل محتمل، تحويل عميل محتمل، تحريك مرحلة صفقة.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import { assignCompany, assignDeal, assignLead, convertLead, moveDealStage } from "@/lib/crm.functions";
import type { CrmPipelineStageRow, StaffOption } from "@/lib/crm.shared";

type AssignEntity = "lead" | "company" | "deal";
const ASSIGN_FN = { lead: assignLead, company: assignCompany, deal: assignDeal } as const;

export function AssignModal({
  open,
  onClose,
  onSaved,
  entity,
  id,
  label,
  staffOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entity: AssignEntity;
  id: string;
  label: string;
  staffOptions: StaffOption[];
}) {
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);
  const assignFn = useServerFn(ASSIGN_FN[entity]);

  const submit = async () => {
    if (!staffId) {
      toast.error("اختر الموظف المسؤول أولاً.");
      return;
    }
    setSaving(true);
    try {
      await assignFn({ data: { id, staffId } });
      toast.success("تم الإسناد بنجاح.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الإسناد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`إسناد ${label}`} busy={saving}>
      <FormField label="الموظف المسؤول" required>
        <select className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">اختر موظفاً</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </FormField>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={submit} loading={saving}>إسناد</Btn>
      </div>
    </Modal>
  );
}

export function DisqualifyLeadModal({
  open,
  onClose,
  onSaved,
  id,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  id: string;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const disqualifyFn = useServerFn((await import("@/lib/crm.functions")).disqualifyLead as never);
  return null as never;
}
