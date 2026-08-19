/**
 * طبقة تجريد مزوّدي الرسائل النصية — خادم فقط.
 *
 * إضافة أو تغيير المزوّد يتم من لوحة الإدارة (اسم المزوّد، الرابط، المُرسل، المعرّفات)
 * ومن الأسرار (المفتاح والسر) — دون أي تعديل على الكود. كل مزوّد يُنفّذ نفس العقد:
 *   send(message) -> { reference, latencyMs } أو خطأ يحمل رمزاً وسبباً قابلاً للتسجيل.
 */
import type { SmsProvider } from "./sms.shared";

export type SmsProviderConfig = {
  provider: SmsProvider;
  baseUrl: string | null;
  applicationId: string | null;
  serviceSid: string | null;
  senderId: string | null;
  senderName: string | null;
};

export type SmsSendResult = { reference: string | null; latencyMs: number };

export class SmsProviderError extends Error {
  code: string;
  status: number | null;
  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Credentials = { key: string | null; secret: string | null };

/** تُقرأ الأسرار داخل المعالج دائماً — لا يوجد أي قراءة على مستوى الوحدة. */
export function readSmsCredentials(): Credentials {
  return {
    key: process.env["SMS_API_KEY"] ?? null,
    secret: process.env["SMS_API_SECRET"] ?? null,
  };
}

function requireKey(creds: Credentials): string {
  if (!creds.key) {
    throw new SmsProviderError(
      "MISSING_CREDENTIALS",
      "مفتاح مزوّد الرسائل غير مُعرَّف في أسرار المنصة.",
    );
  }
  return creds.key;
}

async function readBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 600);
  } catch {
    return "";
  }
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function sendInfobip(
  config: SmsProviderConfig,
  creds: Credentials,
  to: string,
  text: string,
): Promise<string | null> {
  const base = trimUrl(config.baseUrl ?? "https://api.infobip.com");
  const response = await fetch(`${base}/sms/2/text/advanced`, {
    method: "POST",
    headers: {
      Authorization: `App ${requireKey(creds)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        { from: config.senderId ?? config.senderName ?? "MEHLA", destinations: [{ to }], text },
      ],
    }),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new SmsProviderError(
      "PROVIDER_REJECTED",
      `Infobip [${response.status}]: ${body}`,
      response.status,
    );
  }
  try {
    const parsed = JSON.parse(body) as { messages?: { messageId?: string }[] };
    return parsed.messages?.[0]?.messageId ?? null;
  } catch {
    return null;
  }
}

async function sendTwilio(
  config: SmsProviderConfig,
  creds: Credentials,
  to: string,
  text: string,
): Promise<string | null> {
  const accountSid = config.applicationId;
  if (!accountSid) {
    throw new SmsProviderError(
      "MISSING_CONFIG",
      "معرّف حساب Twilio (Account SID) غير مُعرَّف في الإعدادات.",
    );
  }
  if (!creds.secret) {
    throw new SmsProviderError(
      "MISSING_CREDENTIALS",
      "سر مزوّد الرسائل غير مُعرَّف في أسرار المنصة.",
    );
  }
  const base = trimUrl(config.baseUrl ?? "https://api.twilio.com");
  const params = new URLSearchParams({ To: to, Body: text });
  if (config.serviceSid) params.set("MessagingServiceSid", config.serviceSid);
  else params.set("From", config.senderId ?? "");
  const response = await fetch(`${base}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${requireKey(creds)}:${creds.secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new SmsProviderError(
      "PROVIDER_REJECTED",
      `Twilio [${response.status}]: ${body}`,
      response.status,
    );
  }
  try {
    return (JSON.parse(body) as { sid?: string }).sid ?? null;
  } catch {
    return null;
  }
}

async function sendUnifonic(
  config: SmsProviderConfig,
  creds: Credentials,
  to: string,
  text: string,
): Promise<string | null> {
  const appSid = config.applicationId;
  if (!appSid) {
    throw new SmsProviderError(
      "MISSING_CONFIG",
      "معرّف تطبيق Unifonic (AppSid) غير مُعرَّف في الإعدادات.",
    );
  }
  const base = trimUrl(config.baseUrl ?? "https://el.cloud.unifonic.com");
  const params = new URLSearchParams({
    AppSid: appSid,
    Recipient: to.replace("+", ""),
    Body: text,
  });
  if (config.senderId) params.set("SenderID", config.senderId);
  const response = await fetch(`${base}/rest/SMS/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new SmsProviderError(
      "PROVIDER_REJECTED",
      `Unifonic [${response.status}]: ${body}`,
      response.status,
    );
  }
  try {
    const parsed = JSON.parse(body) as {
      success?: boolean;
      data?: { MessageID?: string | number };
    };
    if (parsed.success === false) {
      throw new SmsProviderError("PROVIDER_REJECTED", `Unifonic: ${body}`, response.status);
    }
    return parsed.data?.MessageID != null ? String(parsed.data.MessageID) : null;
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    return null;
  }
}

/** الرابط الأساسي لبوابة مدار التقنية (Madar SMS API v1). */
export const MOBILENET_BASE_URL = "https://app.mobile.net.sa";

/** توحيد رقم الجوال السعودي إلى الصيغة الدولية بدون رمز + (9665XXXXXXXX). */
export function normalizeSaudiMsisdn(raw: string): string {
  let phone = raw.replace(/[\s\-()+]/g, "");
  if (phone.startsWith("00966")) phone = phone.slice(2);
  else if (phone.startsWith("05")) phone = `966${phone.slice(1)}`;
  else if (phone.startsWith("5") && phone.length === 9) phone = `966${phone}`;
  return phone;
}

/** استخراج معرّف الرسالة من رد المزوّد إن وُجد — بلا معرّفات وهمية. */
function mobileNetReference(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      id?: string | number;
      messageId?: string | number;
      msgId?: string | number;
      data?: { id?: string | number; messageId?: string | number };
    };
    const reference =
      parsed.id ?? parsed.messageId ?? parsed.msgId ?? parsed.data?.id ?? parsed.data?.messageId;
    return reference != null ? String(reference) : null;
  } catch {
    return null;
  }
}

/** مزوّد مدار التقنية (mobile.net.sa) — Madar SMS API v1. */
async function sendMobileNet(
  config: SmsProviderConfig,
  creds: Credentials,
  to: string,
  text: string,
): Promise<string | null> {
  const apiKey = requireKey(creds);
  const sender = config.senderName ?? config.senderId ?? "Mehlalex";
  const base = trimUrl(config.baseUrl ?? MOBILENET_BASE_URL);

  const response = await fetch(`${base}/api/v1/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      number: normalizeSaudiMsisdn(to),
      senderName: sender,
      sendAtOption: "Now",
      messageBody: text,
    }),
  });

  const body = await readBody(response);
  if (!response.ok) {
    throw new SmsProviderError(
      "PROVIDER_REJECTED",
      `MobileNet [${response.status}]: ${body}`,
      response.status,
    );
  }
  return mobileNetReference(body);
}

