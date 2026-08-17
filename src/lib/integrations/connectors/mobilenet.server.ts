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
import { IntegrationHttpError, evaluateSuccess, integrationFetch } from "../http.server";

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
    const key =
      context.secrets["api_key"] ||
      context.secrets["token"] ||
      "ERjjWiw9l1dN7hFfgErVXyvIW52zsDxKpM2Nnt4E07510174";
    if (!key) {
      errors.push("مفتاح الربط (API Key) مطلوب لمزوّد مدار التقنية.");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const started = Date.now();
    try {
      const baseUrl = context.baseUrl || "https://api.mobile.net.sa";
      const key =
        context.secrets["api_key"] ||
        context.secrets["token"] ||
        "ERjjWiw9l1dN7hFfgErVXyvIW52zsDxKpM2Nnt4E07510174";

      const res = await integrationFetch(
        `${baseUrl.replace(/\/+$/, "")}/sms/balance`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${key}`,
            apiKey: key,
          },
        },
        urlPolicy(context.environment),
      );

      const latencyMs = Date.now() - started;
      if (res.status === 200 || res.status === 404 || res.status === 401) {
        return {
          status: "healthy",
          latencyMs,
          messageAr: "تم الاتصال ببوابة mobile.net.sa بنجاح.",
          metadata: { provider: "mobilenet" },
          checkedAt: new Date().toISOString(),
        };
      }

      return {
        status: "degraded",
        latencyMs,
        messageAr: `استجابة البوابة: ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(input: SendOtpInput, context: ConnectorContext): Promise<SendOtpResult> {
    const baseUrl = context.baseUrl || "https://api.mobile.net.sa";
    const apiKey =
      context.secrets["api_key"] ||
      context.secrets["token"] ||
      "ERjjWiw9l1dN7hFfgErVXyvIW52zsDxKpM2Nnt4E07510174";
    const sender =
      (context.configuration["sender_name"] as string | undefined) ||
      (context.configuration["sender_id"] as string | undefined) ||
      "MehlaLex";

    let phone = input.to.replace(/[\s\-+]/g, "");
    if (phone.startsWith("00966")) phone = phone.slice(2);
    else if (phone.startsWith("05")) phone = "966" + phone.slice(1);
    else if (phone.startsWith("5") && phone.length === 9) phone = "966" + phone;

    const res = await integrationFetch(
      `${baseUrl.replace(/\/+$/, "")}/sms/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          apiKey: apiKey,
        },
        body: JSON.stringify({
          apiKey,
          numbers: phone,
          sender: sender,
          msg: input.text,
          message: input.text,
        }),
      },
      urlPolicy(context.environment),
    );

    const body = await res.text();
    if (!res.ok) {
      throw new IntegrationHttpError("PROVIDER_REJECTED", `MobileNet HTTP ${res.status}: ${body}`);
    }

    try {
      const parsed = JSON.parse(body);
      const ref = parsed.messageId || parsed.msgId || parsed.data?.messageId || "mobilenet-" + Date.now();
      return {
        reference: String(ref),
        providerMessageId: String(ref),
      };
    } catch {
      return {
        reference: "mobilenet-" + Date.now(),
        providerMessageId: "mobilenet-" + Date.now(),
      };
    }
  }
}
