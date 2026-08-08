/**
 * مزوّد Whats Line — WhatsApp Official Meta WABA (خادم فقط).
 *
 * قواعد ثابتة:
 *  - الأسرار تُقرأ داخل الدوال فقط، ولا تُسجَّل ولا تُعاد للمتصفح.
 *  - كل طلب يمر على طبقة HTTP الآمنة (مهلة + حماية SSRF + حد حجم + منع إعادة التوجيه).
 *  - كل خطأ يُطبَّع إلى رمز واحد مع تصنيف «قابل للإعادة / نهائي».
 */
import {
  IntegrationHttpError,
  integrationFetch,
  type IntegrationResponse,
} from "@/lib/integrations/http.server";
import { SsrfBlockedError, type UrlPolicy } from "@/lib/integrations/ssrf.server";

const TIMEOUT_MS = 15_000;

export class WhatsLineError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly detail: string;
  constructor(code: string, detail = "", status: number | null = null, retryable = false) {
    super(`${code}: ${detail}`.slice(0, 400));
    this.code = code;
    this.detail = detail.slice(0, 400);
    this.status = status;
    this.retryable = retryable;
  }
}

type ProviderConfig = { baseUrl: string; token: string; appId: string; host: string };

export function credentialsReady(): boolean {
  return Boolean(process.env["WHATSLINE_BASE_URL"] && process.env["WHATSLINE_HEADER_TOKEN"]);
}

function config(): ProviderConfig {
  const baseUrl = (process.env["WHATSLINE_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const token = (process.env["WHATSLINE_HEADER_TOKEN"] ?? "").trim();
  const appId = (process.env["WHATSLINE_APP_ID"] ?? "").trim();
  if (!baseUrl || !token) throw new WhatsLineError("MISSING_CREDENTIALS", "base url or token");
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new WhatsLineError("MISSING_CREDENTIALS", "invalid base url");
  }
  return { baseUrl, token, appId, host };
}

export function testPhoneFromEnv(): string | null {
  const value = (process.env["WHATSLINE_TEST_PHONE"] ?? "").trim();
  return value || null;
}

function policy(cfg: ProviderConfig): UrlPolicy {
  return { environment: "production", allowedHosts: [cfg.host] };
}

/** تطبيع الخطأ من رمز HTTP وجسم الاستجابة — بلا أي سرّ في الناتج. */
function normalizeStatus(status: number, bodyText: string): WhatsLineError {
  const snippet = bodyText.replace(/\s+/g, " ").slice(0, 200);
  if (status === 401 || status === 403) return new WhatsLineError("AUTH_FAILED", snippet, status);
  if (status === 404) return new WhatsLineError("ENDPOINT_NOT_FOUND", snippet, status);
  if (status === 429) return new WhatsLineError("RATE_LIMITED", snippet, status, true);
  if (status >= 500) return new WhatsLineError("PROVIDER_5XX", snippet, status, true);
  const lowered = snippet.toLowerCase();
  if (/template/.test(lowered)) return new WhatsLineError("TEMPLATE_NOT_FOUND", snippet, status);
  if (/(phone|number|recipient)/.test(lowered))
    return new WhatsLineError("INVALID_PHONE", snippet, status);
  if (/(device|sender|offline|disconnect)/.test(lowered))
    return new WhatsLineError("DEVICE_OFFLINE", snippet, status);
  if (status >= 400) return new WhatsLineError("INVALID_REQUEST", snippet, status);
  return new WhatsLineError("UNKNOWN_PROVIDER_ERROR", snippet, status);
}

function normalizeThrown(error: unknown): WhatsLineError {
  if (error instanceof WhatsLineError) return error;
  if (error instanceof SsrfBlockedError) {
    return new WhatsLineError("INVALID_REQUEST", "blocked url");
  }
  if (error instanceof IntegrationHttpError) {
    if (error.code === "TIMEOUT") return new WhatsLineError("TIMEOUT", error.detail, null, true);
    if (error.code === "NETWORK_ERROR")
      return new WhatsLineError("NETWORK_ERROR", error.detail, null, true);
    return new WhatsLineError("UNKNOWN_PROVIDER_ERROR", error.detail, error.status);
  }
  return new WhatsLineError(
    "UNKNOWN_PROVIDER_ERROR",
    error instanceof Error ? error.message.slice(0, 200) : "unknown",
  );
}

async function request(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<IntegrationResponse> {
  const cfg = config();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/json",
  };
  if (cfg.appId) headers["X-App-Id"] = cfg.appId;
  if (init.method === "POST") headers["Content-Type"] = "application/json";

  const response = await integrationFetch({
    method: init.method,
    url: `${cfg.baseUrl}/${path.replace(/^\/+/, "")}`,
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
    timeoutMs: TIMEOUT_MS,
    policy: policy(cfg),
  });
  if (response.status >= 400) throw normalizeStatus(response.status, response.bodyText);
  return response;
}

/* ------------------------------------------------- قراءة الاستجابات بمرونة */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** يستخرج أول مصفوفة كائنات من الاستجابة أياً كان اسم مفتاح التغليف. */
function extractList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
  const record = asRecord(payload);
  if (!record) return [];
  const candidates = ["data", "devices", "templates", "result", "results", "items", "records", "list"];
  for (const key of candidates) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
    }
    const nested = asRecord(value);
    if (nested) {
      const inner = extractList(nested);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function countPlaceholders(text: string | null): number {
  if (!text) return 0;
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(match[1] ?? "");
  return found.size;
}

/* --------------------------------------------------------------- العمليات */

export type ProviderProbe = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  path: string | null;
  code: string | null;
  detail: string | null;
};

