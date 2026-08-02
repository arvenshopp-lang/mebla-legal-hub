/**
 * UnifonicOtpConnector — موصل Unifonic.
 * فحص الاتصال: GET /rest/Account/GetBalance ويتحقق من success = true.
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

function appSid(context: ConnectorContext): string {
  const sid =
    context.secrets["application_id"] ??
    context.secrets["api_key"] ??
    (context.configuration["application_id"] as string | undefined);
  if (!sid) throw new IntegrationHttpError("MISSING_CREDENTIALS", "AppSid missing");
  return sid;
}

export class UnifonicOtpConnector extends BaseOtpConnector {
  getProviderMetadata(): ProviderMetadata {
    return {
      providerKey: "unifonic",
      displayName: "Unifonic",
      adapterType: "unifonic",
      logoKey: "unifonic",
      websiteUrl: "https://www.unifonic.com",
      docsHint: "AppSid من Unifonic Console ← Applications.",
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
    if (!context.secrets["application_id"] && !context.secrets["api_key"]) {
      errors.push("معرّف التطبيق (AppSid) مطلوب لهذا المزوّد.");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const started = Date.now();
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(context.baseUrl, "/rest/Account/GetBalance", { AppSid: appSid(context) }),
        headers: { Accept: "application/json" },
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
        retries: context.maxRetries,
      });
      const verdict = evaluateSuccess(response, {
        successStatusCodes: [200],
        successJsonPath: "success",
        expectedValue: "true",
        expectJson: true,
      });
      if (!verdict.ok) {
        return { ok: false, statusCode: response.status, latencyMs: response.latencyMs, code: verdict.code, detail: verdict.detail };
      }
      return { ok: true, statusCode: response.status, latencyMs: response.latencyMs, detail: "معرّف التطبيق صحيح والحساب فعّال." };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    const params = new URLSearchParams({
      AppSid: appSid(context),
      Recipient: input.phone.replace("+", ""),
      Body: input.text,
    });
    const sender = context.secrets["sender_id"];
    if (sender) params.set("SenderID", sender);
    const response = await integrationFetch({
      method: "POST",
      url: joinUrl(context.baseUrl, "/rest/SMS/messages"),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
      timeoutMs: context.timeoutMs,
      policy: urlPolicy(context),
      retries: context.maxRetries,
    });
    const verdict = evaluateSuccess(response, {
      successStatusCodes: [200],
      successJsonPath: "success",
      expectedValue: "true",
      expectJson: true,
    });
    if (!verdict.ok) throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);
    const payload = response.json as { data?: { MessageID?: string | number } } | null;
    const reference = payload?.data?.MessageID;
    return {
      reference: reference != null ? String(reference) : null,
      latencyMs: response.latencyMs,
      remoteVerification: false,
    };
  }

  override async getDeliveryStatus(
    context: ConnectorContext,
    input: { referenceId: string },
  ): Promise<{ status: string }> {
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(context.baseUrl, "/rest/SMS/messages/GetMessageIDStatus", {
          AppSid: appSid(context),
          MessageID: input.referenceId,
        }),
        headers: { Accept: "application/json" },
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
      });
      const payload = response.json as { data?: { Status?: string } } | null;
      return { status: payload?.data?.Status?.toLowerCase() ?? "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
}