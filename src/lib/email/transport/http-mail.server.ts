/**
 * نقل بريد HTTP خادمي — Resend REST API عبر `fetch` القياسي فقط.
 *
 * لا مقابس TCP ولا طبقة نقل خام: هذا هو النقل الوحيد المتوافق مع بيئة الحافة التي
 * يعمل فيها عامل بريد التنبيهات. طلب واحد لكل نداء بلا أي إعادة محاولة داخلية —
 * سلطة إعادة المحاولة تبقى في طابور التنبيهات وحده. المفتاح يُقرأ من بيئة الخادم
 * داخل الدالة فقط، ولا يُسجَّل ولا يُعاد، ولا يظهر محتوى الرسالة في أي خطأ.
 */
import type { OutgoingMessage } from "./mime.server";

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_TEXT = 300;

export type HttpMailErrorCode =
  | "mail_http_not_configured"
  | "mail_http_network_failed"
  | "mail_http_timeout"
  | "mail_http_auth_failed"
  | "mail_http_invalid_request"
  | "mail_http_rejected_recipient"
  | "mail_http_rate_limited"
  | "mail_http_provider_error";

export type HttpMailResult =
  | {
      ok: true;
      status: number;
      providerMessageId: string | null;
      latencyMs: number;
      envelopeFrom: string;
      headerFrom: string;
      replyTo: string | null;
    }
  | {
      ok: false;
      code: HttpMailErrorCode;
      message: string;
      status: number | null;
      latencyMs: number;
      envelopeFrom: string | null;
      headerFrom: string;
    };

function apiKey(): string {
  return (process.env["RESEND_API_KEY"] ?? "").trim();
}

function endpoint(): string {
  const configured = (process.env["RESEND_API_URL"] ?? "").trim();
  return configured.startsWith("https://") ? configured : DEFAULT_ENDPOINT;
}

/** تعقيم أي نص قبل إعادته: لا مفتاح، لا ترويسة مصادقة، لا رموز طويلة. */
export function redactHttpMailError(input: string): string {
  const secret = apiKey();
  let out = String(input).replace(/[\r\n]+/g, " ").slice(0, MAX_ERROR_TEXT);
  if (secret.length >= 8) out = out.split(secret).join("«محجوب»");
  return out
    .replace(/authorization\s*[:=]\s*\S+/gi, "authorization: «محجوب»")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer «محجوب»")
    .replace(/\bre_[A-Za-z0-9_-]{8,}\b/g, "«محجوب»");
}

/** مفتاح تفرّد حتمي مشتق من معرّف الرسالة — نفس الصف ينتج نفس المفتاح دائماً. */
export function stableRequestKey(messageId: string): string {
  return messageId.replace(/[<>]/g, "").trim().slice(0, 256);
}

/** هل نص الخطأ يدل على رفض نهائي خاص بالمستلم لا بإعداد النظام؟ */
export function looksLikeRecipientRejection(text: string): boolean {
  return /invalid[^a-z]*(to|recipient|email)|recipient[^a-z]*(invalid|rejected|not\s+valid)|not\s+a\s+valid\s+email|suppress/i.test(
    text,
  );
}

function classifyStatus(status: number, text: string): HttpMailErrorCode {
  if (status === 401 || status === 403) return "mail_http_auth_failed";
  if (status === 429) return "mail_http_rate_limited";
  if (status >= 500) return "mail_http_provider_error";
  if (status === 422 || status === 400) {
    return looksLikeRecipientRejection(text) ? "mail_http_rejected_recipient" : "mail_http_invalid_request";
  }
  if (status === 404 || status === 405) return "mail_http_invalid_request";
  return "mail_http_provider_error";
}

function addressList(name: string, address: string): string {
  const display = name.trim();
  return display ? `${display} <${address}>` : address;
}

/**
 * إرسال رسالة واحدة عبر واجهة HTTP. قبول المزوّد يعني «قُبلت للتسليم» فقط.
 * لا إعادة محاولة داخلية، ولا مسار احتياطي إلى SMTP.
 */
export async function httpMailSend(message: OutgoingMessage): Promise<HttpMailResult> {
  const started = Date.now();
  const headerFrom = message.from;
  const key = apiKey();
  if (key.length < 8) {
    return {
      ok: false,
      code: "mail_http_not_configured",
      message: "مفتاح مزوّد البريد غير مُهيّأ في أسرار الخادم.",
      status: null,
      latencyMs: 0,
      envelopeFrom: null,
      headerFrom,
    };
  }

  const recipients = message.to.filter((value) => value.trim().length > 0);
  if (recipients.length === 0) {
    return {
      ok: false,
      code: "mail_http_rejected_recipient",
      message: "لا يوجد مستلم صالح.",
      status: null,
      latencyMs: 0,
      envelopeFrom: null,
      headerFrom,
    };
  }

  const headers: Record<string, string> = { "Message-ID": message.messageId };
  if (message.autoSubmitted) headers["Auto-Submitted"] = "auto-generated";
  if (message.inReplyTo) headers["In-Reply-To"] = message.inReplyTo;

  const payload: Record<string, unknown> = {
    from: addressList(message.fromName, headerFrom),
    to: recipients,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers,
  };
  if (message.cc.length > 0) payload["cc"] = message.cc;
  if (message.bcc.length > 0) payload["bcc"] = message.bcc;
  if (message.replyTo) payload["reply_to"] = message.replyTo;

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // تفرّد حتمي: إعادة المحاولة على نفس الصف لا تنتج رسالتين عند المزوّد.
        "Idempotency-Key": stableRequestKey(message.messageId),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const timedOut = /abort|timeout/i.test(raw);
    return {
      ok: false,
      code: timedOut ? "mail_http_timeout" : "mail_http_network_failed",
      message: timedOut
        ? "انتهت مهلة الاتصال بمزوّد البريد."
        : `تعذّر الوصول إلى مزوّد البريد: ${redactHttpMailError(raw)}`,
      status: null,
      latencyMs: Date.now() - started,
      envelopeFrom: null,
      headerFrom,
    };
  }

  let bodyText = "";
  try {
    bodyText = (await response.text()).slice(0, 2000);
  } catch {
    bodyText = "";
  }

  if (!response.ok) {
    const code = classifyStatus(response.status, bodyText);
    return {
      ok: false,
      code,
      // نص المزوّد المُعقَّم فقط، بلا أي جزء من محتوى الرسالة.
      message: redactHttpMailError(bodyText || `HTTP ${response.status}`),
      status: response.status,
      latencyMs: Date.now() - started,
      envelopeFrom: headerFrom,
      headerFrom,
    };
  }

  let providerMessageId: string | null = null;
  try {
    const parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
    const value = parsed["id"];
    if (typeof value === "string" && value.trim()) providerMessageId = value.trim();
  } catch {
    providerMessageId = null;
  }

  return {
    ok: true,
    status: response.status,
    providerMessageId,
    latencyMs: Date.now() - started,
    envelopeFrom: headerFrom,
    headerFrom,
    replyTo: message.replyTo ?? null,
  };
}
