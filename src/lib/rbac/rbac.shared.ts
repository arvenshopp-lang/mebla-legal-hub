/**
 * أنواع ونصوص RBAC المشتركة (آمنة للمتصفح).
 * المرجع الوحيد لمفاتيح الصلاحيات هو `@/lib/admin-permissions`.
 */

export type GrantSource = "temporary" | "delegation";

export const GRANT_SOURCE_LABELS: Record<GrantSource, string> = {
  temporary: "صلاحية مؤقتة",
  delegation: "تفويض",
};

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "executed";

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "بانتظار الاعتماد",
  approved: "مُعتمد",
  rejected: "مرفوض",
  expired: "منتهي الصلاحية",
  executed: "نُفِّذ",
};

/** العمليات الخاضعة لمبدأ «أربع أعين». */
export const APPROVAL_ACTIONS = [
  { id: "staff.grant_super_admin", label: "منح صلاحية مالك المنصة" },
  { id: "staff.delete", label: "حذف موظف من فريق المنصة" },
  { id: "organizations.delete", label: "حذف مكتب" },
  { id: "users.delete", label: "حذف مستخدم" },
  { id: "audit.export", label: "تصدير سجل التدقيق" },
  { id: "impersonation.start", label: "بدء جلسة انتحال" },
  { id: "permissions.grant_sensitive", label: "منح صلاحية حساسة مؤقتة" },
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number]["id"];

export const APPROVAL_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  APPROVAL_ACTIONS.map((a) => [a.id, a.label]),
);

export type ImpersonationStatus = "pending" | "active" | "ended" | "rejected" | "expired";

export const IMPERSONATION_STATUS_LABELS: Record<ImpersonationStatus, string> = {
  pending: "بانتظار الاعتماد",
  active: "جلسة سارية",
  ended: "منتهية",
  rejected: "مرفوضة",
  expired: "انتهت مدتها",
};

/** الصلاحيات التي لا تُمنح مؤقتاً إلا بعد اعتماد موظف آخر. */
export const SENSITIVE_GRANT_PERMISSIONS = [
  "staff.manage",
  "roles.manage",
  "users.delete",
  "organizations.delete",
  "audit.export",
  "billing.refund",
  "billing.reopen_period",
  "billing.manage_providers",
  "staff.restrictions.manage",
  "support.merge",
  "support.manage_sla",
  "support.view_all_offices",
];

export function isSensitivePermission(permission: string): boolean {
  return SENSITIVE_GRANT_PERMISSIONS.includes(permission);
}

/** الصلاحيات القرائية — الوحيدة المسموحة أثناء جلسة الانتحال. */
export function isReadOnlyPermission(permission: string): boolean {
  return /\.(read|view|reports|view_reports|sessions\.read)$/.test(permission);
}

export const RIYADH_OFFSET_MINUTES = 180;

export function minutesToClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockToMinutes(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Math.max(0, Math.min(1440, Number(h) * 60 + Number(m)));
}

export const WEEKDAY_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type RbacDenyReason =
  | "not_staff"
  | "suspended"
  | "missing_permission"
  | "ip_blocked"
  | "device_blocked"
  | "time_blocked"
  | "impersonation_read_only"
  | "session_revoked";

export const DENY_MESSAGES: Record<RbacDenyReason, string> = {
  not_staff: "ليس لديك وصول إلى لوحة إدارة المنصة.",
  suspended: "حسابك في فريق المنصة موقوف حالياً.",
  missing_permission: "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.",
  ip_blocked: "الوصول من هذا العنوان غير مسموح لحسابك.",
  device_blocked: "هذا الجهاز غير موثّق لحسابك.",
  time_blocked: "تنفيذ هذه العملية متاح داخل نافذة العمل المحددة لحسابك فقط.",
  impersonation_read_only: "جلسة الانتحال للقراءة فقط ولا تسمح بتنفيذ أي تعديل.",
  session_revoked: "تم إبطال جلسة هذا الجهاز. أعد تسجيل الدخول.",
};
