/** أنواع أحداث سجل الأعمال (مهام/مهل) كما هي مثبتة في قيد قاعدة البيانات. */
export const WORK_EVENTS = [
  "baseline",
  "created",
  "assigned",
  "due_changed",
  "completed",
  "reopened",
  "cancelled",
  "deleted",
] as const;

export type WorkEventName = (typeof WORK_EVENTS)[number];

export const WORK_EVENT_LABELS: Record<WorkEventName, string> = {
  baseline: "بداية التتبع",
  created: "إنشاء",
  assigned: "إعادة إسناد",
  due_changed: "تغيير الاستحقاق",
  completed: "إنجاز",
  reopened: "إعادة فتح",
  cancelled: "إلغاء",
  deleted: "حذف",
};

export type WorkItemTimelineEvent = {
  id: string;
  event: WorkEventName;
  occurredAt: string;
  actorName: string | null;
  fromUserName: string | null;
  toUserName: string | null;
  fromDueDate: string | null;
  toDueDate: string | null;
};

/** مؤشر ترقيم keyset: لحظة الحدث + تسلسله داخل نفس اللحظة. */
export type WorkItemTimelineCursor = { occurredAt: string; seq: number };

export type WorkItemTimelinePage = {
  events: WorkItemTimelineEvent[];
  nextCursor: WorkItemTimelineCursor | null;
};

/** حجم الصفحة الافتراضي للتحميل التدريجي. */
export const TIMELINE_PAGE_SIZE = 25;
export const TIMELINE_MAX_PAGE_SIZE = 100;
