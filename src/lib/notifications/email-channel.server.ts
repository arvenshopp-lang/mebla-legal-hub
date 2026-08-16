/**
 * قناة بريد التنبيهات — الإدراج واستنتاج المستلم (خادمي فقط).
 *
 * كل الحقول تُستنتج من صف `notifications` الموثوق: لا يُقبل بريد ولا معرّف
 * مستخدم ولا نوع حدث من العميل. فشل الإدراج لا يرمي أبداً حتى لا يتأثر
 * الحدث التجاري ولا الإشعار داخل التطبيق.
 */
import {
  ENQUEUE_SKIP_REASON,
  isEmailEnabledEvent,
  maskEmailForLog,
  templateKeyForEvent,
  type EnqueueOutcome,
} from "./email-channel.shared";

/** عميل خادمي — الجدول تشغيلي ولا يظهر في الأنواع المولّدة قبل تطبيق الهجرة. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type NotificationRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
};

export type ResolvedRecipient =
  | { ok: true; email: string }
  | { ok: false; reason: "RECIPIENT_NOT_AUTHORIZED" | "NO_RECIPIENT_EMAIL" };

/** هل التفضيل العام للبريد مفعّل؟ غياب صف التفضيلات = مفعّل (نفس افتراضي القاعدة). */
export async function isEmailPreferenceEnabled(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("user_notification_preferences")
    .select("email_enabled")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true;
  return (data as { email_enabled: boolean }).email_enabled === true;
}

/**
 * المستلم = نفس مستخدم الإشعار داخل نفس المكتب، بعضوية نشطة، وببريد صالح.
 * أي عدم تطابق يمنع البريد نهائياً، فلا يمكن أن يخرج إشعار مكتب إلى عضو مكتب آخر.
 */
export async function resolveNotificationRecipient(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<ResolvedRecipient> {
  const { data: membership } = await db
    .from("organization_members")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return { ok: false, reason: "RECIPIENT_NOT_AUTHORIZED" };

  const { data: profile } = await db
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = ((profile as { email: string | null } | null)?.email ?? "").trim();
  if (!email) return { ok: false, reason: "NO_RECIPIENT_EMAIL" };
  return { ok: true, email };
}

/**
 * يدرج صف بريد واحداً للإشعار إن كان النوع مسموحاً والتفضيل مفعّلاً والمستلم مصرّحاً.
 * تكرار النداء لنفس الإشعار = `already_enqueued` (قيد التفرّد في القاعدة).
 */
export async function enqueueNotificationEmail(
  db: Db,
  notificationId: string,
): Promise<EnqueueOutcome> {
  const { data: row } = await db
    .from("notifications")
    .select("id, organization_id, user_id, type, title, message")
    .eq("id", notificationId)
    .maybeSingle();
  const notification = row as NotificationRecord | null;
  if (!notification) {
    return { status: "skipped", reason: ENQUEUE_SKIP_REASON.NOTIFICATION_NOT_FOUND };
  }

  const templateKey = templateKeyForEvent(notification.type);
  if (!templateKey || !isEmailEnabledEvent(notification.type)) {
    return { status: "skipped", reason: ENQUEUE_SKIP_REASON.NOT_EMAIL_ENABLED };
  }

  const enabled = await isEmailPreferenceEnabled(
    db,
    notification.organization_id,
    notification.user_id,
  );
  if (!enabled) return { status: "skipped", reason: ENQUEUE_SKIP_REASON.PREFERENCE_DISABLED };

  const recipient = await resolveNotificationRecipient(
    db,
    notification.organization_id,
    notification.user_id,
  );
  if (!recipient.ok) {
    return {
      status: "skipped",
      reason:
        recipient.reason === "NO_RECIPIENT_EMAIL"
          ? ENQUEUE_SKIP_REASON.NO_RECIPIENT_EMAIL
          : ENQUEUE_SKIP_REASON.RECIPIENT_NOT_AUTHORIZED,
    };
  }

  const { error } = await db.from("notification_email_queue").insert({
    notification_id: notification.id,
    organization_id: notification.organization_id,
    user_id: notification.user_id,
    event_type: notification.type,
    template_key: templateKey,
    recipient_email: recipient.email,
  });
  // 23505 = الصف موجود مسبقاً لنفس الإشعار؛ سلوك متوقّع لا عطل.
  if (error && String((error as { code?: string }).code) === "23505") {
    return { status: "already_enqueued" };
  }
  if (error) throw new Error((error as { message: string }).message);
  return { status: "created" };
}

/**
 * إنشاء إشعار داخل التطبيق ثم محاولة إدراجه في قناة البريد.
 * الإشعار يبقى صحيحاً دائماً حتى لو فشل الإدراج (فشل معزول ومسجّل بأمان).
 */
export async function createUserNotification(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    dedupKey?: string | null;
    /** وقت تسجيل الإشعار كمُرسَل داخل التطبيق (توافق مع المنتجين القائمين). */
    sentAt?: string | null;
    relatedCaseId?: string | null;
    relatedTaskId?: string | null;
    relatedDeadlineId?: string | null;
    relatedHearingId?: string | null;
  },
): Promise<{ notificationId: string | null; duplicate: boolean; email: EnqueueOutcome | null }> {
  const { data, error } = await db
    .from("notifications")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      dedup_key: input.dedupKey ?? null,
      sent_at: input.sentAt ?? null,
      related_case_id: input.relatedCaseId ?? null,
      related_task_id: input.relatedTaskId ?? null,
      related_deadline_id: input.relatedDeadlineId ?? null,
      related_hearing_id: input.relatedHearingId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (String((error as { code?: string }).code) === "23505") {
      return { notificationId: null, duplicate: true, email: null };
    }
    throw new Error((error as { message: string }).message);
  }

  const notificationId = (data as { id: string } | null)?.id ?? null;
  if (!notificationId) return { notificationId: null, duplicate: false, email: null };

  const email = await safeEnqueue(db, notificationId);
  return { notificationId, duplicate: false, email };
}

/** إدراج بلا رمي: عزل فشل البريد عن العملية التجارية والإشعار. */
export async function safeEnqueue(db: Db, notificationId: string): Promise<EnqueueOutcome | null> {
  try {
    return await enqueueNotificationEmail(db, notificationId);
  } catch (thrown) {
    try {
      const { logFailure } = await import("@/lib/observability/failure-log.server");
      await logFailure({
        surface: "email",
        action: "notification_email_enqueue",
        error: thrown,
        errorCode: "enqueue_failed",
        metadata: { notification_id: notificationId },
      });
    } catch {
      console.error("[notification-email] تعذّر إدراج بريد التنبيه");
    }
    return null;
  }
}

export { maskEmailForLog };
