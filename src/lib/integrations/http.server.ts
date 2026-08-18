/**
 * طبقة الاتصال الخارجي للتكاملات — خادم فقط.
 *
 * تفرض على كل طلب: فحص SSRF قبل الاتصال، منع اتباع إعادة التوجيه تلقائياً،
 * مدة انتظار قصوى، حد أقصى لحجم الاستجابة، وتقييم شرط نجاح صريح.
 * لا تُسجَّل أي ترويسة مصادقة ولا أي قيمة سرّية في أي مخرج من هذه الطبقة.
 */
import {
  isCustomHeaderField,
  customHeaderName,
  type AuthType,
  type HttpMethod,
  type TemplateVariable,
} from "./integrations.shared";
import { SsrfBlockedError, assertUrlAllowed, resolveSafeUrl, type UrlPolicy } from "./ssrf.server";

export const MAX_RESPONSE_BYTES = 64 * 1024;

export class IntegrationHttpError extends Error {
  code: string;
  status: number | null;
  /** تفصيل تقني للإدارة فقط — لا يحتوي أي سر ولا ترويسات الطلب. */
  detail: string;
  constructor(code: string, detail = "", status: number | null = null) {
    super(`${code}: ${detail}`.slice(0, 500));
    this.code = code;
    this.status = status;
    this.detail = detail.slice(0, 500);
  }
}

export type IntegrationResponse = {
  status: number;
  latencyMs: number;
  bodyText: string;
  json: unknown | null;
  contentType: string;
  truncated: boolean;
};

function looksLikeHtml(body: string, contentType: string): boolean {
  if (contentType.includes("text/html")) return true;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<body");
}

async function readLimited(response: Response): Promise<{ text: string; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES)
    throw new IntegrationHttpError("RESPONSE_TOO_LARGE", `${declared} bytes`);
  const body = response.body;
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      truncated = true;
      chunks.push(value.slice(0, Math.max(0, MAX_RESPONSE_BYTES - (total - value.byteLength))));
      try {
        await reader.cancel();
      } catch {
        /* تم إغلاق التدفق */
      }
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), truncated };
}

export type IntegrationRequest = {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  /** نص أو حمولة ثنائية (رفع ملفات إلى مزودي التخزين). */
  body?: string | Uint8Array | null;
  timeoutMs: number;
  policy: UrlPolicy;
  /** عدد إعادة المحاولة عند أخطاء الشبكة أو 5xx فقط. */
  retries?: number;
};

