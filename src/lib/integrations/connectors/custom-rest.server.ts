/**
 * CustomRestOtpConnector — موصل REST مخصص يُهيّئه المالك بالكامل.
 *
 * كل شيء قابل للتحديد: الطريقة والمسار والترويسات والمعاملات وقالب المحتوى
 * وشروط النجاح ومسارات الاستخراج. لا يوجد أي افتراض عن معايير المزوّد،
 * ولا يُسمح بأي JavaScript أو eval — فقط استبدال متغيّرات آمنة محدّدة.
 */
import {
  BaseOtpConnector,
  toHealthFailure,
  urlPolicy,
  type Capabilities,
  type ConnectorContext,
  type DeliveryStatusResult,
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
  pairsToRecord,
  readJsonPath,
  renderTemplate,
  type IntegrationResponse,
} from "../http.server";
import type { OperationSpec, TemplateVariable } from "../integrations.shared";

type Values = Partial<Record<TemplateVariable, string | null>>;

async function runOperation(
  context: ConnectorContext,
  operation: OperationSpec,
  values: Values,
): Promise<IntegrationResponse> {
  const auth = await buildAuthParts(
    {
      authType: context.authType,
      secrets: context.secrets,
      apiKeyHeaderName: (context.configuration["api_key_header_name"] as string | undefined) ?? null,
      apiKeyPrefix: (context.configuration["api_key_prefix"] as string | undefined) ?? null,
      apiKeyQueryName: (context.configuration["api_key_query_name"] as string | undefined) ?? null,
      tokenUrl: (context.configuration["token_url"] as string | undefined) ?? null,
      scope: (context.configuration["oauth_scope"] as string | undefined) ?? null,
    },
    urlPolicy(context),
    context.timeoutMs,
  );

  const body = operation.bodyTemplate ? renderTemplate(operation.bodyTemplate, values) : null;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...pairsToRecord(operation.headers, values),
    ...auth.headers,
  };
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  return integrationFetch({
    method: operation.method,
    url: joinUrl(context.baseUrl, operation.path, { ...pairsToRecord(operation.query, values), ...auth.query }),
    headers,
    body,
    timeoutMs: context.timeoutMs,
    policy: urlPolicy(context),
    retries: context.maxRetries,
  });
}

export class CustomRestOtpConnector extends BaseOtpConnector {
  getProviderMetadata(): ProviderMetadata {
    return {
      providerKey: "custom_rest",
      displayName: "Custom REST API",
      adapterType: "custom_rest",
      logoKey: null,
      websiteUrl: null,
      docsHint: "حدّد المسارات وشروط النجاح والخرائط بنفسك — لا توجد أي افتراضات.",
    };
  }

  getCapabilities(context: ConnectorContext): Capabilities {
    return {
      sendOtp: Boolean(context.mapping?.send?.enabled),
      verifyOtp: Boolean(context.mapping?.verify?.enabled),
      deliveryStatus: Boolean(context.mapping?.status?.enabled),
      healthCheck: Boolean(context.healthCheck?.path),
      remoteVerification: Boolean(context.mapping?.verify?.enabled),
    };
  }