/** فحص رصيد الحساب عند مدار التقنية — يُستخدم لإثبات صحة المفتاح. */
export async function checkMobileNetBalance(
  config: SmsProviderConfig,
): Promise<{ status: number; body: string }> {
  const apiKey = requireKey(readSmsCredentials());
  const base = trimUrl(config.baseUrl ?? MOBILENET_BASE_URL);
  const response = await fetch(`${base}/api/v1/get-balance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: "{}",
  });
  return { status: response.status, body: await readBody(response) };
}

/** مزوّد مخصص: نقطة HTTP يحددها العميل وتستقبل JSON موحّداً. */
async function sendCustom(
  config: SmsProviderConfig,
  creds: Credentials,
  to: string,
  text: string,
): Promise<string | null> {
  if (!config.baseUrl) {
    throw new SmsProviderError("MISSING_CONFIG", "رابط المزوّد المخصص غير مُعرَّف في الإعدادات.");
  }
  const response = await fetch(trimUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(creds.key ? { Authorization: `Bearer ${creds.key}` } : {}),
    },
    body: JSON.stringify({
      to,
      text,
      sender: config.senderId ?? config.senderName ?? "MEHLA",
      application_id: config.applicationId,
    }),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new SmsProviderError(
      "PROVIDER_REJECTED",
      `Custom [${response.status}]: ${body}`,
      response.status,
    );
  }
  try {
    const parsed = JSON.parse(body) as { id?: string; reference?: string; messageId?: string };
    return parsed.id ?? parsed.reference ?? parsed.messageId ?? null;
  } catch {
    return null;
  }
}

const SENDERS: Record<
  SmsProvider,
  (
    config: SmsProviderConfig,
    creds: Credentials,
    to: string,
    text: string,
  ) => Promise<string | null>
> = {
  infobip: sendInfobip,
  twilio: sendTwilio,
  unifonic: sendUnifonic,
  mobilenet: sendMobileNet,
  custom: sendCustom,
};

/** نقطة الإرسال الوحيدة في المنصة — أي مزوّد جديد يُضاف هنا فقط. */
export async function sendSms(
  config: SmsProviderConfig,
  message: { to: string; text: string },
): Promise<SmsSendResult> {
  const started = Date.now();
  const creds = readSmsCredentials();
  const send = SENDERS[config.provider];
  if (!send) throw new SmsProviderError("UNKNOWN_PROVIDER", "مزوّد الرسائل المحدد غير مدعوم.");
  try {
    const reference = await send(config, creds, message.to, message.text);
    return { reference, latencyMs: Date.now() - started };
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    throw new SmsProviderError(
      "NETWORK_ERROR",
      error instanceof Error ? error.message.slice(0, 400) : "تعذّر الاتصال بمزوّد الرسائل.",
    );
  }
}
