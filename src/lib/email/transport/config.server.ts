/**
 * إعدادات بريد Hostinger — تُقرأ من متغيرات البيئة داخل الدوال فقط.
 *
 * لا تُعاد كلمة المرور من أي دالة، ولا تُسجَّل في أي مسار، ولا تصل الواجهة.
 * الواجهة تحصل على حالة توفر الأسرار (موجود/مفقود) لا قيمها.
 */

export type MailTransportConfig = {
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; secure: boolean };
  user: string;
  password: string;
  from: string;
};

export type SecretsStatus = {
  smtpHost: boolean;
  imapHost: boolean;
  user: boolean;
  password: boolean;
  from: boolean;
  complete: boolean;
};

/**
 * هوية المُرسل لرسالة واحدة: المصادقة دائماً بالحساب الحقيقي، والهوية الظاهرة
 * هي الاسم المستعار. فصل المظروف عن الترويسة يمنع رفض المزوّد لعنوان مُرسل
 * غير مُصادَق عليه (Envelope From) مع الحفاظ على ظهور القسم للمستلم (Header From).
 */
export type SenderIdentity = {
  /** اسم مستخدم SMTP/IMAP — الحساب الحقيقي الوحيد. */
  authUser: string;
  /** MAIL FROM / Return-Path — الحساب الحقيقي المُصادق عليه. */
  envelopeFrom: string;
  /** ترويسة From الظاهرة للمستلم — الاسم المستعار. */
  headerFrom: string;
  /** عنوان الرد المناسب: الاسم المستعار، وقناة بشرية بديلة لصندوق النظام. */
  replyTo: string;
  /** هل الهوية الظاهرة اسم مستعار لا يملك بيانات دخول خاصة؟ */
  isAlias: boolean;
  /** هل الهوية الظاهرة صندوق النظام (noreply) الذي لا يُتابع ردوده؟ */
  isSystem: boolean;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function localPartKey(address: string): string {
  return (address.split("@")[0] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * بيانات اعتماد الصندوق: يُفضّل المفتاح الخاص بالصندوق
 * (`MAIL_USER_SUPPORT` / `MAIL_PASSWORD_SUPPORT`) وإلا الحساب المشترك
 * (`MAIL_USER` / `MAIL_PASSWORD`) حسب إعداد Hostinger الفعلي.
 */
export function transportConfig(mailboxAddress?: string | null): MailTransportConfig {
  const suffix = mailboxAddress ? localPartKey(mailboxAddress) : "";
  const user = (suffix && env(`MAIL_USER_${suffix}`)) || env("MAIL_USER");
  const password = (suffix && env(`MAIL_PASSWORD_${suffix}`)) || env("MAIL_PASSWORD");
  const from = mailboxAddress?.trim() || env("MAIL_FROM") || user;
  return {
    smtp: {
      host: env("SMTP_HOST") || "smtp.hostinger.com",
      port: Number(env("SMTP_PORT") || 465),
      secure: (env("SMTP_SECURE") || "true").toLowerCase() !== "false",
    },
    imap: {
      host: env("IMAP_HOST") || "imap.hostinger.com",
      port: Number(env("IMAP_PORT") || 993),
      secure: (env("IMAP_SECURE") || "true").toLowerCase() !== "false",
    },
    user,
    password,
    from,
  };
}

/** حالة الأسرار دون كشف أي قيمة. */
export function secretsStatus(mailboxAddress?: string | null): SecretsStatus {
  const config = transportConfig(mailboxAddress);
  const status = {
    smtpHost: Boolean(config.smtp.host) && Number.isFinite(config.smtp.port),
    imapHost: Boolean(config.imap.host) && Number.isFinite(config.imap.port),
    user: Boolean(config.user),
    password: Boolean(config.password),
    from: Boolean(config.from),
  };
  return { ...status, complete: Object.values(status).every(Boolean) };
}

export function transportConfigured(mailboxAddress?: string | null): boolean {
  return secretsStatus(mailboxAddress).complete;
}

/** هل العنوان صندوق النظام الآلي (noreply@…)؟ */
function isSystemAddress(address: string): boolean {
  return /^no-?reply@/i.test(address.trim());
}

/**
 * حساب هوية المُرسل: مصادقة واحدة بالحساب الحقيقي، وترويسة From بالاسم
 * المستعار. لا تُنشأ بيانات دخول لأي اسم مستعار.
 */
export function senderIdentity(mailboxAddress?: string | null): SenderIdentity {
  const config = transportConfig(mailboxAddress ?? null);
  const displayed = (mailboxAddress ?? "").trim().toLowerCase() || config.user;
  const ownCredentials = displayed ? mailboxHasOwnCredentials(displayed) : false;
  const system = isSystemAddress(displayed);
  const domain = displayed.split("@")[1] ?? config.user.split("@")[1] ?? "";
  const systemReplyTo =
    env("MAIL_SYSTEM_REPLY_TO") || (domain ? `support@${domain}` : config.user);
  return {
    authUser: config.user,
    // المظروف بالحساب المُصادق عليه دائماً؛ هذا ما يقبله المزوّد ويطابق SPF.
    envelopeFrom: config.user || displayed,
    headerFrom: displayed || config.user,
    replyTo: system ? systemReplyTo : displayed || config.user,
    isAlias: !ownCredentials,
    isSystem: system,
  };
}

/** عنوان الحساب الحقيقي الوحيد الذي يملك بيانات الدخول. */
export function primaryMailboxAddress(): string {
  return (env("MAIL_USER") || env("MAIL_FROM")).toLowerCase();
}

/**
 * هل يملك هذا الصندوق بيانات دخول خاصة به فعلاً؟
 * الأسماء المستعارة (support/sales/...) لا تملك، فلا يُسجَّل الدخول إليها.
 */
export function mailboxHasOwnCredentials(mailboxAddress: string): boolean {
  const address = mailboxAddress.trim().toLowerCase();
  if (!address) return false;
  if (address === primaryMailboxAddress()) return true;
  const suffix = localPartKey(address);
  return Boolean(suffix && env(`MAIL_USER_${suffix}`) && env(`MAIL_PASSWORD_${suffix}`));
}

/**
 * تعقيم رسائل الأخطاء قبل أي تسجيل: يمنع ظهور بيانات الاعتماد أو
 * سطور المصادقة الخام في السجلات.
 */
export function redactTransportError(message: string, mailboxAddress?: string | null): string {
  const config = transportConfig(mailboxAddress);
  let out = message.replace(/[\r\n]+/g, " ").slice(0, 400);
  for (const secret of [config.password, config.user]) {
    if (secret && secret.length > 2) out = out.split(secret).join("«محجوب»");
  }
  return out
    .replace(/\bAUTH\s+(LOGIN|PLAIN)[^\s]*.*/i, "AUTH «محجوب»")
    .replace(/\bLOGIN\s+\S+\s+\S+/i, "LOGIN «محجوب»")
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "«محجوب»");
}
