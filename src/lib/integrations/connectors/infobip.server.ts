/**
 * InfobipOtpConnector — موصل Infobip.
 * فحص الاتصال: GET /account/1/balance — يتحقق فعلياً من صحة المفتاح ورصيد الحساب.
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
import {
  IntegrationHttpError,
  buildAuthParts,
  evaluateSuccess,
  integrationFetch,
  joinUrl,
} from "../http.server";

async function authHeaders(context: ConnectorContext): Promise<Record<string, string>> {
  const { headers } = await buildAuthParts(
    {
      authType: context.authType,
      secrets: context.secrets,
      apiKeyHeaderName: "Authorization",
      apiKeyPrefix: "App",
    },
    urlPolicy(context),
    context.timeoutMs,
  );
  return { ...headers, Accept: "application/json" };
}

export class InfobipOtpConnector extends BaseOtpConnector {
  getProviderMetadata(): ProviderMetadata {
    return {
      providerKey: "infobip",
      displayName: "Infobip",
      adapterType: "infobip",
      logoKey: "infobip",
      websiteUrl: "https://www.infobip.com",
      docsHint: "المفتاح من Infobip Portal ← Developer Tools ← API Keys.",
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
    if (!context.baseUrl) errors.push("رابط الخدمة (Base URL) مطلوب.");
    if (!context.secrets["api_key"]) errors.push("مفتاح API مطلوب لهذا المزوّد.");
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const started = Date.now();
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(context.baseUrl, "/account/1/balance"),
        headers: await authHeaders(context),
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
        retries: context.maxRetries,
      });
      const verdict = evaluateSuccess(response, {
        successStatusCodes: [200],
        successJsonPath: "currency",
        expectedValue: null,
        expectJson: true,
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
        detail: "تم التحقق من المفتاح ورصيد الحساب.",
      };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    const sender =
      context.secrets["sender_id"] ??
      (context.configuration["sender_id"] as string | undefined) ??
      "MEHLA";
    const response = await integrationFetch({
      method: "POST",
      url: joinUrl(context.baseUrl, "/sms/2/text/advanced"),
      headers: { ...(await authHeaders(context)), "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ from: sender, destinations: [{ to: input.phone }], text: input.text }],
      }),
      timeoutMs: context.timeoutMs,
      policy: urlPolicy(context),
      retries: context.maxRetries,
    });
    const verdict = evaluateSuccess(response, {
      successStatusCodes: [200, 201],
      successJsonPath: "messages.0.messageId",
      expectedValue: null,
      expectJson: true,
    });
    if (!verdict.ok) throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);
    const payload = response.json as { messages?: { messageId?: string }[] } | null;
    return {
      reference: payload?.messages?.[0]?.messageId ?? null,
      latencyMs: response.latencyMs,
      remoteVerification: false,
    };
  }

  override async getDeliveryStatus(
    context: ConnectorContext,
    input: { referenceId: string },
  ): Promise<{ status: string; raw?: string | null }> {
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(context.baseUrl, "/sms/1/reports", { messageId: input.referenceId }),
        headers: await authHeaders(context),
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
      });
      const payload = response.json as { results?: { status?: { groupName?: string } }[] } | null;
      return { status: payload?.results?.[0]?.status?.groupName?.toLowerCase() ?? "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
}
