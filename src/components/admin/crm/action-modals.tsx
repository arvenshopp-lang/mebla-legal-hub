/**
 * نوافذ إجراءات سريعة: إسناد، استبعاد عميل محتمل، تحويل عميل محتمل، تحريك مرحلة صفقة.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FormField, Modal, inputCls, Btn } from "@/lib/list-utils";
import {
  assignCompany,
  assignDeal,
  assignLead,
  convertLead,
  disqualifyLead,
  moveDealStage,
} from "@/lib/crm.functions";
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
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={submit} loading={saving}>
          إسناد
        </Btn>
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const disqualifyFn = useServerFn(disqualifyLead);

  const submit = async () => {
    setError("");
    if (reason.trim().length < 3) {
      setError("اذكر سبب الاستبعاد (٣ أحرف على الأقل).");
      return;
    }
    setSaving(true);
    try {
      await disqualifyFn({ data: { id, reason } });
      toast.success("تم استبعاد العميل المحتمل.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر استبعاد العميل المحتمل.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="استبعاد عميل محتمل" busy={saving}>
      <FormField label="سبب الاستبعاد" required error={error}>
        <textarea
          className={inputCls}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn variant="danger" onClick={submit} loading={saving}>
          استبعاد
        </Btn>
      </div>
    </Modal>
  );
}

export function ConvertLeadModal({
  open,
  onClose,
  onSaved,
  id,
  leadName,
  companyName,
  staffOptions,
  stageOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  id: string;
  leadName: string;
  companyName: string | null;
  staffOptions: StaffOption[];
  stageOptions: CrmPipelineStageRow[];
}) {
  const [companyNameInput, setCompanyNameInput] = useState(companyName ?? "");
  const [dealTitle, setDealTitle] = useState(`صفقة ${leadName}`);
  const [dealAmount, setDealAmount] = useState(0);
  const [dealCurrency, setDealCurrency] = useState("SAR");
  const [stageId, setStageId] = useState(stageOptions[0]?.id ?? "");
  const [ownerStaffId, setOwnerStaffId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const convertFn = useServerFn(convertLead);

  const submit = async () => {
    setErrors({});
    if (dealTitle.trim().length < 2) {
      setErrors({ dealTitle: "عنوان الصفقة مطلوب" });
      return;
    }
    if (!stageId) {
      setErrors({ stageId: "اختر مرحلة خط البيع" });
      return;
    }
    setSaving(true);
    try {
      await convertFn({
        data: {
          id,
          companyName: companyNameInput,
          dealTitle,
          dealAmount,
          dealCurrency,
          stageId,
          ownerStaffId,
        },
      });
      toast.success("تم تحويل العميل المحتمل إلى شركة وصفقة.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحويل العميل المحتمل.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`تحويل العميل المحتمل «${leadName}»`}
      size="lg"
      busy={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="اسم الشركة">
          <input
            className={inputCls}
            value={companyNameInput}
            onChange={(e) => setCompanyNameInput(e.target.value)}
          />
        </FormField>
        <FormField label="عنوان الصفقة" required error={errors.dealTitle}>
          <input
            className={inputCls}
            value={dealTitle}
            onChange={(e) => setDealTitle(e.target.value)}
          />
        </FormField>
        <FormField label="قيمة الصفقة">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={dealAmount}
            onChange={(e) => setDealAmount(Number(e.target.value) || 0)}
          />
        </FormField>
        <FormField label="العملة">
          <input
            className={inputCls}
            maxLength={3}
            value={dealCurrency}
            onChange={(e) => setDealCurrency(e.target.value.toUpperCase())}
          />
        </FormField>
        <FormField label="مرحلة خط البيع" required error={errors.stageId}>
          <select className={inputCls} value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">اختر مرحلة</option>
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="المسؤول">
          <select
            className={inputCls}
            value={ownerStaffId}
            onChange={(e) => setOwnerStaffId(e.target.value)}
          >
            <option value="">الإبقاء على المسؤول الحالي</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={submit} loading={saving}>
          تحويل
        </Btn>
      </div>
    </Modal>
  );
}

export function MoveDealStageModal({
  open,
  onClose,
  onSaved,
  id,
  dealTitle,
  stageOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  id: string;
  dealTitle: string;
  stageOptions: CrmPipelineStageRow[];
}) {
  const [stageId, setStageId] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const moveFn = useServerFn(moveDealStage);
  const selectedStage = stageOptions.find((s) => s.id === stageId);

  const submit = async () => {
    setError("");
    if (!stageId) {
      setError("اختر مرحلة خط البيع الجديدة.");
      return;
    }
    if (selectedStage?.is_lost && lostReason.trim().length < 1) {
      setError("اذكر سبب خسارة الصفقة.");
      return;
    }
    setSaving(true);
    try {
      await moveFn({ data: { id, stageId, lostReason } });
      toast.success("تم تحريك الصفقة.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحريك الصفقة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`تحريك مرحلة صفقة «${dealTitle}»`} busy={saving}>
      <FormField label="المرحلة الجديدة" required error={error}>
        <select className={inputCls} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">اختر مرحلة</option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FormField>
      {selectedStage?.is_lost && (
        <div className="mt-4">
          <FormField label="سبب الخسارة" required>
            <textarea
              className={inputCls}
              rows={2}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
          </FormField>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={submit} loading={saving}>
          تحريك
        </Btn>
      </div>
    </Modal>
  );
}
