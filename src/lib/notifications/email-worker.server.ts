/**
 * عامل قناة بريد التنبيهات — الموضع الوحيد الذي يُرسل فيه تنبيه بالبريد.
 *
 * المسار: `claim_notification_email_batch` (قفل SKIP LOCKED) → إعادة تحقق كاملة
 * من الصلاحية والتفضيل والبريد الحالي → `sendAppEmail` بمفتاح تفرّد حتمي.
 * كل صف معزول: فشل صف لا يُسقط الدفعة، ولا يُسجَّل أي محتوى أو بريد كامل.
 */
import React from "react";
import { NotificationSupportReplyEmail } from "@/lib/email-templates/notification-support-reply";
import { NotificationSupportTicketCreatedEmail } from "@/lib/email-templates/notification-support-ticket-created";
import { NotificationTeamMemberJoinedEmail } from "@/lib/email-templates/notification-team-member-joined";
import { sendAppEmail } from "@/lib/email/app-email.server";
import { notificationMessageId } from "@/lib/email/transport/mehla-mailer.server";
import { isEmailPreferenceEnabled, resolveNotificationRecipient } from "./email-channel.server";
import {
  CANCEL_REASON,
  isEmailEnabledEvent,
  isRetryableFailure,
  maskEmailForLog,
  retryDelayMs,
  templateKeyForEvent,
  type CancelReason,
  type NotificationTemplateKey,
} from "./email-channel.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const APP_ORIGIN = "https://app.mehlalex.com";
export const BATCH_SIZE = 25;

export type QueueItem = {
  id: string;
  notification_id: string;
  organization_id: string;
  user_id: string;
  event_type: string;
  template_key: string;
  recipient_email: string;
  attempts: number;
  max_attempts: number;
};

export type WorkerReport = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  /** نجح المزوّد لكن تعذّر الإنهاء الذري: الصف يبقى قابلاً للاسترداد. */
  deferred: number;
};

type TemplateDefinition = {
  subject: string;
  path: string;
  render: (actionUrl: string) => React.ReactElement;
};

/** القوالب المعتمدة: عنوان + مسار داخلي + عرض. ملخّص آمن فقط بلا محتوى. */
const TEMPLATES: Record<NotificationTemplateKey, TemplateDefinition> = {
  "notif-team-member-joined": {
    subject: "انضمام عضو جديد لفريق مكتبك — مِهلة",
    path: "/team",
    render: (actionUrl) => React.createElement(NotificationTeamMemberJoinedEmail, { actionUrl }),
  },
  "notif-support-reply": {
    subject: "رد جديد من فريق الدعم — مِهلة",
    path: "/support",
    render: (actionUrl) => React.createElement(NotificationSupportReplyEmail, { actionUrl }),
  },
  "notif-support-ticket-created": {
    subject: "استلمنا طلب الدعم — مِهلة",
    path: "/support",
    render: (actionUrl) =>
      React.createElement(NotificationSupportTicketCreatedEmail, { actionUrl }),
  },
};

export function templateDefinition(key: string): TemplateDefinition | null {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, key)
    ? TEMPLATES[key as NotificationTemplateKey]
    : null;
}

/** مفتاح التفرّد الحتمي: نفس الإشعار لا يُرسل مرتين حتى لو انقطعت الاستجابة. */
export function idempotencyKeyFor(notificationId: string): string {
  return `notif-email:${notificationId}`;
}

export type FinalizeOutcome =
  | "FINALIZED"
  | "ALREADY_FINALIZED"
  | "QUEUE_ROW_NOT_FOUND"
  | "INVALID_FINAL_STATUS"
  | "INVALID_QUEUE_STATE";

/** نتائج الإنهاء التي تعني أن الطابور وسجل التسليم متوافقان فعلاً. */
export function isFinalizedOutcome(outcome: string): boolean {
  return outcome === "FINALIZED" || outcome === "ALREADY_FINALIZED";
}

/**
 * الإنهاء الذري الوحيد: تحديث الطابور وإدراج سجل التسليم الدائم في معاملة
 * واحدة داخل القاعدة. لا يكتب العامل سجل التسليم بأي مسار منفصل.
 */
