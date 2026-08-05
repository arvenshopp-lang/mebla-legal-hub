import { useState } from "react";
import { FormField, Modal, Btn, inputCls } from "@/lib/list-utils";
import {
  HR_EMPLOYMENT_STATUS,
  HR_EMPLOYMENT_STATUS_LABELS,
  HR_EMPLOYMENT_TYPE,
  HR_EMPLOYMENT_TYPE_LABELS,
  type HrEmployeeRow,
  type HrEmploymentStatus,
  type HrEmploymentType,
} from "@/lib/hr.shared";

export type EmployeeFormValues = {
  full_name: string;
  email: string;
  phone: string;
  job_title: string;
  department_id: string;
  manager_employee_id: string;
  staff_id: string;
  employment_status: HrEmploymentStatus;
  employment_type: HrEmploymentType;
  work_location: string;
  joined_at: string;
  notes: string;
};

export function emptyEmployeeForm(): EmployeeFormValues {
  return {
    full_name: "",
    email: "",
    phone: "",
    job_title: "",
    department_id: "",
    manager_employee_id: "",
    staff_id: "",
    employment_status: "active",
    employment_type: "full_time",
    work_location: "",
    joined_at: "",
    notes: "",
  };
}

export function toEmployeeForm(e: HrEmployeeRow): EmployeeFormValues {
  return {
    full_name: e.full_name,
    email: e.email,
    phone: e.phone ?? "",
    job_title: e.job_title ?? "",
    department_id: e.department_id ?? "",
    manager_employee_id: e.manager_employee_id ?? "",
    staff_id: e.staff_id ?? "",
    employment_status: e.employment_status,
    employment_type: e.employment_type,
    work_location: e.work_location ?? "",
    joined_at: e.joined_at ?? "",
    notes: e.notes ?? "",
  };
}

export function EmployeeFormModal({
  open,
  onClose,
  onSubmit,
  value,
  setValue,
  busy,
  departments,
  managers,
  unlinkedStaff,
  isEdit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  value: EmployeeFormValues;
  setValue: (v: EmployeeFormValues) => void;
  busy: boolean;
  departments: { id: string; name_ar: string }[];
  managers: { id: string; full_name: string }[];
  unlinkedStaff: { id: string; full_name: string; email: string }[];
  isEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "تعديل بيانات موظف" : "إضافة موظف"} size="lg" busy={busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الاسم الكامل" required>
          <input className={inputCls} value={value.full_name} onChange={(e) => setValue({ ...value, full_name: e.target.value })} />
        </FormField>
        <FormField label="البريد الإلكتروني" required>
          <input type="email" className={inputCls} value={value.email} onChange={(e) => setValue({ ...value, email: e.target.value })} />
        </FormField>
        <FormField label="الجوال">
          <input className={inputCls} value={value.phone} onChange={(e) => setValue({ ...value, phone: e.target.value })} />
        </FormField>
        <FormField label="المسمى الوظيفي">
          <input className={inputCls} value={value.job_title} onChange={(e) => setValue({ ...value, job_title: e.target.value })} />
        </FormField>
        <FormField label="القسم">
          <select className={inputCls} value={value.department_id} onChange={(e) => setValue({ ...value, department_id: e.target.value })}>
            <option value="">بلا قسم</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name_ar}</option>
            ))}
          </select>
        </FormField>
        <FormField label="المدير المباشر">
          <select className={inputCls} value={value.manager_employee_id} onChange={(e) => setValue({ ...value, manager_employee_id: e.target.value })}>
            <option value="">بلا مدير مباشر</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="حساب لوحة الإدارة المرتبط" hint="ربط اختياري بحساب موجود دون إنشاء دور جديد">
          <select className={inputCls} value={value.staff_id} onChange={(e) => setValue({ ...value, staff_id: e.target.value })}>
            <option value="">بلا ربط</option>
            {unlinkedStaff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
            ))}
          </select>
        </FormField>
        <FormField label="حالة التوظيف" required>
          <select className={inputCls} value={value.employment_status} onChange={(e) => setValue({ ...value, employment_status: e.target.value as HrEmploymentStatus })}>
            {HR_EMPLOYMENT_STATUS.map((s) => (
              <option key={s} value={s}>{HR_EMPLOYMENT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="نوع العقد" required>
          <select className={inputCls} value={value.employment_type} onChange={(e) => setValue({ ...value, employment_type: e.target.value as HrEmploymentType })}>
            {HR_EMPLOYMENT_TYPE.map((s) => (
              <option key={s} value={s}>{HR_EMPLOYMENT_TYPE_LABELS[s]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="موقع العمل">
          <input className={inputCls} value={value.work_location} onChange={(e) => setValue({ ...value, work_location: e.target.value })} />
        </FormField>
        <FormField label="تاريخ الالتحاق">
          <input type="date" className={inputCls} value={value.joined_at} onChange={(e) => setValue({ ...value, joined_at: e.target.value })} />
        </FormField>
      </div>
      <div className="mt-4">
        <FormField label="ملاحظات">
          <textarea className={inputCls} rows={3} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} />
        </FormField>
      </div>
      {error && <p className="mt-2 text-[12px] text-danger" role="alert">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={busy}>إلغاء</Btn>
        <Btn
          loading={busy}
          onClick={() => {
            if (!value.full_name.trim() || !value.email.trim()) {
              setError("الاسم والبريد الإلكتروني مطلوبان.");
              return;
            }
            setError(null);
            onSubmit();
          }}
        >
          حفظ
        </Btn>
      </div>
    </Modal>
  );
}
