/**
 * مصفوفة صلاحيات فوترة المكتب.
 * الإخفاء في الواجهة تحسين تجربة فقط؛ الفرض الفعلي في سياسات RLS ودوال الخادم.
 * مرآة السياسات: الاطلاع لمالك المكتب والمدير والمحامي، والكتابة للمالك والمدير.
 */
import type { AppRole } from "@/hooks/use-auth";

export const BILLING_PERMISSIONS = [
  "billing.view",
  "billing.create",
  "billing.update",
  "billing.issue",
  "billing.cancel",
  "billing.delete_draft",
  "billing.payment.record",
  "billing.payment.void",
  "billing.export",
] as const;
export type BillingPermission = (typeof BILLING_PERMISSIONS)[number];

const MATRIX: Record<AppRole, readonly BillingPermission[]> = {
  owner: BILLING_PERMISSIONS,
  admin: BILLING_PERMISSIONS,
  lawyer: ["billing.view", "billing.export"],
  legal_assistant: [],
  viewer: [],
};

export function can(role: AppRole | null | undefined, permission: BillingPermission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}

/** الأدوار المصرَّح لها بالاطلاع على البيانات المالية — تُستخدم في التحقق الخادمي أيضاً. */
export const BILLING_VIEW_ROLES: AppRole[] = ["owner", "admin", "lawyer"];
export const BILLING_MANAGE_ROLES: AppRole[] = ["owner", "admin"];

export const BILLING_DENIED_MESSAGE = "لا تملك صلاحية الوصول إلى البيانات المالية لهذا المكتب.";
export const BILLING_MANAGE_DENIED_MESSAGE =
  "إدارة الفواتير والدفعات متاحة لمالك المكتب والمدير فقط.";