/** مسارات القراءة الرسمية المرشّحة — يُعتمد أول مسار يرجع قائمة صالحة. */
const DEVICE_PATHS = [
  "official/v1/devices",
  "official/v1/device/list",
  "official/v1/senders",
  "official/v1/numbers",
];

const TEMPLATE_PATHS = [
  "official/v1/templates",
  "official/v1/template/list",
  "official/v1/message-templates",
];

export const SEND_PATH = "official/v1/send-message";

async function firstWorkingList(
  paths: string[],
): Promise<{ path: string; rows: Record<string, unknown>[]; latencyMs: number; status: number }> {
  let lastError: WhatsLineError | null = null;
  for (const path of paths) {
    try {
      const response = await request(path, { method: "GET" });
      return {
        path,
        rows: extractList(response.json),
        latencyMs: response.latencyMs,
        status: response.status,
      };
    } catch (error) {
      const normalized = normalizeThrown(error);
      // مسار غير موجود عند هذا المزوّد → نجرّب المسار التالي. أي خطأ آخر يوقف المحاولة.
      if (normalized.code === "ENDPOINT_NOT_FOUND") {
        lastError = normalized;
        continue;
      }
      throw normalized;
    }
  }
  throw lastError ?? new WhatsLineError("ENDPOINT_NOT_FOUND", paths.join(","));
}

/** فحص اتصال حقيقي: يعتمد نجاح قراءة الأجهزة الرسمية كدليل اتصال ومصادقة. */
export async function testConnection(): Promise<ProviderProbe> {
  const started = Date.now();
  try {
    const result = await firstWorkingList(DEVICE_PATHS);
    return {
      ok: true,
      status: result.status,
      latencyMs: result.latencyMs,
      path: result.path,
      code: null,
      detail: null,
    };
  } catch (error) {
    const normalized = normalizeThrown(error);
    return {
      ok: false,
      status: normalized.status,
      latencyMs: Date.now() - started,
      path: null,
      code: normalized.code,
      detail: normalized.detail,
    };
  }
}

export type OfficialDevice = {
  providerDeviceId: string;
  phoneNumber: string | null;
  displayName: string | null;
  status: string | null;
  raw: Record<string, unknown>;
};

export async function getOfficialDevices(): Promise<OfficialDevice[]> {
  const { rows } = await firstWorkingList(DEVICE_PATHS);
  const devices: OfficialDevice[] = [];
  for (const row of rows) {
    const id = pickString(row, "id", "device_id", "deviceId", "uuid", "sender_id", "phone_number_id");
    if (!id) continue;
    devices.push({
      providerDeviceId: id,
      phoneNumber: pickString(row, "phone", "phone_number", "phoneNumber", "number", "msisdn"),
      displayName: pickString(row, "name", "display_name", "displayName", "label", "verified_name"),
      status: pickString(row, "status", "state", "connection_status"),
      raw: row,
    });
  }
  return devices;
}

