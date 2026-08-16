/**
 * محرك التذكيرات التشغيلية — العقود المشتركة (المرحلة 2).
 *
 * ملف نقي بلا وصول للقاعدة أو الشبكة: أنواع الأحداث، ربط التفضيلات، حساب
 * العتبات بحدود أيام الرياض، ومفاتيح منع التكرار الحتمية. يصلح للاختبار المباشر.
 */

/** عتبات التذكير بالأيام؛ 0 = نفس اليوم. */
export const REMINDER_DAY_THRESHOLDS = [7, 3, 1, 0] as const;
export type ReminderDayThreshold = (typeof REMINDER_DAY_THRESHOLDS)[number];

/** لاحقة المفتاح المنطقي لكل عتبة — ثابتة ولا تتغير بعد النشر. */
export const THRESHOLD_SUFFIX: Record<ReminderDayThreshold, string> = {
  7: "7d",
  3: "3d",
  1: "1d",
  0: "same_day",
};

export const HEARING_REMINDER_EVENTS = {
  7: "hearing_reminder_7d",
  3: "hearing_reminder_3d",
  1: "hearing_reminder_1d",
  0: "hearing_reminder_same_day",
} as const;

export const DEADLINE_REMINDER_EVENTS = {
  7: "deadline_reminder_7d",
  3: "deadline_reminder_3d",
  1: "deadline_reminder_1d",
  0: "deadline_reminder_same_day",
} as const;

export const TASK_OVERDUE_EVENT = "task_overdue" as const;
export const CASE_INACTIVE_EVENT = "case_inactive" as const;

export type ReminderEventType =
  | (typeof HEARING_REMINDER_EVENTS)[ReminderDayThreshold]
  | (typeof DEADLINE_REMINDER_EVENTS)[ReminderDayThreshold]
  | typeof TASK_OVERDUE_EVENT
  | typeof CASE_INACTIVE_EVENT;

/**
 * أعمدة التفضيلات القائمة في `user_notification_preferences` — لا تُستحدث
 * إعدادات بديلة، وكل حدث يقرأ نفس المفتاح الذي تكتبه واجهة الإعدادات الحالية.
 */
export type ReminderPreferenceKey =
  | "hearing_7_days"
  | "hearing_3_days"
  | "hearing_1_day"
  | "hearing_same_day"
  | "deadline_7_days"
  | "deadline_3_days"
  | "deadline_1_day"
  | "deadline_same_day"
  | "task_overdue"
  | "inactive_cases";

const HEARING_PREF: Record<ReminderDayThreshold, ReminderPreferenceKey> = {
  7: "hearing_7_days",
  3: "hearing_3_days",
  1: "hearing_1_day",
  0: "hearing_same_day",
};

const DEADLINE_PREF: Record<ReminderDayThreshold, ReminderPreferenceKey> = {
  7: "deadline_7_days",
  3: "deadline_3_days",
  1: "deadline_1_day",
  0: "deadline_same_day",
};

export function hearingPreferenceKey(t: ReminderDayThreshold): ReminderPreferenceKey {
  return HEARING_PREF[t];
}

export function deadlinePreferenceKey(t: ReminderDayThreshold): ReminderPreferenceKey {
  return DEADLINE_PREF[t];
}

/** ربط حدث التذكير بعمود التفضيل المسؤول عنه. */
export const REMINDER_EVENT_PREFERENCE: Record<ReminderEventType, ReminderPreferenceKey> = {
  hearing_reminder_7d: "hearing_7_days",
  hearing_reminder_3d: "hearing_3_days",
  hearing_reminder_1d: "hearing_1_day",
  hearing_reminder_same_day: "hearing_same_day",
  deadline_reminder_7d: "deadline_7_days",
  deadline_reminder_3d: "deadline_3_days",
  deadline_reminder_1d: "deadline_1_day",
  deadline_reminder_same_day: "deadline_same_day",
  task_overdue: "task_overdue",
  case_inactive: "inactive_cases",
};

/**
 * حالات الكيانات المستثناة — تُقرأ من حالة النطاق القائمة لا من تخمين.
 * الجلسات: تذكير للمجدولة فقط. المهل: النشطة فقط. المهام: غير المكتملة.
 */
export const HEARING_REMINDABLE_STATUSES = ["scheduled"] as const;
export const DEADLINE_REMINDABLE_STATUSES = ["active"] as const;
export const TASK_OVERDUE_STATUSES = ["pending", "in_progress", "overdue"] as const;

/**
 * العتبة المطابقة لعدد أيام الرياض المتبقية؛ null لأي فارق غير مذكور.
 * القيم السالبة (تاريخ ماضٍ) لا تُنتج تذكيراً.
 */
export function thresholdForDaysAhead(daysAhead: number): ReminderDayThreshold | null {
  if (!Number.isInteger(daysAhead)) return null;
  return (REMINDER_DAY_THRESHOLDS as readonly number[]).includes(daysAhead)
    ? (daysAhead as ReminderDayThreshold)
    : null;
}

/**
 * مفتاح منطقي حتمي لمنع التكرار: نفس (المكتب، الكيان، العتبة) لا يُنتج
 * إشعاراً ثانياً أبداً؛ التفرّد على مستوى المستلم مضمون بقيد القاعدة
 * `notifications_user_id_dedup_key_key`.
 */
export function reminderDedupKey(input: {
  organizationId: string;
  entity: "hearing" | "deadline" | "task" | "case";
  entityId: string;
  suffix: string;
}): string {
  return `rem:${input.organizationId}:${input.entity}:${input.entityId}:${input.suffix}`;
}

/** نصوص عربية آمنة — بلا اسم عميل ولا تفاصيل قضية ولا مبالغ. */
export const REMINDER_COPY: Record<ReminderEventType, { title: string; message: string }> = {
  hearing_reminder_7d: { title: "جلسة قادمة بعد 7 أيام", message: "لديك جلسة قادمة بعد 7 أيام." },
  hearing_reminder_3d: { title: "جلسة قادمة بعد 3 أيام", message: "لديك جلسة قادمة بعد 3 أيام." },
  hearing_reminder_1d: { title: "جلسة غداً", message: "لديك جلسة غداً." },
  hearing_reminder_same_day: { title: "جلسة اليوم", message: "لديك جلسة اليوم." },
  deadline_reminder_7d: { title: "مهلة تنتهي بعد 7 أيام", message: "لديك مهلة تنتهي بعد 7 أيام." },
  deadline_reminder_3d: { title: "مهلة تنتهي بعد 3 أيام", message: "لديك مهلة تنتهي بعد 3 أيام." },
  deadline_reminder_1d: { title: "مهلة تنتهي غداً", message: "لديك مهلة تنتهي غداً." },
  deadline_reminder_same_day: { title: "مهلة تنتهي اليوم", message: "لديك مهلة تنتهي اليوم." },
  task_overdue: { title: "مهمة متأخرة", message: "لديك مهمة تجاوزت موعد استحقاقها." },
  case_inactive: { title: "قضية بلا حركة", message: "لديك قضية بلا حركة مؤخراً." },
};

/**
 * حد الاستدعاء الواحد لكل نوع — يمنع دفعة ضخمة في تشغيل واحد، وتكرار
 * التشغيل آمن لأن منع التكرار حتمي.
 */
export const REMINDER_SCAN_LIMIT = 500;
