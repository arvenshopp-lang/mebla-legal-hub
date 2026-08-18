/**
 * MobileNetOtpConnector — موصل مدار التقنية (mobile.net.sa).
 * مزوّد رسائل نصية ورموز تحقق سعودي معتمد من هيئة الاتصالات والفضاء والتقنية.
 */
import {
  BaseOtpConnector,
  toHealthFailure,
  urlPolicy,
  type Capabilities,
  type ConnectorContext,
  type HealthResult,
  type ProviderMetadata,
  type SendOtpInput,
  type SendOtpResult,
  type ValidationResult,
} from "./base.server";
import { IntegrationHttpError, evaluateSuccess, integrationFetch, joinUrl } from "../http.server";

function baseUrl(context: ConnectorContext): string {
  return context.baseUrl || "https://api.mobile.net.sa";
}

/** مفتاح الربط يُقرأ من خزانة الأسرار فقط — لا قيم مضمّنة في الكود. */
function apiKey(context: ConnectorContext, required = true): string {
  const key = context.secrets["api_key"] ?? context.secrets["token"] ?? "";
  if (!key && required) {
    throw new IntegrationHttpError("MISSING_CREDENTIALS", "MobileNet API key missing");
  }
  return key;
}

/** توحيد رقم الجوال السعودي إلى الصيغة الدولية بدون رمز +. */
function normalizeSaudiPhone(raw: string): string {
  let phone = raw.replace(/[\s\-+]/g, "");
  if (phone.startsWith("00966")) phone = phone.slice(2);
  else if (phone.startsWith("05")) phone = `966${phone.slice(1)}`;
  else if (phone.startsWith("5") && phone.length === 9) phone = `966${phone}`;
  return phone;
}

export class MobileNetOtpConnector extends BaseOtpConnector {
  getProviderMetadata(): ProviderMetadata {
    return {
      providerKey: "mobilenet",
      displayName: "مدار التقنية (Mobile.net.sa)",
      adapterType: "mobilenet",
      logoKey: "mobilenet",
      websiteUrl: "https://mobile.net.sa",
      docsHint: "مفتاح الـ API واسم المرسل المعتمد من هيئة الاتصالات (CST) عبر لوحة تحكم mobile.net.sa.",
    };
  }

  getCapabilities(): Capabilities {
    return {
      sendOtp: true,
      verifyOtp: false,
      deliveryStatus: true,
      healthCheck: true,
      remoteVerification: false,
    };
  }

  validateConfig(context: ConnectorContext): ValidationResult {
    const errors: string[] = [];
    if (!apiKey(context, false)) {
      errors.push("مفتاح الربط (API Key) مطلوب لمزوّد مدار التقنية.");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const started = Date.now();
    try {
      const key = apiKey(context);
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(baseUrl(context), "/sms/balance"),
        headers: { Accept: "application/json", Authorization: `Bearer ${key}`, apiKey: key },
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
        retries: context.maxRetries,
      });

      // البوابة ترجع 401/404 عندما يكون المفتاح صحيحاً لكن المسار غير مفعّل للحساب.
      const verdict = evaluateSuccess(response, {
        successStatusCodes: [200],
        successJsonPath: null,
        expectedValue: null,
        expectJson: false,
      });
      if (!verdict.ok) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs: response.latencyMs,
          code: verdict.code,
          detail: verdict.detail,
        };
      }
      return {
        ok: true,
        statusCode: response.status,
        latencyMs: response.latencyMs,
        detail: "تم الاتصال ببوابة mobile.net.sa بنجاح.",
      };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    const key = apiKey(context);
    const sender =
      (context.configuration["sender_name"] as string | undefined) ||
      (context.configuration["sender_id"] as string | undefined) ||
      context.secrets["sender_id"] ||
      "MehlaLex";

    const response = await integrationFetch({
      method: "POST",
      url: joinUrl(baseUrl(context), "/sms/send"),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        apiKey: key,
      },
      body: JSON.stringify({
        apiKey: key,
        numbers: normalizeSaudiPhone(input.phone),
        sender,
        msg: input.text,
        message: input.text,
      }),
      timeoutMs: context.timeoutMs,
      policy: urlPolicy(context),
      retries: context.maxRetries,
    });

    const verdict = evaluateSuccess(response, {
      successStatusCodes: [200, 201],
      successJsonPath: null,
      expectedValue: null,
      expectJson: false,
    });
    if (!verdict.ok) throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);

    const payload = response.json as
      | { messageId?: string | number; msgId?: string | number; data?: { messageId?: string | number } }
      | null;
    const reference = payload?.messageId ?? payload?.msgId ?? payload?.data?.messageId ?? null;
    return {
      reference: reference != null ? String(reference) : null,
      latencyMs: response.latencyMs,
      remoteVerification: false,
    };
  }
}
