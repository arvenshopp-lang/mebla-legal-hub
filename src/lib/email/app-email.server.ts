/**
 * إرسال رسائل المنصة (غير رسائل المصادقة التي يديرها Supabase) عبر النقل الكنسي
 * لمِهلة: Hostinger SMTP فقط، بلا أي مزوّد بريد مُدار خارجي.
 *
 * يُستخدم خادمياً فقط، ولا يرمي أبداً حتى لا تتعطل العملية الأساسية.
 * العقد الخارجي محفوظ: نفس المعاملات السابقة تعمل كما هي، مع هوية افتراضية
 * `system` (‎noreply@mehlalex.com) وعنوان رد النظام من إعدادات الخادم.
 */
import type * as React from "react";
import { render } from "@react-email/render";
import {
  MEHLA_MAIL_DOMAIN,
  sendMehlaEmail,
  type MehlaErrorClass,
  type MehlaIdentity,
} from "./transport/mehla-mailer.server";

export const SITE_NAME = "مِهلة | MEHLA";
export const SITE_URL = "https://mehlalex.com";

/** المزوّد الفعلي بعد تحويل الدفعة B — لا مزوّد مُدار ولا مسار احتياطي. */
export const APP_EMAIL_PROVIDER = "hostinger_smtp" as const;

/** الهوية الافتراضية للتوافق الخلفي: صندوق النظام الحقيقي. */
export const DEFAULT_APP_EMAIL_IDENTITY: MehlaIdentity = "system";

export type AppEmailResult = {
  sent: boolean;
  reason?: string;
  ref?: string;
  /** تصنيف الفشل الحقيقي من طبقة النقل — لا رموز مزوّد مُختلقة. */
  errorClass?: MehlaErrorClass;
  /** معرّف الرسالة المُستخدم فعلاً (حتمي عند توفر مفتاح تفرّد). */
  messageId?: string;
};

/**
 * رفض على مستوى المستلم — سبب مشروع يُعاد للمستخدم برسالة عربية واضحة،
 * وليس عطل نظام، فلا يُسجَّل في سجل الأعطال.
 */
function isRecipientDeny(errorCode: string, errorClass: MehlaErrorClass): boolean {
  return errorClass === "PERMANENT" && errorCode === "smtp_rejected_recipient";
}

/**
 * معرّف رسالة حتمي مشتق من مفتاح التفرّد المنطقي: نفس المفتاح ينتج نفس
 * المعرّف عبر كل إعادة محاولة، وبلا كشف أي قيمة خام داخل الترويسة.
 */
export async function deterministicMessageId(idempotencyKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(`mehla-app-email:${idempotencyKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
  return `<app-${hex}@${MEHLA_MAIL_DOMAIN}>`;
}

export async function sendAppEmail(options: {
  to: string;
  subject: string;
  element: React.ReactElement;
  label?: string;
  /** إلزامي: يضمن ثبات معرّف الرسالة عبر إعادة المحاولات على طبقة مِهلة. */
  idempotencyKey: string;
  /** معرّف رسالة صريح (مثل معرّف التنبيه الحتمي) — يُستخدم حرفياً. */
  messageId?: string | null;
  /** هوية المُرسل؛ الافتراضي `system`. */
  identity?: MehlaIdentity;
  organizationId?: string | null;
  userId?: string | null;
}): Promise<AppEmailResult> {
  const identity = options.identity ?? DEFAULT_APP_EMAIL_IDENTITY;
  const action = options.label ?? "app_email";
  try {
    const [html, text] = await Promise.all([
      render(options.element),
      render(options.element, { plainText: true }),
    ]);

    const messageId =
      options.messageId?.trim() || (await deterministicMessageId(options.idempotencyKey));

    const result = await sendMehlaEmail({
      to: options.to,
      identity,
      subject: options.subject,
      html,
      text,
      messageId,
    });

    if (result.ok) return { sent: true, messageId: result.messageId };

    if (isRecipientDeny(result.errorCode, result.errorClass)) {
      return {
        sent: false,
        reason: result.errorCode,
        errorClass: result.errorClass,
        messageId: result.messageId,
      };
    }

    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "email",
      action,
      error: result.message,
      errorCode: result.errorCode,
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
      metadata: {
        provider: APP_EMAIL_PROVIDER,
        identity,
        error_class: result.errorClass,
        smtp_code: result.smtpCode,
        recipient: maskRecipient(options.to),
        subject: options.subject,
        latency_ms: result.latencyMs,
      },
    });
    console.error("[app-email] فشل إرسال رسالة المنصة", {
      ref,
      provider: APP_EMAIL_PROVIDER,
      code: result.errorCode,
      errorClass: result.errorClass,
      smtpCode: result.smtpCode,
      recipient: maskRecipient(options.to),
    });
    return {
      sent: false,
      reason: result.errorCode,
      errorClass: result.errorClass,
      ref,
      messageId: result.messageId,
    };
  } catch (error) {
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "email",
      action,
      error,
      errorCode: "send_failed",
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
      metadata: {
        provider: APP_EMAIL_PROVIDER,
        identity,
        recipient: maskRecipient(options.to),
        subject: options.subject,
        stack: error instanceof Error ? (error.stack ?? "").slice(0, 1200) : null,
      },
    });
    return { sent: false, reason: "send_failed", errorClass: "RETRYABLE", ref };
  }
}

function maskRecipient(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}
