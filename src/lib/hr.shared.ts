/** أنواع مشتركة لوحدة الموارد البشرية (HR) — الواجهة ودوال الخادم. */

export const HR_EMPLOYMENT_STATUS = [
  "active",
  "probation",
  "on_notice",
  "suspended",
  "terminated",
  "resigned",
] as const;
export type HrEmploymentStatus = (typeof HR_EMPLOYMENT_STATUS)[number];

export const HR_EMPLOYMENT_TYPE = ["full_time", "part_time", "contract", "intern", "vendor"] as const;
export type HrEmploymentType = (typeof HR_EMPLOYMENT_TYPE)[number];

export const HR_EMPLOYMENT_STATUS_LABELS: Record<HrEmploymentStatus, string> = {
  active: "نشط",
  probation: "تحت التجربة",
  on_notice: "إشعار إنهاء",
  suspended: "موقوف",
  terminated: "منتهي الخدمة",
  resigned: "استقالة",
};

export const HR_EMPLOYMENT_TYPE_LABELS: Record<HrEmploymentType, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد",
  intern: "تدريب",
  vendor: "مزوّد خارجي",
};

export type HrEmployeeRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department_id: string | null;
  department_name: string | null;
  manager_employee_id: string | null;
  manager_full_name: string | null;
  staff_id: string | null;
  user_id: string | null;
  employment_status: HrEmploymentStatus;
  employment_type: HrEmploymentType;
  work_location: string | null;
  joined_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HrDocumentRow = {
  id: string;
  employee_id: string;
  kind: string;
  title: string;
  storage_path: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrSessionRow = {
  id: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  country: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type HrAuditRow = {
  id: string;
  action: string;
  description: string | null;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};
