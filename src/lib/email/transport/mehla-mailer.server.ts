/**
 * المُرسل الكنسي لمِهلة — طبقة نقل مستقلة عن أي مزوّد مُدار، عبر Hostinger SMTP فقط.
 *
 * لا استيراد لأي مكتبة بريد خارجية مُدارة، ولا مفاتيح منصات، ولا مسار احتياطي خفي.
 * يعيد استخدام المكدّس القائم كما هو: `smtpSend` + `buildMimeMessage` + `senderIdentity`.
 * المصادقة دائماً بالصندوق الحقيقي `noreply@mehlalex.com`، وترويسة From تحمل هوية القسم.
 */
import { smtpSend, type SmtpErrorCode } from "./smtp.server";
import type { OutgoingMessage } from "./mime.server";
import { primaryMailboxAddress, redactTransportError } from "./config.server";

/** نطاق مِهلة الكنسي لعناوين الإرسال ومعرّفات الرسائل. */
export const MEHLA_MAIL_DOMAIN = "mehlalex.com";

/** الصندوق الوحيد الذي يملك بيانات دخول SMTP — ليس اسماً مستعاراً. */
export const CANONICAL_SMTP_MAILBOX = `noreply@${MEHLA_MAIL_DOMAIN}`;

/** الاسم الظاهر الافتراضي للمُرسل. */
export const DEFAULT_FROM_NAME = "مِهلة | MEHLA";

export type MehlaIdentity = "system" | "info" | "support" | "legal" | "sales" | "billing";

/** خريطة الهويات: `system` هو الصندوق الحقيقي، والبقية أسماء مستعارة بلا بيانات دخول. */
export const MEHLA_IDENTITIES: Record<MehlaIdentity, string> = {
  system: CANONICAL_SMTP_MAILBOX,
  info: `info@${MEHLA_MAIL_DOMAIN}`,
  support: `support@${MEHLA_MAIL_DOMAIN}`,
  legal: `legal@${MEHLA_MAIL_DOMAIN}`,
  sales: `sales@${MEHLA_MAIL_DOMAIN}`,
  billing: `billing@${MEHLA_MAIL_DOMAIN}`,
};

export const MEHLA_ALIAS_IDENTITIES: readonly MehlaIdentity[] = [
  "info",
  "support",
  "legal",
  "sales",
  "billing",
];

/** أصناف الفشل: تحدد هل تُعاد المحاولة، أم تُوقف نهائياً، أم هي عطل إعداد نظام. */
export type MehlaErrorClass = "RETRYABLE" | "PERMANENT" | "SYSTEM_CONFIGURATION_FAILURE";

export type MehlaErrorCode = SmtpErrorCode | "mail_system_reply_to_not_configured";

export type MehlaSendResult =
  | {
      ok: true;
      provider: "hostinger_smtp";
      smtpCode: number;
      messageId: string;
      envelopeFrom: string;
      headerFrom: string;
      replyTo: string;
      latencyMs: number;
    }
  | {
      ok: false;
      provider: "hostinger_smtp";
      errorCode: MehlaErrorCode;
      errorClass: MehlaErrorClass;
      /** رمز استجابة SMTP الفعلي عند توفره — لا يُختلق. */
      smtpCode: number | null;
      message: string;
      messageId: string;
      envelopeFrom: string | null;
      headerFrom: string;
      latencyMs: number;
    };