export type OfficialTemplate = {
  providerTemplateId: string;
  providerDeviceId: string | null;
  name: string;
  language: string | null;
  category: string | null;
  status: string | null;
  body: string | null;
  bodyVariableCount: number;
  buttonVariableCount: number;
  components: unknown;
  raw: Record<string, unknown>;
};

function templateBody(row: Record<string, unknown>): {
  body: string | null;
  bodyVars: number;
  buttonVars: number;
  components: unknown;
} {
  const components = row["components"] ?? row["component"] ?? [];
  let body = pickString(row, "body", "body_text", "text", "content");
  let buttonVars = 0;
  if (Array.isArray(components)) {
    for (const entry of components) {
      const component = asRecord(entry);
      if (!component) continue;
      const type = (pickString(component, "type", "component_type") ?? "").toUpperCase();
      if (type === "BODY" && !body) body = pickString(component, "text", "body");
      if (type === "BUTTONS" || type === "BUTTON") {
        const buttons = component["buttons"];
        const list = Array.isArray(buttons) ? buttons : [component];
        for (const buttonEntry of list) {
          const button = asRecord(buttonEntry);
          if (!button) continue;
          const url = pickString(button, "url", "link");
          buttonVars += countPlaceholders(url);
        }
      }
    }
  }
  return { body, bodyVars: countPlaceholders(body), buttonVars, components };
}

export async function getOfficialTemplates(): Promise<OfficialTemplate[]> {
  const { rows } = await firstWorkingList(TEMPLATE_PATHS);
  const templates: OfficialTemplate[] = [];
  for (const row of rows) {
    const id = pickString(row, "id", "template_id", "templateId", "uuid", "name");
    const name = pickString(row, "name", "template_name", "title") ?? id;
    if (!id || !name) continue;
    const parsed = templateBody(row);
    templates.push({
      providerTemplateId: id,
      providerDeviceId: pickString(row, "device_id", "deviceId", "sender_id", "phone_number_id"),
      name,
      language: pickString(row, "language", "lang", "language_code"),
      category: pickString(row, "category", "type"),
      status: pickString(row, "status", "state", "approval_status"),
      body: parsed.body,
      bodyVariableCount: parsed.bodyVars,
      buttonVariableCount: parsed.buttonVars,
      components: parsed.components,
      raw: row,
    });
  }
  return templates;
}

export type SendTemplateInput = {
  deviceId: string;
  templateId: string;
  templateName: string | null;
  language: string | null;
  /** رقم E.164 — يُرسل للمزوّد بلا علامة `+`. */
  phoneE164: string;
  bodyVariables: string[];
  buttonVariables: string[];
};

export type SendTemplateResult = {
  status: number;
  latencyMs: number;
  providerMessageId: string | null;
};

/** الإرسال الرسمي عبر `official/v1/send-message`. */
export async function sendTemplateMessage(input: SendTemplateInput): Promise<SendTemplateResult> {
  const body: Record<string, unknown> = {
    device_id: input.deviceId,
    template_id: input.templateId,
    phone: input.phoneE164.replace(/^\+/, ""),
    type: "template",
  };
  if (input.templateName) body["template_name"] = input.templateName;
  if (input.language) body["language"] = input.language;
  if (input.bodyVariables.length > 0) body["body_variables"] = input.bodyVariables;
  if (input.buttonVariables.length > 0) body["button_variables"] = input.buttonVariables;

  try {
    const response = await request(SEND_PATH, { method: "POST", body });
    const record = asRecord(response.json);
    const nested = record ? asRecord(record["data"]) : null;
    const messageId =
      (record ? pickString(record, "message_id", "messageId", "id", "reference") : null) ??
      (nested ? pickString(nested, "message_id", "messageId", "id", "reference") : null);

    // بعض المزوّدين يعيدون 200 مع فشل داخلي في الجسم.
    const okFlag = record?.["success"] ?? record?.["status"] ?? null;
    if (okFlag === false || okFlag === "error" || okFlag === "failed") {
      throw normalizeStatus(422, response.bodyText);
    }
    return { status: response.status, latencyMs: response.latencyMs, providerMessageId: messageId };
  } catch (error) {
    throw normalizeThrown(error);
  }
}

export { normalizeThrown as normalizeProviderError };