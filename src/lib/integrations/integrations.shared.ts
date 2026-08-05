/**
 * مركز التكاملات — أنواع وثوابت آمنة للمتصفح.
 *
 * قواعد ثابتة:
 *  - لا يحتوي هذا الملف أي سر ولا أي منطق اتصال؛ الاتصال الخارجي من الخادم فقط.
 *  - حالة «متصل» لا تُشتق أبداً من وجود مفتاح، بل من فحص اتصال فعلي ناجح.
 */

export type IntegrationCategory = "otp";

export type AdapterType = "infobip" | "twilio" | "unifonic" | "custom_rest";

export type IntegrationEnvironment = "sandbox" | "production";

export const ENVIRONMENT_LABELS: Record<IntegrationEnvironment, string> = {
  sandbox: "بيئة اختبار",
  production: "بيئة إنتاج",
};

/** حالة التكامل — تتغيّر فقط عبر نتائج فحوصات حقيقية أو تعطيل إداري. */
export type IntegrationStatus =
  | "not_configured"
  | "verifying"
  | "connected"
  | "degraded"
  | "unavailable"
  | "failed"
  | "disabled";

export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  not_configured: "غير مهيأ",
  verifying: "قيد التحقق",
  connected: "متصل",
  degraded: "اتصال متدهور",
  unavailable: "الخدمة متوقفة",
  failed: "فشل الاتصال",
  disabled: "معطّل",
};

export const STATUS_TONES: Record<IntegrationStatus, "green" | "gold" | "red" | "muted" | "info"> =
  {
    not_configured: "muted",
    verifying: "info",
    connected: "green",
    degraded: "gold",
    unavailable: "red",
    failed: "red",
    disabled: "muted",
  };

export type AuthType =
  | "api_key_header"
  | "bearer_token"
  | "basic_auth"
  | "oauth2_client_credentials"
  | "query_api_key"
  | "custom_headers";

export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  api_key_header: "مفتاح API في ترويسة الطلب",
  bearer_token: "رمز Bearer",
  basic_auth: "مصادقة أساسية (اسم المستخدم وكلمة المرور)",
  oauth2_client_credentials: "OAuth 2.0 — Client Credentials",
  query_api_key: "مفتاح API في معامل الرابط",
  custom_headers: "ترويسات مخصصة",
};

/** الحقول السرّية المدعومة. كل قيمة تُخزَّن مشفّرة ولا تعود للمتصفح أبداً. */
export type SecretFieldKey =
  | "api_key"
  | "api_secret"
  | "access_token"
  | "account_sid"
  | "service_sid"
  | "application_id"
  | "client_id"
  | "client_secret"
  | "username"
  | "password"
  | "sender_id";

export const SECRET_FIELD_LABELS: Record<SecretFieldKey, string> = {
  api_key: "API Key",
  api_secret: "API Secret",
  access_token: "Access Token",
  account_sid: "Account SID",
  service_sid: "Service SID",
  application_id: "Application ID",
  client_id: "Client ID",
  client_secret: "Client Secret",
  username: "Username",
  password: "Password",
  sender_id: "Sender ID (اسم المُرسل)",
};

export const SECRET_FIELD_ORDER: SecretFieldKey[] = [
  "api_key",
  "api_secret",
  "access_token",
  "account_sid",
  "service_sid",
  "application_id",
  "client_id",
  "client_secret",
  "username",
  "password",
  "sender_id",
];

/** ترويسة مخصصة: الاسم ظاهر، والقيمة سرّية تُخزَّن في الخزنة. */
export const CUSTOM_HEADER_PREFIX = "header:";

export function customHeaderFieldKey(name: string): string {
  return `${CUSTOM_HEADER_PREFIX}${name.trim()}`;
}

export function isCustomHeaderField(key: string): boolean {
  return key.startsWith(CUSTOM_HEADER_PREFIX);
}

export function customHeaderName(key: string): string {
  return key.slice(CUSTOM_HEADER_PREFIX.length);
}