async function finalize(
  db: Db,
  item: QueueItem,
  finalStatus: "sent" | "failed" | "cancelled",
  errorCode: string | null,
): Promise<FinalizeOutcome> {
  const { data, error } = await db.rpc("finalize_notification_email_delivery", {
    _queue_id: item.id,
    _final_status: finalStatus,
    _provider_reference: finalStatus === "sent" ? idempotencyKeyFor(item.notification_id) : null,
    _error_code: errorCode,
    _recipient_masked: maskEmailForLog(item.recipient_email),
  });
  if (error) throw new Error((error as { message: string }).message);
  return (data as FinalizeOutcome | null) ?? "INVALID_QUEUE_STATE";
}

async function cancel(db: Db, item: QueueItem, reason: CancelReason): Promise<void> {
  await finalize(db, item, "cancelled", reason);
}

/** يرمي عند تعذّر الإنهاء بعد نجاح المزوّد: لا تُعلن الحالة sent خارج الدالة. */
async function markSent(db: Db, item: QueueItem): Promise<void> {
  const outcome = await finalize(db, item, "sent", null);
  if (!isFinalizedOutcome(outcome)) throw new Error(`FINALIZE_${outcome}`);
}

/** فشل: إعادة جدولة إن كان قابلاً للإعادة والمحاولات لم تُستنفد، وإلا فشل نهائي. */
async function markFailure(
  db: Db,
  item: QueueItem,
  code: string,
  message: string,
  retryableOverride?: boolean,
): Promise<"retried" | "failed"> {
  const retryable = retryableOverride ?? isRetryableFailure(code);
  const canRetry = retryable && item.attempts < item.max_attempts;
  const safeMessage = message.slice(0, 400);
  if (canRetry) {
    await db
      .from("notification_email_queue")
      .update({
        status: "queued",
        scheduled_at: new Date(Date.now() + retryDelayMs(item.attempts)).toISOString(),
        last_error_code: code,
        last_error_message: safeMessage,
        processing_started_at: null,
      })
      .eq("id", item.id);
    return "retried";
  }
  await db
    .from("notification_email_queue")
    .update({ last_error_message: safeMessage })
    .eq("id", item.id);
  await finalize(db, item, "failed", retryable ? "MAX_ATTEMPTS" : code);
  return "failed";
}

/** تأجيل بلا استهلاك محاولة — حد معدّل المزوّد. */
async function reschedule(db: Db, item: QueueItem, code: string, delayMs: number): Promise<void> {
  await db
    .from("notification_email_queue")
    .update({
      status: "queued",
      attempts: Math.max(0, item.attempts - 1),
      scheduled_at: new Date(Date.now() + delayMs).toISOString(),
      last_error_code: code,
      last_error_message: null,
      processing_started_at: null,
    })
    .eq("id", item.id);
}

/**
 * يعالج دفعة واحدة. الصفوف المسحوبة مقفلة على هذا العامل فقط، وكل صف
 * يُعاد التحقق من صلاحيته وتفضيله وبريده الحالي قبل الإرسال.
 */
