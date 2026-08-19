/**
 * قناة تنبيه فريق المنصة — مستقلة عن SMTP.
 *
 * الأولوية: Webhook تشغيلي (سرّ بيئة) ثم بريد عبر Resend HTTP API. لا يُستخدم
 * مسار SMTP إطلاقاً حتى لا يتوقف التنبيه بتوقف البريد نفسه، ولا تُرسل الحادثة
 * أي محتوى قانوني أو بيانات مكتب.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { IncidentSeverity } from "@/lib/observability/incidents.shared";
import { INCIDENT_SEVERITY_LABELS } from "@/lib/observability/incidents.shared";

type Db = SupabaseClient<Database>;

export type AlertPayload = {
  incidentId: string;
  title: string;
  severity: IncidentSeverity;
  surface: string;
  action: string;
  occurrences: number;
  reopened: boolean;
};

export type AlertResult = { sent: boolean; channel: string; reason?: string };

const SETTINGS_KEY = "operations.alerts";

async function alertRecipients(db: Db): Promise<string[]> {
  const fromEnv = (process.env["OPS_ALERT_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.includes("@"));
  if (fromEnv.length > 0) return fromEnv.slice(0, 5);

  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const value = data?.value as { emails?: unknown } | null;
  const list = Array.isArray(value?.emails) ? value?.emails : [];
  return list
    .filter((entry): entry is string => typeof entry === "string" && entry.includes("@"))
    .slice(0, 5);
}

function alertText(payload: AlertPayload): string {
  return [
    payload.reopened ? "إعادة فتح حادثة تشغيلية" : "حادثة تشغيلية جديدة",
    `العنوان: ${payload.title}`,
    `الخطورة: ${INCIDENT_SEVERITY_LABELS[payload.severity]}`,
    `الموضع: ${payload.surface} / ${payload.action}`,
    `عدد التكرارات: ${payload.occurrences}`,
    `المعرّف: ${payload.incidentId}`,
  ].join("\n");
}

async function sendWebhookAlert(payload: AlertPayload): Promise<AlertResult | null> {
  const url = (process.env["OPS_ALERT_WEBHOOK_URL"] ?? "").trim();
  if (!url.startsWith("https://")) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: alertText(payload) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { sent: false, channel: "webhook", reason: `http_${response.status}` };
    }
    return { sent: true, channel: "webhook" };
  } catch {
    return { sent: false, channel: "webhook", reason: "webhook_unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmailAlert(db: Db, payload: AlertPayload): Promise<AlertResult> {
  const recipients = await alertRecipients(db);
  if (recipients.length === 0) {
    return { sent: false, channel: "email", reason: "no_recipients" };
  }
  if (!(process.env["RESEND_API_KEY"] ?? "").trim()) {
    return { sent: false, channel: "email", reason: "http_transport_unconfigured" };
  }

  const { httpMailSend } = await import("@/lib/email/transport/http-mail.server");
  const text = alertText(payload);
  const html = `<div dir="rtl" style="font-family:system-ui,sans-serif;line-height:1.9">${text
    .split("\n")
    .map((line) => `<div>${line.replace(/[<>&]/g, "")}</div>`)
    .join("")}</div>`;

  const result = await httpMailSend({
    from: `alerts@${(process.env["MEHLA_MAIL_DOMAIN"] ?? "mail.mehlalex.com").trim()}`,
    fromName: "تنبيهات تشغيل مِهلة",
    to: recipients,
    cc: [],
    bcc: [],
    subject: `[مِهلة] ${INCIDENT_SEVERITY_LABELS[payload.severity]}: ${payload.title}`.slice(0, 160),
    html,
    text,
    messageId: `<ops-${payload.incidentId}-${payload.occurrences}@mehla>`,
    autoSubmitted: true,
  });

  return result.ok
    ? { sent: true, channel: "email" }
    : { sent: false, channel: "email", reason: result.code };
}

/**
 * يُرسل التنبيه على أول قناة ناجحة. لا يرمي: فشل التنبيه يُسجَّل على الحادثة
 * نفسها ولا يُسقط مسار الرصد.
 */
export async function dispatchIncidentAlert(db: Db, payload: AlertPayload): Promise<AlertResult> {
  try {
    const webhook = await sendWebhookAlert(payload);
    if (webhook?.sent) return webhook;
    const email = await sendEmailAlert(db, payload);
    if (email.sent) return email;
    return webhook && !webhook.sent ? webhook : email;
  } catch {
    return { sent: false, channel: "none", reason: "alert_dispatch_failed" };
  }
}