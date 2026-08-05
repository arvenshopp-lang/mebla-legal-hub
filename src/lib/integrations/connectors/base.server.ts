/**
 * عقد الموصلات الموحّد — خادم فقط.
 *
 * كل مزوّد يُنفّذ نفس الواجهة، فيمكن تبديل المزوّد من لوحة الإدارة دون تعديل أي
 * كود في المنصة. الصفحات الوظيفية (التسجيل، الإعدادات) لا تعرف اسم المزوّد ولا
 * تستورد أي موصل — تتعامل مع OtpService فقط.
 */
import type {
  AdapterType,
  AuthType,
  CustomMapping,
  HealthCheckSpec,
  IntegrationEnvironment,
} from "../integrations.shared";
import type { UrlPolicy } from "../ssrf.server";

/** سياق التشغيل الكامل لموصل واحد — يُبنى على الخادم فقط. */
export type ConnectorContext = {
  integrationId: string;
  providerKey: string;
  adapterType: AdapterType;
  displayName: string;
  environment: IntegrationEnvironment;
  baseUrl: string;
  authType: AuthType;
  timeoutMs: number;
  maxRetries: number;
  /** قيم مفكوكة من خزنة الأسرار — لا تُعاد أبداً للمتصفح. */
  secrets: Record<string, string>;
  configuration: Record<string, unknown>;
  healthCheck: HealthCheckSpec;
  mapping: CustomMapping;
  allowedHosts: string[];
};

export function urlPolicy(context: ConnectorContext): UrlPolicy {
  return { environment: context.environment, allowedHosts: context.allowedHosts };
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export type HealthResult =
  | { ok: true; statusCode: number; latencyMs: number; detail?: string }
  | { ok: false; statusCode: number | null; latencyMs: number; code: string; detail: string };

export type ProviderMetadata = {
  providerKey: string;
  displayName: string;
  adapterType: AdapterType;
  /** مسار شعار محلي موثوق داخل المشروع (لا يُجلب من الخارج). */
  logoKey: string | null;
  websiteUrl: string | null;
  docsHint: string | null;
};

export type Capabilities = {
  sendOtp: boolean;
  verifyOtp: boolean;
  deliveryStatus: boolean;
  healthCheck: boolean;
  /** هل التحقق من الرمز يجري عند المزوّد (Verify API) أم محلياً في المنصة؟ */
  remoteVerification: boolean;
};

export interface IntegrationConnector {
  validateConfig(context: ConnectorContext): ValidationResult;
  testConnection(context: ConnectorContext, traceId: string): Promise<HealthResult>;
  healthCheck(context: ConnectorContext, traceId: string): Promise<HealthResult>;
  getCapabilities(context: ConnectorContext): Capabilities;
  getProviderMetadata(): ProviderMetadata;
  enable(context: ConnectorContext): Promise<void>;
  disable(context: ConnectorContext): Promise<void>;
}

export type SendOtpInput = {
  phone: string;
  /** الرمز الذي تولّده المنصة — يكون null عندما يولّده المزوّد (Verify API). */
  code: string | null;
  text: string;
  purpose: string;
  traceId: string;
};

export type SendOtpResult = {
  reference: string | null;
  latencyMs: number;
  /** true عندما يتولّى المزوّد توليد الرمز والتحقق منه. */
  remoteVerification: boolean;
};

export type VerifyOtpResult = { verified: boolean; latencyMs: number; detail?: string };

export type DeliveryStatusResult = { status: string; raw?: string | null };

export interface OtpProviderConnector extends IntegrationConnector {
  sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult>;
  verifyOtp(
    context: ConnectorContext,
    input: { phone: string; code: string; referenceId: string | null; traceId: string },
  ): Promise<VerifyOtpResult>;
  resendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult>;
  getDeliveryStatus(
    context: ConnectorContext,
    input: { referenceId: string; phone: string; traceId: string },
  ): Promise<DeliveryStatusResult>;
}

/** أساس مشترك: إعادة الإرسال = إرسال جديد، والتفعيل/الإيقاف بلا آثار خارجية. */
export abstract class BaseOtpConnector implements OtpProviderConnector {
  abstract validateConfig(context: ConnectorContext): ValidationResult;
  abstract testConnection(context: ConnectorContext, traceId: string): Promise<HealthResult>;
  abstract getCapabilities(context: ConnectorContext): Capabilities;
  abstract getProviderMetadata(): ProviderMetadata;
  abstract sendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult>;

  healthCheck(context: ConnectorContext, traceId: string): Promise<HealthResult> {
    return this.testConnection(context, traceId);
  }

  resendOtp(context: ConnectorContext, input: SendOtpInput): Promise<SendOtpResult> {
    return this.sendOtp(context, input);
  }

  async verifyOtp(
    _context: ConnectorContext,
    _input: { phone: string; code: string; referenceId: string | null; traceId: string },
  ): Promise<VerifyOtpResult> {
    // المزوّد لا يوفّر تحققاً عن بُعد: التحقق يجري محلياً في محرك المنصة.
    return { verified: false, latencyMs: 0, detail: "NOT_SUPPORTED" };
  }

  async getDeliveryStatus(
    _context: ConnectorContext,
    _input: { referenceId: string; phone: string; traceId: string },
  ): Promise<DeliveryStatusResult> {
    return { status: "unknown" };
  }

  async enable(_context: ConnectorContext): Promise<void> {
    /* لا يتطلب أي إجراء عند المزوّد */
  }

  async disable(_context: ConnectorContext): Promise<void> {
    /* لا يتطلب أي إجراء عند المزوّد */
  }
}

/** يحوّل أي خطأ اتصال إلى نتيجة فحص آمنة بلا كشف أسرار. */
export function toHealthFailure(error: unknown, latencyMs: number): HealthResult {
  const anyError = error as {
    code?: string;
    status?: number | null;
    detail?: string;
    reason?: string;
    message?: string;
  };
  const code = anyError?.code ?? "NETWORK_ERROR";
  const detail = (anyError?.detail || anyError?.reason || anyError?.message || "").slice(0, 400);
  return { ok: false, statusCode: anyError?.status ?? null, latencyMs, code, detail };
}