  validateConfig(context: ConnectorContext): ValidationResult {
    const errors: string[] = [];
    if (!context.baseUrl) errors.push("رابط الخدمة (Base URL) مطلوب.");
    if (!context.healthCheck?.path) errors.push("مسار فحص الاتصال مطلوب للموصل المخصص.");
    if ((context.healthCheck?.successStatusCodes ?? []).length === 0) {
      errors.push("حدّد رمز حالة نجاح واحداً على الأقل.");
    }
    if (!context.mapping?.send?.enabled) {
      errors.push("خريطة إرسال الرمز مطلوبة لتشغيل الخدمة.");
    } else if (!context.mapping.send.path) {
      errors.push("مسار إرسال الرمز مطلوب.");
    }
    if (context.authType === "oauth2_client_credentials" && !context.configuration["token_url"]) {
      errors.push("رابط إصدار الرمز (Token URL) مطلوب لمصادقة OAuth 2.0.");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async testConnection(context: ConnectorContext, traceId: string): Promise<HealthResult> {
    const started = Date.now();
    const spec = context.healthCheck;
    try {
      const response = await runOperation(
        context,
        {
          enabled: true,
          method: spec.method,
          path: spec.path,
          headers: spec.headers,
          query: spec.query,
          bodyTemplate: spec.body,
          successStatusCodes: spec.successStatusCodes,
          successJsonPath: spec.successJsonPath,
          expectedValue: spec.expectedValue,
          resultJsonPath: null,
        },
        { trace_id: traceId, sender_id: context.secrets["sender_id"] ?? null },
      );
      const verdict = evaluateSuccess(response, {
        successStatusCodes: spec.successStatusCodes,
        successJsonPath: spec.successJsonPath,
        expectedValue: spec.expectedValue,
        expectJson: spec.expectJson,
      });
      if (!verdict.ok) {
        return { ok: false, statusCode: response.status, latencyMs: response.latencyMs, code: verdict.code, detail: verdict.detail };
      }
      return {
        ok: true,
        statusCode: response.status,
        latencyMs: response.latencyMs,
        detail: "الاستجابة طابقت شرط النجاح المحدد.",
      };
    } catch (error) {
      return toHealthFailure(error, Date.now() - started);
    }
  }

  async sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    const operation = context.mapping?.send;
    if (!operation?.enabled) throw new IntegrationHttpError("NOT_SUPPORTED", "send mapping disabled");
    const values: Values = {
      phone: input.phone,
      code: input.code,
      purpose: input.purpose,
      sender_id: context.secrets["sender_id"] ?? null,
      trace_id: input.traceId,
      reference_id: null,
    };
    const response = await runOperation(context, operation, values);
    const verdict = evaluateSuccess(response, {
      successStatusCodes: operation.successStatusCodes,
      successJsonPath: operation.successJsonPath,
      expectedValue: operation.expectedValue,
      expectJson: true,
    });
    if (!verdict.ok) throw new IntegrationHttpError(verdict.code, verdict.detail, response.status);
    const reference = operation.resultJsonPath
      ? readJsonPath(response.json, operation.resultJsonPath)
      : null;
    return {
      reference: reference == null ? null : String(reference).slice(0, 120),
      latencyMs: response.latencyMs,
      remoteVerification: Boolean(context.mapping?.verify?.enabled),
    };
  }

  override async verifyOtp(
    context: ConnectorContext,
    input: { phone: string; code: string; referenceId: string | null; traceId: string },
  ): Promise<VerifyOtpResult> {
    const operation = context.mapping?.verify;
    if (!operation?.enabled) return { verified: false, latencyMs: 0, detail: "NOT_SUPPORTED" };
    const response = await runOperation(context, operation, {
      phone: input.phone,
      code: input.code,
      reference_id: input.referenceId,
      trace_id: input.traceId,
      sender_id: context.secrets["sender_id"] ?? null,
    });
    const verdict = evaluateSuccess(response, {
      successStatusCodes: operation.successStatusCodes,
      successJsonPath: operation.successJsonPath,
      expectedValue: operation.expectedValue,
      expectJson: true,
    });
    return { verified: verdict.ok, latencyMs: response.latencyMs, detail: verdict.ok ? undefined : verdict.code };
  }

  override async getDeliveryStatus(
    context: ConnectorContext,
    input: { referenceId: string; phone: string; traceId: string },
  ): Promise<DeliveryStatusResult> {
    const operation = context.mapping?.status;
    if (!operation?.enabled) return { status: "unknown" };
    try {
      const response = await runOperation(context, operation, {
        phone: input.phone,
        reference_id: input.referenceId,
        trace_id: input.traceId,
      });
      const value = operation.resultJsonPath ? readJsonPath(response.json, operation.resultJsonPath) : null;
      return { status: value == null ? "unknown" : String(value).toLowerCase().slice(0, 40) };
    } catch {
      return { status: "unknown" };
    }
  }
}