/** طلب واحد محمي: SSRF + مدة انتظار + منع إعادة التوجيه + حد الحجم. */
export async function integrationFetch(request: IntegrationRequest): Promise<IntegrationResponse> {
  const url = await resolveSafeUrl(request.url, request.policy);
  const attempts = Math.max(0, Math.min(request.retries ?? 0, 5)) + 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : (request.body ?? undefined),
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1000, Math.min(request.timeoutMs, 30_000))),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location") ?? "";
        // إعادة التوجيه لا تُتّبع تلقائياً؛ ويُرفض أي هدف محظور صراحةً.
        if (location) {
          try {
            assertUrlAllowed(new URL(location, url).toString(), request.policy);
          } catch (error) {
            throw new SsrfBlockedError(
              error instanceof SsrfBlockedError ? error.reason : "إعادة توجيه إلى عنوان محظور.",
            );
          }
        }
        throw new IntegrationHttpError(
          "UNEXPECTED_REDIRECT",
          `status ${response.status}`,
          response.status,
        );
      }

      const { text, truncated } = await readLimited(response);
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      let json: unknown | null = null;
      if (text.trim() && !looksLikeHtml(text, contentType)) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      return {
        status: response.status,
        latencyMs: Date.now() - started,
        bodyText: text,
        json,
        contentType,
        truncated,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof SsrfBlockedError) throw error;
      if (error instanceof IntegrationHttpError && error.code !== "RESPONSE_TOO_LARGE") throw error;
      const isTimeout = error instanceof Error && /timed? ?out|abort/i.test(error.message);
      if (attempt === attempts) {
        if (error instanceof IntegrationHttpError) throw error;
        throw new IntegrationHttpError(
          isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
          error instanceof Error ? error.message.slice(0, 200) : "unknown",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw new IntegrationHttpError(
    "NETWORK_ERROR",
    lastError instanceof Error ? lastError.message.slice(0, 200) : "unknown",
  );
}

/* ------------------------------------------------------------- المصادقة */

export type AuthMaterial = {
  authType: AuthType;
  secrets: Record<string, string>;
  /** اسم ترويسة المفتاح أو معامل الرابط عند الحاجة. */
  apiKeyHeaderName?: string | null;
  apiKeyQueryName?: string | null;
  apiKeyPrefix?: string | null;
  tokenUrl?: string | null;
  scope?: string | null;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** رمز OAuth 2.0 Client Credentials مع تخزين مؤقت حتى قبل انتهائه بدقيقة. */
async function clientCredentialsToken(
  material: AuthMaterial,
  policy: UrlPolicy,
  timeoutMs: number,
): Promise<string> {
  const clientId = material.secrets["client_id"];
  const clientSecret = material.secrets["client_secret"];
  const tokenUrl = material.tokenUrl;
  if (!clientId || !clientSecret || !tokenUrl) {
    throw new IntegrationHttpError(
      "MISSING_CREDENTIALS",
      "client credentials or token url missing",
    );
  }
  const cacheKey = `${tokenUrl}|${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const params = new URLSearchParams({ grant_type: "client_credentials" });
  if (material.scope) params.set("scope", material.scope);
  const response = await integrationFetch({
    method: "POST",
    url: tokenUrl,
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
    timeoutMs,
    policy,
  });
  const payload = response.json as { access_token?: string; expires_in?: number } | null;
  if (response.status >= 400 || !payload?.access_token) {
    throw new IntegrationHttpError(
      "INVALID_CREDENTIALS",
      `token endpoint status ${response.status}`,
      response.status,
    );
  }
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

/** يبني ترويسات ومعاملات المصادقة من الأسرار المفكوكة على الخادم. */
export async function buildAuthParts(
  material: AuthMaterial,
  policy: UrlPolicy,
  timeoutMs: number,
): Promise<{ headers: Record<string, string>; query: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const query: Record<string, string> = {};
  const secrets = material.secrets;

  // ترويسات مخصصة تُطبَّق دائماً مهما كانت طريقة المصادقة الأساسية.
  for (const [key, value] of Object.entries(secrets)) {
    if (isCustomHeaderField(key) && value) headers[customHeaderName(key)] = value;
  }

  switch (material.authType) {
    case "api_key_header": {
      const key = secrets["api_key"];
      if (!key) throw new IntegrationHttpError("MISSING_CREDENTIALS", "api_key missing");
      const name = material.apiKeyHeaderName?.trim() || "Authorization";
      const prefix = material.apiKeyPrefix?.trim();
      headers[name] = prefix ? `${prefix} ${key}` : key;
      break;
    }
    case "bearer_token": {
      const token = secrets["access_token"] ?? secrets["api_key"];
      if (!token) throw new IntegrationHttpError("MISSING_CREDENTIALS", "access_token missing");
      headers["Authorization"] = `Bearer ${token}`;
      break;
    }
    case "basic_auth": {
      const user = secrets["username"] ?? secrets["account_sid"] ?? secrets["api_key"];
      const pass = secrets["password"] ?? secrets["api_secret"];
      if (!user || !pass)
        throw new IntegrationHttpError("MISSING_CREDENTIALS", "basic auth pair missing");
      headers["Authorization"] = `Basic ${btoa(`${user}:${pass}`)}`;
      break;
    }
    case "oauth2_client_credentials": {
      headers["Authorization"] =
        `Bearer ${await clientCredentialsToken(material, policy, timeoutMs)}`;
      break;
    }
    case "query_api_key": {
      const key = secrets["api_key"] ?? secrets["application_id"];
      if (!key) throw new IntegrationHttpError("MISSING_CREDENTIALS", "api_key missing");
      query[material.apiKeyQueryName?.trim() || "apiKey"] = key;
      break;
    }
    case "custom_headers": {
      if (Object.keys(headers).length === 0) {
        throw new IntegrationHttpError("MISSING_CREDENTIALS", "no custom headers configured");
      }
      break;
    }
  }
  return { headers, query };
}

/* --------------------------------------------------------- تقييم الاستجابة */

/** قراءة قيمة من JSON بمسار نقطي آمن (بلا eval): مثال account.status أو items.0.id */
export function readJsonPath(source: unknown, path: string): unknown {
  if (!path.trim()) return undefined;
  let current: unknown = source;
  for (const rawSegment of path.split(".")) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const BODY_ERROR_KEYS = ["error", "errors", "errorCode", "error_code", "error_message", "fault"];

export type SuccessCondition = {
  successStatusCodes: number[];
  successJsonPath: string | null;
  expectedValue: string | null;
  expectJson: boolean;
};

/**
 * شرط النجاح الصريح. الفشل يحدث عند:
 *  - رمز حالة غير مدرج في قائمة النجاح
 *  - استجابة HTML بينما المتوقع JSON (صفحة تسجيل دخول أو خطأ خادم)
 *  - JSON غير صالح بينما المتوقع JSON
 *  - 200 مع رسالة خطأ داخل المحتوى
 *  - عدم مطابقة مسار/قيمة النجاح المحددة
 */
export function evaluateSuccess(
  response: IntegrationResponse,
  condition: SuccessCondition,
): { ok: true } | { ok: false; code: string; detail: string } {
  const allowed = condition.successStatusCodes.length > 0 ? condition.successStatusCodes : [200];
  if (!allowed.includes(response.status)) {
    const code =
      response.status === 401
        ? "INVALID_CREDENTIALS"
        : response.status === 403
          ? "FORBIDDEN"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 429
              ? "RATE_LIMITED"
              : "PROVIDER_ERROR";
    return {
      ok: false,
      code,
      detail: `HTTP ${response.status} — ${response.bodyText.slice(0, 200)}`,
    };
  }

  if (condition.expectJson) {
    if (looksLikeHtml(response.bodyText, response.contentType)) {
      return {
        ok: false,
        code: "UNEXPECTED_HTML",
        detail: `content-type ${response.contentType || "غير محدد"}`,
      };
    }
    if (response.json === null) {
      return {
        ok: false,
        code: "INVALID_JSON",
        detail: response.bodyText.slice(0, 200) || "استجابة فارغة",
      };
    }
  }

  if (condition.successJsonPath) {
    const value = readJsonPath(response.json, condition.successJsonPath);
    if (value === undefined || value === null) {
      return {
        ok: false,
        code: "CONDITION_NOT_MET",
        detail: `المسار ${condition.successJsonPath} غير موجود`,
      };
    }
    if (condition.expectedValue != null && condition.expectedValue !== "") {
      if (String(value).trim().toLowerCase() !== condition.expectedValue.trim().toLowerCase()) {
        return {
          ok: false,
          code: "CONDITION_NOT_MET",
          detail: `القيمة عند ${condition.successJsonPath} = ${String(value).slice(0, 80)}`,
        };
      }
    }
    return { ok: true };
  }

  // 200 مع خطأ داخل المحتوى — يُعتبر فشلاً حتى دون مسار نجاح محدد.
  if (response.json && typeof response.json === "object" && !Array.isArray(response.json)) {
    const record = response.json as Record<string, unknown>;
    if (record["success"] === false || record["ok"] === false || record["status"] === "error") {
      return { ok: false, code: "BODY_ERROR", detail: response.bodyText.slice(0, 200) };
    }
    for (const key of BODY_ERROR_KEYS) {
      const value = record[key];
      if (value == null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === "object" || typeof value === "string" || typeof value === "number") {
        return { ok: false, code: "BODY_ERROR", detail: response.bodyText.slice(0, 200) };
      }
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------ القوالب */

/** استبدال المتغيرات الآمنة فقط — لا JavaScript ولا eval ولا تعبيرات. */
export function renderTemplate(
  template: string,
  values: Partial<Record<TemplateVariable, string | null>>,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => {
    const value = (values as Record<string, string | null | undefined>)[name];
    return value == null ? "" : String(value);
  });
}

export function joinUrl(baseUrl: string, path: string, query: Record<string, string> = {}): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.trim() ? (path.startsWith("/") ? path : `/${path}`) : "";
  const url = new URL(`${base}${suffix}`);
  for (const [name, value] of Object.entries(query)) {
    if (value != null && value !== "") url.searchParams.set(name, value);
  }
  return url.toString();
}

export function pairsToRecord(
  pairs: { name: string; value: string }[] | undefined,
  values: Partial<Record<TemplateVariable, string | null>> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    if (!pair?.name?.trim()) continue;
    out[pair.name.trim()] = renderTemplate(pair.value ?? "", values);
  }
  return out;
}
