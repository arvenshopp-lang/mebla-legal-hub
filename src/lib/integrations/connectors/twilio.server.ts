/**
 * TwilioVerifyConnector — موصل Twilio.
 *
 * فحص الاتصال: GET /2010-04-01/Accounts/{AccountSid}.json ويتحقق من status = active.
 * إذا هُيّئ Service SID فالتحقق يجري عند Twilio Verify (remoteVerification = true)،
 * وإلا تُرسل الرسالة عبر Messages ويجري التحقق محلياً في محرك المنصة.
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
  type VerifyOtpResult,
} from "./base.server";
import {
  IntegrationHttpError,
  buildAuthParts,
  evaluateSuccess,
  integrationFetch,
  joinUrl,
} from "../http.server";

const VERIFY_BASE = "https://verify.twilio.com";

function accountSid(context: ConnectorContext): string {
  const sid = context.secrets["account_sid"] ?? context.secrets["username"];
  if (!sid) throw new IntegrationHttpError("MISSING_CREDENTIALS", "account_sid missing");
  return sid;
}

function serviceSid(context: ConnectorContext): string | null {
  return (
    context.secrets["service_sid"] ??
    (context.configuration["service_sid"] as string | undefined) ??
    null
  );
}

async function authHeaders(context: ConnectorContext): Promise<Record<string, string>> {
  const { headers } = await buildAuthParts(
    { authType: context.authType, secrets: context.secrets },
    urlPolicy(context),
    context.timeoutMs,
  );
  return { ...headers, Accept: "application/json" };
}

export class TwilioVerifyConnector extends BaseOtpConnector {
  getProviderMetadata(): ProviderMetadata {
    return {
      providerKey: "twilio",
      displayName: "Twilio Verify",
      adapterType: "twilio",
      logoKey: "twilio",
      websiteUrl: "https://www.twilio.com",
      docsHint: "Account SID + API Key Secret من Twilio Console، وService SID من Verify Services.",
    };
  }

  getCapabilities(context: ConnectorContext): Capabilities {
    const remote = Boolean(serviceSid(context));
    return {
      sendOtp: true,
      verifyOtp: remote,
      deliveryStatus: true,
      healthCheck: true,
      remoteVerification: remote,
    };
  }

  validateConfig(context: ConnectorContext): ValidationResult {
    const errors: string[] = [];
    if (!context.baseUrl) errors.push("رابط الخدمة (Base URL) مطلوب.");
    if (!context.secrets["account_sid"] && !context.secrets["username"])
      errors.push("Account SID مطلوب.");
    if (!context.secrets["api_secret"] && !context.secrets["password"])
      errors.push("API Secret مطلوب.");
    if (!serviceSid(context) && !context.secrets["sender_id"]) {
      errors.push("يلزم تحديد Service SID (Verify) أو اسم/رقم المُرسل.");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    const started = Date.now();
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(context.baseUrl, `/2010-04-01/Accounts/${accountSid(context)}.json`),
        headers: await authHeaders(context),
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
        retries: context.maxRetries,
      });
      const verdict = evaluateSuccess(response, {
        successStatusCodes: [200],
        successJsonPath: "status",
        expectedValue: "active",
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
        detail: "الحساب نشط وبيانات الربط صحيحة.",
      };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    const service = serviceSid(context);
    const headers = {
      ...(await authHeaders(context)),
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (service) {
      const params = new URLSearchParams({ To: input.phone, Channel: "sms" });
      const response = await integrationFetch({
        method: "POST",
        url: joinUrl(VERIFY_BASE, `/v2/Services/${service}/Verifications`),
        headers,
        body: params.toString(),
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
        retries: context.maxRetries,
      });
      const verdict = evaluateSuccess(response, {
        successStatusCodes: [200, 201],
        successJsonPath: "sid",
        expectedValue: null,
        expectJson: true,
      });
      if (!verdict.ok)
        throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);
      const payload = response.json as { sid?: string } | null;
      return {
        reference: payload?.sid ?? null,
        latencyMs: response.latencyMs,
        remoteVerification: true,
      };
    }

    const params = new URLSearchParams({ To: input.phone, Body: input.text });
    const sender = context.secrets["sender_id"];
    if (sender) params.set("From", sender);
    const response = await integrationFetch({
      method: "POST",
      url: joinUrl(context.baseUrl, `/2010-04-01/Accounts/${accountSid(context)}/Messages.json`),
      headers,
      body: params.toString(),
      timeoutMs: context.timeoutMs,
      policy: urlPolicy(context),
      retries: context.maxRetries,
    });
    const verdict = evaluateSuccess(response, {
      successStatusCodes: [200, 201],
      successJsonPath: "sid",
      expectedValue: null,
      expectJson: true,
    });
    if (!verdict.ok) throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);
    const payload = response.json as { sid?: string } | null;
    return {
      reference: payload?.sid ?? null,
      latencyMs: response.latencyMs,
      remoteVerification: false,
    };
  }

  override async verifyOtp(
    context: ConnectorContext,
    input: { phone: string; code: string },
  ): Promise<VerifyOtpResult> {
    const service = serviceSid(context);
    if (!service) return { verified: false, latencyMs: 0, detail: "NOT_SUPPORTED" };
    const params = new URLSearchParams({ To: input.phone, Code: input.code });
    const response = await integrationFetch({
      method: "POST",
      url: joinUrl(VERIFY_BASE, `/v2/Services/${service}/VerificationCheck`),
      headers: {
        ...(await authHeaders(context)),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      timeoutMs: context.timeoutMs,
      policy: urlPolicy(context),
    });
    const payload = response.json as { status?: string; valid?: boolean } | null;
    return {
      verified:
        response.status < 400 && (payload?.valid === true || payload?.status === "approved"),
      latencyMs: response.latencyMs,
    };
  }

  override async getDeliveryStatus(
    context: ConnectorContext,
    input: { referenceId: string },
  ): Promise<{ status: string }> {
    try {
      const response = await integrationFetch({
        method: "GET",
        url: joinUrl(
          context.baseUrl,
          `/2010-04-01/Accounts/${accountSid(context)}/Messages/${input.referenceId}.json`,
        ),
        headers: await authHeaders(context),
        timeoutMs: context.timeoutMs,
        policy: urlPolicy(context),
      });
      const payload = response.json as { status?: string } | null;
      return { status: payload?.status ?? "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
}
