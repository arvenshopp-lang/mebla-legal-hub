/**
 * إرسال رسائل المنصة (غير رسائل المصادقة التي يديرها Supabase) عبر خدمة البريد
 * المُدارة. يُستخدم خادمياً فقط، ولا يرمي أبداً حتى لا تتعطل العملية الأساسية.
 */
import type * as React from "react";
import { render } from "@react-email/render";
import { EmailAPIError, sendLovableEmail } from "@lovable.dev/email-js";

export const SITE_NAME = "مِهلة | MEHLA";
export const SITE_URL = "https://mehlalex.com";

const SENDER_DOMAIN = "mail.mehlalex.com";
const FROM = "MEHLA <noreply@mehlalex.com>";

export type AppEmailResult = { sent: boolean; reason?: string; ref?: string };

const PROVIDER = "lovable-managed-email";

/**
 * رفض على مستوى المستلم (عنوان موقوف أو غير صالح) — سبب مشروع يُعاد للمستخدم
 * برسالة عربية واضحة، وليس عطل نظام، فلا يُسجَّل في سجل الأعطال.
 */
const RECIPIENT_DENY_CODES = new Set(["recipient_suppressed", "invalid_recipient"]);

export async function sendAppEmail(options: {
  to: string;
  subject: string;
  element: React.ReactElement;
  label?: string;
  /** إلزامي: خدمة البريد ترفض رسائل المنصة بدون مفتاح تفرّد. */
  idempotencyKey: string;
  organizationId?: string | null;
  userId?: string | null;
}): Promise<AppEmailResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "email",
      action: options.label ?? "app_email",
      error: "LOVABLE_API_KEY غير مُهيّأ في بيئة الخادم",
      errorCode: "email_not_configured",
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
      metadata: { provider: PROVIDER, recipient: maskRecipient(options.to) },
    });
    return { sent: false, reason: "email_not_configured", ref };
  }

  try {
    const [html, text] = await Promise.all([
      render(options.element),
      render(options.element, { plainText: true }),
    ]);

    const response = await sendLovableEmail(
      {
        to: options.to,
        from: FROM,
        sender_domain: SENDER_DOMAIN,
        subject: options.subject,
        html,
        text,
        // رسائل المنصة (غير المصادقة) تُرسل بغرض transactional مع مفتاح تفرّد،
        // وإلا ترفضها الخدمة بخطأ missing_parameter (run_id).
        purpose: "transactional",
        idempotency_key: options.idempotencyKey,
        ...(options.label ? { label: options.label } : {}),
      },
      {
        apiKey,
        sendUrl: process.env["LOVABLE_SEND_URL"],
        idempotencyKey: options.idempotencyKey,
      },
    );
    if (response.success === true) return { sent: true };

    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "email",
      action: options.label ?? "app_email",
      error: `رفضت خدمة البريد الرسالة (status=${response.status ?? "unknown"})`,
      errorCode: "send_not_accepted",
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
      metadata: {
        provider: PROVIDER,
        recipient: maskRecipient(options.to),
        response_status: response.status ?? null,
        workflow_id: response.workflow_id ?? null,
      },
    });
    return { sent: false, reason: "send_not_accepted", ref };
  } catch (error) {
    const apiError = error instanceof EmailAPIError ? error : null;
    const reason = apiError ? (apiError.code ?? `http_${apiError.status}`) : "send_failed";
    if (RECIPIENT_DENY_CODES.has(reason)) return { sent: false, reason };
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "email",
      action: options.label ?? "app_email",
      error,
      errorCode: reason,
      httpStatus: apiError?.status ?? null,
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
      metadata: {
        provider: PROVIDER,
        recipient: maskRecipient(options.to),
        subject: options.subject,
        response_body:
          apiError?.message?.slice(0, 900) ??
          (error instanceof Error ? error.message.slice(0, 900) : String(error).slice(0, 900)),
        stack: error instanceof Error ? (error.stack ?? "").slice(0, 1200) : null,
      },
    });
    console.error("[app-email] فشل إرسال رسالة المنصة", {
      ref,
      provider: PROVIDER,
      code: reason,
      status: apiError?.status ?? null,
      recipient: maskRecipient(options.to),
    });
    return { sent: false, reason, ref };
  }
}

function maskRecipient(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}