export type MehlaSendInput = {
  to: string;
  identity: MehlaIdentity;
  subject: string;
  html: string;
  text: string;
  /** يُستخدم حرفياً كما هو عند تمريره — لثبات إعادة المحاولة والتتبع. */
  messageId?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** عنوان الهوية الظاهرة. */
export function identityAddress(identity: MehlaIdentity): string {
  return MEHLA_IDENTITIES[identity];
}

export function isAliasIdentity(identity: MehlaIdentity): boolean {
  return identity !== "system";
}

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[A-Za-z]{2,}$/;

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * عنوان الرد: هوية القسم تُرد على نفسها، وصندوق النظام يتطلب
 * `MAIL_SYSTEM_REPLY_TO` صريحاً. لا يُختلق صندوق بديل عند غيابه.
 */
export function identityReplyTo(
  identity: MehlaIdentity,
): { ok: true; replyTo: string } | { ok: false; errorCode: "mail_system_reply_to_not_configured" } {
  if (identity !== "system") return { ok: true, replyTo: MEHLA_IDENTITIES[identity] };
  const configured = env("MAIL_SYSTEM_REPLY_TO").toLowerCase();
  if (!configured || !isValidEmailAddress(configured)) {
    return { ok: false, errorCode: "mail_system_reply_to_not_configured" };
  }
  return { ok: true, replyTo: configured };
}

/** هل `MAIL_SYSTEM_REPLY_TO` مُهيّأ وصالح؟ — بلا كشف القيمة. */
export function systemReplyToConfigured(): boolean {
  return identityReplyTo("system").ok;
}

/**
 * حالة مطابقة حساب المصادقة للصندوق الكنسي — تُعيد الحالة فقط دون طبع أي قيمة.
 */
export function canonicalAccountStatus(): "match" | "mismatch" | "unverified" {
  const configured = primaryMailboxAddress();
  if (!configured) return "unverified";
  return configured === CANONICAL_SMTP_MAILBOX ? "match" : "mismatch";
}

/** أعطال الإعداد: لا تُستهلك عليها محاولات المستلم. */
const CONFIGURATION_FAILURES = new Set<MehlaErrorCode>([
  "smtp_not_configured",
  "smtp_auth_failed",
  "smtp_rejected_sender",
  "mail_system_reply_to_not_configured",
]);

function looksLikeTlsFailure(message: string): boolean {
  return /tls|ssl|certificate|handshake/i.test(message);
}

/** تصنيف مركزي واحد: 5xx نهائي، 4xx أو رمز غير معروف قابل لإعادة المحاولة. */
export function classifyTransportFailure(
  code: MehlaErrorCode,
  smtpCode: number | null | undefined,
  message = "",
): MehlaErrorClass {
  if (CONFIGURATION_FAILURES.has(code)) return "SYSTEM_CONFIGURATION_FAILURE";
  if (code === "smtp_connect_failed" && looksLikeTlsFailure(message)) {
    return "SYSTEM_CONFIGURATION_FAILURE";
  }
  if (code === "smtp_timeout" || code === "smtp_connect_failed") return "RETRYABLE";
  if (typeof smtpCode === "number" && smtpCode >= 500 && smtpCode < 600) return "PERMANENT";
  return "RETRYABLE";
}

/** معرّف رسالة حتمي لتنبيه واحد — ثابت عبر كل محاولات الإرسال. */
export function notificationMessageId(notificationId: string): string {
  return `<notif-${notificationId}@${MEHLA_MAIL_DOMAIN}>`;
}

function generatedMessageId(): string {
  return `<mehla-${crypto.randomUUID()}@${MEHLA_MAIL_DOMAIN}>`;
}

/** بناء الرسالة الصادرة — بلا مرفقات في هذه الطبقة. */
export function buildMehlaOutgoingMessage(
  input: MehlaSendInput,
  replyTo: string,
  messageId: string,
): OutgoingMessage {
  return {
    from: identityAddress(input.identity),
    fromName: input.fromName?.trim() || DEFAULT_FROM_NAME,
    to: [input.to.trim()],
    cc: [],
    bcc: [],
    replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
    messageId,
    // رسائل النظام الآلية فقط؛ مراسلات الفريق البشرية لا تحمل هذه الترويسة.
    autoSubmitted: input.identity === "system",
  };
}

/**
 * الإرسال الكنسي: Hostinger SMTP فقط. قبول SMTP يعني «قُبلت للتسليم» لا تسليماً
 * نهائياً، ولا يوفّر المزوّد أي تفرّد أصلي — التفرّد يبقى على طبقة مِهلة.
 */
export async function sendMehlaEmail(input: MehlaSendInput): Promise<MehlaSendResult> {
  const started = Date.now();
  const headerFrom = identityAddress(input.identity);
  const messageId = input.messageId?.trim() || generatedMessageId();

  const explicitReplyTo = input.replyTo?.trim().toLowerCase();
  let replyTo: string;
  if (explicitReplyTo && isValidEmailAddress(explicitReplyTo)) {
    replyTo = explicitReplyTo;
  } else {
    const resolved = identityReplyTo(input.identity);
    if (!resolved.ok) {
      return {
        ok: false,
        provider: "hostinger_smtp",
        errorCode: resolved.errorCode,
        errorClass: "SYSTEM_CONFIGURATION_FAILURE",
        smtpCode: null,
        message: "عنوان الرد لرسائل النظام غير مُهيّأ في إعدادات الخادم.",
        messageId,
        envelopeFrom: null,
        headerFrom,
        latencyMs: Date.now() - started,
      };
    }
    replyTo = resolved.replyTo;
  }

  if (!isValidEmailAddress(input.to)) {
    return {
      ok: false,
      provider: "hostinger_smtp",
      errorCode: "smtp_rejected_recipient",
      errorClass: "PERMANENT",
      smtpCode: null,
      message: "عنوان المستلم غير صالح.",
      messageId,
      envelopeFrom: null,
      headerFrom,
      latencyMs: Date.now() - started,
    };
  }

  const message = buildMehlaOutgoingMessage(input, replyTo, messageId);
  // المصادقة دائماً بالصندوق الحقيقي، لا باسم مستعار لا يملك بيانات دخول.
  const result = await smtpSend(message, CANONICAL_SMTP_MAILBOX);

  if (result.ok) {
    return {
      ok: true,
      provider: "hostinger_smtp",
      smtpCode: result.smtpCode,
      messageId,
      envelopeFrom: result.envelopeFrom ?? CANONICAL_SMTP_MAILBOX,
      headerFrom: result.headerFrom ?? headerFrom,
      replyTo,
      latencyMs: Date.now() - started,
    };
  }

  const safeMessage = redactTransportError(result.message, CANONICAL_SMTP_MAILBOX);
  return {
    ok: false,
    provider: "hostinger_smtp",
    errorCode: result.code,
    errorClass: classifyTransportFailure(result.code, result.smtpCode ?? null, safeMessage),
    smtpCode: result.smtpCode ?? null,
    message: safeMessage,
    messageId,
    envelopeFrom: result.envelopeFrom ?? null,
    headerFrom: result.headerFrom ?? headerFrom,
    latencyMs: Date.now() - started,
  };
}
