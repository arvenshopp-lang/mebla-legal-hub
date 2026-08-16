/**
 * قناة بريد التنبيهات — العقود المشتركة (المرحلة 1).
 *
 * قائمة السماح مركزية هنا: أي نوع إشعار غير مذكور لا يُنتج بريداً إطلاقاً.
 * لا يحتوي هذا الملف أي وصول للقاعدة أو المزوّد، فيصلح للاختبارات المباشرة.
 */

export const NOTIFICATION_EMAIL_STATUS = [
  "queued",
  "processing",
  "sent",
  "failed",
  "cancelled",
] as const;
export type NotificationEmailStatus = (typeof NOTIFICATION_EMAIL_STATUS)[number];

/**
 * أنواع الإشعارات المسموح لها بالبريد في المرحلة 1 وقالب كل نوع.
 * ثلاث فئات وظيفية وثلاثة قوالب؛ `support_reply` معرّف تاريخي لصفوف قديمة
 * أُنشئت قبل توحيد اسم الحدث إلى `support_new_reply` (بلا أي إرسال رجعي).
 */
export const EMAIL_ENABLED_EVENTS = {
  team_member_joined: "notif-team-member-joined",
  support_new_reply: "notif-support-reply",
  support_reply: "notif-support-reply",
  support_ticket_created: "notif-support-ticket-created",
  /* المرحلة 2 — التذكيرات التشغيلية: ملخّص آمن بلا تفاصيل قضية أو عميل. */
  hearing_reminder_7d: "notif-hearing-reminder-7d",
  hearing_reminder_3d: "notif-hearing-reminder-3d",
  hearing_reminder_1d: "notif-hearing-reminder-1d",
  hearing_reminder_same_day: "notif-hearing-reminder-same-day",
  deadline_reminder_7d: "notif-deadline-reminder-7d",
  deadline_reminder_3d: "notif-deadline-reminder-3d",
  deadline_reminder_1d: "notif-deadline-reminder-1d",
  deadline_reminder_same_day: "notif-deadline-reminder-same-day",
  task_overdue: "notif-task-overdue",
} as const;

export type EmailEnabledEvent = keyof typeof EMAIL_ENABLED_EVENTS;
export type NotificationTemplateKey = (typeof EMAIL_ENABLED_EVENTS)[EmailEnabledEvent];

export function isEmailEnabledEvent(eventType: string): eventType is EmailEnabledEvent {
  return Object.prototype.hasOwnProperty.call(EMAIL_ENABLED_EVENTS, eventType);
}

export function templateKeyForEvent(eventType: string): NotificationTemplateKey | null {
  return isEmailEnabledEvent(eventType) ? EMAIL_ENABLED_EVENTS[eventType] : null;
}

/**
 * هوية المُرسل لكل حدث تنبيه — سياسة الهويات المعتمدة:
 * تنبيهات ردود الدعم تُرسل من صندوق الدعم (رد المستلم يعود للدعم)،
 * وبقية التنبيهات العامة من هوية النظام (noreply + Reply-To: support).
 */
const EVENT_IDENTITY: Record<EmailEnabledEvent, "system" | "support"> = {
  team_member_joined: "system",
  support_new_reply: "support",
  support_reply: "support",
  support_ticket_created: "system",
  hearing_reminder_7d: "system",
  hearing_reminder_3d: "system",
  hearing_reminder_1d: "system",
  hearing_reminder_same_day: "system",
  deadline_reminder_7d: "system",
  deadline_reminder_3d: "system",
  deadline_reminder_1d: "system",
  deadline_reminder_same_day: "system",
  task_overdue: "system",
};

export function identityForNotificationEvent(eventType: string): "system" | "support" {
  return isEmailEnabledEvent(eventType) ? EVENT_IDENTITY[eventType] : "system";
}

/** أسباب عدم الإدراج — رموز آمنة للتسجيل التشغيلي بلا أي محتوى. */
export const ENQUEUE_SKIP_REASON = {
  NOTIFICATION_NOT_FOUND: "NOTIFICATION_NOT_FOUND",
  NOT_EMAIL_ENABLED: "NOT_EMAIL_ENABLED",
  PREFERENCE_DISABLED: "PREFERENCE_DISABLED",
  RECIPIENT_NOT_AUTHORIZED: "RECIPIENT_NOT_AUTHORIZED",
  NO_RECIPIENT_EMAIL: "NO_RECIPIENT_EMAIL",
} as const;
export type EnqueueSkipReason = (typeof ENQUEUE_SKIP_REASON)[keyof typeof ENQUEUE_SKIP_REASON];

/** أسباب الإلغاء قبل الإرسال — تغيّر في التفضيل أو الصلاحية بعد الإدراج. */
export const CANCEL_REASON = {
  PREFERENCE_DISABLED_BEFORE_SEND: "PREFERENCE_DISABLED_BEFORE_SEND",
  RECIPIENT_NO_LONGER_AUTHORIZED: "RECIPIENT_NO_LONGER_AUTHORIZED",
  NOTIFICATION_REMOVED: "NOTIFICATION_REMOVED",
  EVENT_NO_LONGER_SUPPORTED: "EVENT_NO_LONGER_SUPPORTED",
  NO_RECIPIENT_EMAIL: "NO_RECIPIENT_EMAIL",
} as const;
export type CancelReason = (typeof CANCEL_REASON)[keyof typeof CANCEL_REASON];

export type EnqueueOutcome =
  | { status: "created" }
  | { status: "already_enqueued" }
  | { status: "skipped"; reason: EnqueueSkipReason };

/** تراجع أُسّي: 2د ثم 10د ثم 60د (المحاولة الرابعة أخيرة). */
const BACKOFF_MS = [120_000, 600_000, 3_600_000];

export function retryDelayMs(attempt: number): number {
  const index = Math.max(0, attempt - 1);
  return BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)] ?? 3_600_000;
}

/**
 * أسباب رفض على مستوى المستلم — نهائية، لا تُعاد المحاولة أبداً.
 * (تُطابق `RECIPIENT_DENY_CODES` في مسار البريد القائم.)
 */
const PERMANENT_CODES = new Set([
  "recipient_suppressed",
  "invalid_recipient",
  "email_not_configured",
  "domain_not_verified",
  "emails_disabled",
  "template_missing",
]);

export function isRetryableFailure(code: string | null | undefined): boolean {
  if (!code) return true;
  return !PERMANENT_CODES.has(code);
}

/** تقنيع البريد للسجلات التشغيلية: z***@domain.com */
export function maskEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
