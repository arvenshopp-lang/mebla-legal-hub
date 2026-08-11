export const CASE_STATUS: Record<string, string> = {
  draft: "مسودة",
  open: "مفتوحة",
  in_progress: "قيد النظر",
  waiting: "بانتظار الرد",
  judgment_issued: "صدر الحكم",
  execution: "تنفيذ",
  closed: "مغلقة",
  archived: "مؤرشفة",
};
export const CASE_PRIORITY: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};
export const CLIENT_TYPE: Record<string, string> = {
  individual: "فرد",
  company: "شركة",
  government: "جهة حكومية",
};
export const CLIENT_ROLE: Record<string, string> = {
  plaintiff: "مدّعي",
  defendant: "مدّعى عليه",
  appellant: "مستأنِف",
  respondent: "مستأنَف ضدّه",
  execution_applicant: "طالب تنفيذ",
  execution_against: "منفّذ ضدّه",
  other: "أخرى",
};
export const HEARING_STATUS: Record<string, string> = {
  scheduled: "مجدولة",
  completed: "منتهية",
  postponed: "مؤجّلة",
  cancelled: "ملغاة",
  missed: "فائتة",
};
export const DEADLINE_STATUS: Record<string, string> = {
  active: "نشطة",
  completed: "منجزة",
  cancelled: "ملغاة",
  overdue: "متأخرة",
};
export const DEADLINE_TYPE: Record<string, string> = {
  objection: "اعتراض",
  appeal: "استئناف",
  response: "رد",
  submission: "تقديم",
  execution: "تنفيذ",
  expert_report: "تقرير خبير",
  document_request: "طلب مستند",
  custom: "مخصصة",
};
export const TASK_STATUS: Record<string, string> = {
  pending: "معلّقة",
  in_progress: "قيد التنفيذ",
  completed: "منجزة",
  cancelled: "ملغاة",
  overdue: "متأخرة",
};
export const TASK_PRIORITY: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};
export const APP_ROLE: Record<string, string> = {
  owner: "مالك",
  admin: "مدير",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مشاهد",
};
export const INVITATION_STATUS: Record<string, string> = {
  pending: "بانتظار القبول",
  accepted: "مقبولة",
  revoked: "ملغاة",
  expired: "منتهية",
};

export const asOptions = (r: Record<string, string>) =>
  Object.entries(r).map(([value, label]) => ({ value, label }));

// التقويم الميلادي بأرقام إنجليزية — الصيغة الموحّدة في src/lib/format.ts
export { fmtDate, fmtDateTime, fmtSize, fmtNumber, fmtMoney } from "./format";

export function daysUntil(v?: string | null): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime() - Date.now();
  return Math.round(ms / 86400000);
}