/** المتغيرات الآمنة الوحيدة المسموح بها في قوالب الموصل المخصص. */
export const TEMPLATE_VARIABLES = [
  "phone",
  "code",
  "purpose",
  "reference_id",
  "sender_id",
  "trace_id",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

/** تعريف فحص الاتصال — للموصل المخصص يُحدّده المالك بالكامل. */
export type HealthCheckSpec = {
  method: HttpMethod;
  path: string;
  headers: { name: string; value: string }[];
  query: { name: string; value: string }[];
  body: string | null;
  successStatusCodes: number[];
  successJsonPath: string | null;
  expectedValue: string | null;
  expectJson: boolean;
};

export const DEFAULT_HEALTH_CHECK: HealthCheckSpec = {
  method: "GET",
  path: "/",
  headers: [],
  query: [],
  body: null,
  successStatusCodes: [200],
  successJsonPath: null,
  expectedValue: null,
  expectJson: true,
};

/** خريطة عمليات OTP للموصل المخصص — بلا أي كود قابل للتنفيذ. */
export type OperationSpec = {
  enabled: boolean;
  method: HttpMethod;
  path: string;
  headers: { name: string; value: string }[];
  query: { name: string; value: string }[];
  bodyTemplate: string | null;
  successStatusCodes: number[];
  successJsonPath: string | null;
  expectedValue: string | null;
  resultJsonPath: string | null;
};

export const EMPTY_OPERATION: OperationSpec = {
  enabled: false,
  method: "POST",
  path: "/",
  headers: [],
  query: [],
  bodyTemplate: null,
  successStatusCodes: [200, 201],
  successJsonPath: null,
  expectedValue: null,
  resultJsonPath: null,
};

export type CustomMapping = {
  send: OperationSpec;
  verify: OperationSpec;
  status: OperationSpec;
};

export const EMPTY_MAPPING: CustomMapping = {
  send: { ...EMPTY_OPERATION, enabled: true, path: "/messages" },
  verify: { ...EMPTY_OPERATION },
  status: { ...EMPTY_OPERATION, method: "GET" },
};

/** تعريف مزوّد موثوق كما تقرؤه الواجهة. */
export type IntegrationDefinitionView = {
  id: string;
  providerKey: string;
  displayName: string;
  displayNameAr: string;
  category: IntegrationCategory;
  categoryLabel: string;
  adapterType: AdapterType;
  logoPath: string | null;
  websiteUrl: string | null;
  defaultBaseUrl: string | null;
  supportedAuthTypes: AuthType[];
  requiredFields: string[];
  optionalFields: string[];
  capabilities: Record<string, boolean>;
  healthHint: string | null;
  isBuiltin: boolean;
};

/** تكامل مهيأ كما يراه المالك — لا يحتوي أي قيمة سرّية، فقط تلميحات مقنّعة. */
export type IntegrationView = {
  id: string;
  definitionId: string;
  providerKey: string;
  adapterType: AdapterType;
  internalName: string;
  displayName: string;
  categoryLabel: string;
  websiteUrl: string | null;
  logoPath: string | null;
  logoSource: string;
  environment: IntegrationEnvironment;
  baseUrl: string;
  authType: AuthType;
  status: IntegrationStatus;
  isEnabled: boolean;
  isActive: boolean;
  timeoutMs: number;
  maxRetries: number;
  monitorIntervalMinutes: number;
  consecutiveFailures: number;
  verifiedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  lastTraceId: string | null;
  createdAt: string;
  secretHints: {
    fieldKey: string;
    label: string;
    hint: string;
    status: string;
    rotatedAt: string | null;
  }[];
  healthCheck: HealthCheckSpec;
  mapping: CustomMapping;
  allowedHosts: string[];
  senderId: string | null;
  notes: string | null;
};

export type HealthLogView = {
  id: string;
  integrationId: string | null;
  providerKey: string;
  internalName: string | null;
  result: "success" | "failure" | "blocked" | "skipped";
  checkKind: string;
  statusCode: number | null;
  latencyMs: number | null;
  safeErrorCode: string | null;
  safeErrorDetail: string | null;
  traceId: string;
  checkedAt: string;
};

/** رموز الأخطاء الآمنة — لا تكشف أي تفاصيل طلب أو أسرار. */
export const SAFE_ERROR_MESSAGES: Record<string, string> = {
  MISSING_CREDENTIALS: "بيانات الربط غير مكتملة.",
  INVALID_CREDENTIALS: "تعذّر التحقق من بيانات الربط.",
  UNAUTHORIZED: "تعذّر التحقق من بيانات الربط.",
  FORBIDDEN: "المزوّد رفض الطلب لعدم كفاية الصلاحيات.",
  NOT_FOUND: "المسار المحدد غير موجود عند المزوّد.",
  RATE_LIMITED: "المزوّد رفض الطلب لتجاوز الحد المسموح.",
  PROVIDER_ERROR: "المزوّد أرجع خطأً غير متوقع.",
  UNEXPECTED_HTML: "المزوّد أرجع صفحة HTML بدلاً من استجابة JSON.",
  UNEXPECTED_REDIRECT: "المزوّد أعاد توجيهاً غير متوقع.",
  INVALID_JSON: "استجابة المزوّد ليست JSON صالحاً.",
  CONDITION_NOT_MET: "الاستجابة لا تطابق شرط النجاح المحدد.",
  BODY_ERROR: "الاستجابة تحمل رمز نجاح لكن محتواها يشير إلى خطأ.",
  TIMEOUT: "انتهت مدة الانتظار قبل استجابة المزوّد.",
  RESPONSE_TOO_LARGE: "استجابة المزوّد أكبر من الحد المسموح.",
  NETWORK_ERROR: "تعذّر الوصول إلى المزوّد.",
  SSRF_BLOCKED: "الرابط محظور أمنياً (شبكة داخلية أو بروتوكول غير مسموح).",
  CONFIG_INVALID: "إعدادات التكامل غير مكتملة أو غير صحيحة.",
  NOT_SUPPORTED: "هذه العملية غير مدعومة لهذا المزوّد.",
};

export function safeErrorMessage(code: string | null | undefined): string {
  if (!code) return "تعذّر إكمال الفحص.";
  return SAFE_ERROR_MESSAGES[code] ?? "تعذّر إكمال الفحص.";
}

/** تلميح مقنّع لعرض القيمة دون كشفها: ****X9F2 */
export function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

export function statusIsConnected(status: IntegrationStatus): boolean {
  return status === "connected";
}

/** اسم داخلي صالح: أحرف لاتينية صغيرة وأرقام وشرطات فقط. */
export function normalizeInternalName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** اقتراح اسم ظاهر من رابط الخدمة — يُعرض للمالك للتأكيد ولا يُطبَّق تلقائياً. */
export function suggestNameFromUrl(baseUrl: string): { suggestion: string; host: string } | null {
  try {
    const url = new URL(baseUrl.trim());
    const host = url.hostname.replace(/^www\./, "");
    const core =
      host.split(".").filter((p) => !["api", "rest", "cloud", "el", "sms"].includes(p))[0] ?? host;
    return { suggestion: core.charAt(0).toUpperCase() + core.slice(1), host };
  } catch {
    return null;
  }
}