export async function processNotificationEmailBatch(
  db: Db,
  limit = BATCH_SIZE,
): Promise<WorkerReport> {
  const report: WorkerReport = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    deferred: 0,
  };

  const { data, error } = await db.rpc("claim_notification_email_batch", {
    _limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) throw new Error((error as { message: string }).message);

  const items = (data ?? []) as QueueItem[];
  report.claimed = items.length;

  for (const item of items) {
    try {
      // 1) الإشعار ما زال موجوداً ونوعه ما زال مدعوماً.
      const { data: notifRow } = await db
        .from("notifications")
        .select("id, type, organization_id, user_id")
        .eq("id", item.notification_id)
        .maybeSingle();
      const notification = notifRow as {
        id: string;
        type: string;
        organization_id: string;
        user_id: string;
      } | null;
      if (!notification) {
        await cancel(db, item, CANCEL_REASON.NOTIFICATION_REMOVED);
        report.cancelled += 1;
        continue;
      }
      const templateKey = templateKeyForEvent(notification.type);
      if (!templateKey || !isEmailEnabledEvent(notification.type)) {
        await cancel(db, item, CANCEL_REASON.EVENT_NO_LONGER_SUPPORTED);
        report.cancelled += 1;
        continue;
      }

      // 2) الصلاحية الحالية: عضوية نشطة في مكتب الإشعار + بريد حالي.
      const recipient = await resolveNotificationRecipient(
        db,
        notification.organization_id,
        notification.user_id,
      );
      if (!recipient.ok) {
        await cancel(
          db,
          item,
          recipient.reason === "NO_RECIPIENT_EMAIL"
            ? CANCEL_REASON.NO_RECIPIENT_EMAIL
            : CANCEL_REASON.RECIPIENT_NO_LONGER_AUTHORIZED,
        );
        report.cancelled += 1;
        continue;
      }

      // 3) التفضيل ما زال مفعّلاً وقت الإرسال.
      const enabled = await isEmailPreferenceEnabled(
        db,
        notification.organization_id,
        notification.user_id,
      );
      if (!enabled) {
        await cancel(db, item, CANCEL_REASON.PREFERENCE_DISABLED_BEFORE_SEND);
        report.cancelled += 1;
        continue;
      }

      const template = templateDefinition(templateKey);
      if (!template) {
        await markFailure(db, item, "template_missing", "لا يوجد قالب معتمد لهذا النوع.");
        report.failed += 1;
        continue;
      }

      // العنوان المُخزَّن لقطة تدقيق؛ الإرسال يستخدم العنوان المصرّح الحالي فقط.
      const result = await sendAppEmail({
        to: recipient.email,
        subject: template.subject,
        element: template.render(`${APP_ORIGIN}${template.path}`),
        label: templateKey,
        idempotencyKey: idempotencyKeyFor(item.notification_id),
        // معرّف حتمي واحد للتنبيه: لا يتغيّر عبر إعادة المحاولات.
        messageId: notificationMessageId(item.notification_id),
        organizationId: notification.organization_id,
        userId: notification.user_id,
      });

      if (result.sent) {
        try {
          await markSent(db, item);
          report.sent += 1;
        } catch (finalizeError) {
          // المزوّد قبل الرسالة لكن تعذّر الإنهاء الذري: لا نعلن sent ولا نفشل
          // الصف. يبقى processing ليستعيده مسار الاسترداد بنفس مفتاح التفرّد.
          report.deferred += 1;
          const { logFailure } = await import("@/lib/observability/failure-log.server");
          await logFailure({
            surface: "email",
            action: "notification_email_finalize",
            error: finalizeError,
            errorCode: "finalize_failed",
            organizationId: notification.organization_id,
            userId: notification.user_id,
            metadata: { template_key: templateKey, recipient: maskEmailForLog(recipient.email) },
          });
        }
        continue;
      }

      const code = result.reason ?? "send_failed";
      // عطل إعداد النظام ليس رفض مستلم: يؤجَّل بلا استهلاك محاولة.
      if (result.errorClass === "SYSTEM_CONFIGURATION_FAILURE") {
        await reschedule(db, item, code, 300_000);
        report.retried += 1;
        continue;
      }
      const retryable = result.errorClass ? result.errorClass === "RETRYABLE" : undefined;
      const outcome = await markFailure(db, item, code, `رفض الإرسال (${code})`, retryable);
      report[outcome === "retried" ? "retried" : "failed"] += 1;
    } catch (thrown) {
      // عزل الصف: أي استثناء غير متوقع يُعالج على مستوى الصف فقط.
      const message = thrown instanceof Error ? thrown.message : "unknown";
      try {
        const outcome = await markFailure(db, item, "worker_error", message);
        report[outcome === "retried" ? "retried" : "failed"] += 1;
      } catch {
        console.error("[notification-email] تعذّر تحديث حالة الصف", {
          recipient: maskEmailForLog(item.recipient_email),
        });
      }
    }
  }

  return report;
}

/** عدّادات تشغيلية آمنة (بلا محتوى ولا عناوين) لاستخدام لوحة الإدارة لاحقاً. */
export async function notificationEmailHealth(db: Db): Promise<{
  byStatus: Record<string, number>;
  oldestPending: string | null;
}> {
  const byStatus: Record<string, number> = {};
  for (const status of ["queued", "processing", "sent", "failed", "cancelled"]) {
    const { count } = await db
      .from("notification_email_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    byStatus[status] = count ?? 0;
  }
  const { data } = await db
    .from("notification_email_queue")
    .select("created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    byStatus,
    oldestPending: (data as { created_at: string } | null)?.created_at ?? null,
  };
}
