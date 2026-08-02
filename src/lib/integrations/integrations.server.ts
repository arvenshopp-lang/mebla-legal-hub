/**
 * محرك مركز التكاملات — خادم فقط.
 *
 * مسؤولياته: قراءة التعريفات والتكاملات، حفظ الإعدادات والأسرار، تنفيذ فحوصات
 * الاتصال الحقيقية وتحديث الحالة، تفعيل تكامل واحد فعّال لكل فئة، وتسليم سياق
 * التشغيل لمحرك الرموز. لا تُعاد أي قيمة سرّية من أي دالة هنا.
 */
import {
  DEFAULT_HEALTH_CHECK,
  EMPTY_MAPPING,
  SECRET_FIELD_LABELS,
  isCustomHeaderField,
  customHeaderName,
  normalizeInternalName,
  type AdapterType,
  type AuthType,
  type CustomMapping,
  type HealthCheckSpec,
  type HealthLogView,
  type IntegrationDefinitionView,
  type IntegrationEnvironment,
  type IntegrationStatus,
  type IntegrationView,
} from "./integrations.shared";
import { IntegrationSecretVault } from "./vault.server";
import { getConnector } from "./connectors/registry.server";
import type { Capabilities, ConnectorContext, HealthResult } from "./connectors/base.server";

// جداول مركز التكاملات أحدث من الأنواع المولّدة، لذا يُستخدم عميل غير مُقيّد النوع.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

const TRACE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newTraceId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += TRACE_ALPHABET[byte % TRACE_ALPHABET.length];
  return `IN-${out}`;
}

/* --------------------------------------------------------- تحويل الصفوف */

function asHealthCheck(value: unknown): HealthCheckSpec {
  const raw = (value ?? {}) as Partial<HealthCheckSpec>;
  return {
    method: raw.method ?? DEFAULT_HEALTH_CHECK.method,
    path: raw.path ?? DEFAULT_HEALTH_CHECK.path,
    headers: Array.isArray(raw.headers) ? raw.headers : [],
    query: Array.isArray(raw.query) ? raw.query : [],
    body: raw.body ?? null,
    successStatusCodes: raw.successStatusCodes?.length ? raw.successStatusCodes : [200],
    successJsonPath: raw.successJsonPath ?? null,
    expectedValue: raw.expectedValue ?? null,
    expectJson: raw.expectJson ?? true,
  };
}

function asMapping(value: unknown): CustomMapping {
  const raw = (value ?? {}) as Partial<CustomMapping>;
  return {
    send: { ...EMPTY_MAPPING.send, ...(raw.send ?? {}) },
    verify: { ...EMPTY_MAPPING.verify, ...(raw.verify ?? {}) },
    status: { ...EMPTY_MAPPING.status, ...(raw.status ?? {}) },
  };
}

type IntegrationRow = Record<string, unknown> & {
  id: string;
  provider_key: string;
  adapter_type?: string;
  configuration_json: Record<string, unknown>;
};

function configOf(row: IntegrationRow): Record<string, unknown> {
  return (row.configuration_json ?? {}) as Record<string, unknown>;
}

function allowedHostsOf(row: IntegrationRow): string[] {
  const value = configOf(row)["allowed_hosts"];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toView(row: IntegrationRow, hints: Awaited<ReturnType<typeof IntegrationSecretVault.listHints>>): IntegrationView {
  const config = configOf(row);
  return {
    id: row.id,
    definitionId: String(row["definition_id"]),
    providerKey: row.provider_key,
    adapterType: String(config["adapter_type"] ?? row.adapter_type ?? "custom_rest") as AdapterType,
    internalName: String(row["internal_name"]),
    displayName: String(row["display_name"]),
    categoryLabel: String(config["category_label"] ?? "خدمة التحقق عبر SMS"),
    websiteUrl: (row["website_url"] as string | null) ?? null,
    logoPath: (row["logo_path"] as string | null) ?? null,
    logoSource: String(row["logo_source"] ?? "builtin"),
    environment: String(row["environment"]) as IntegrationEnvironment,
    baseUrl: String(row["base_url"]),
    authType: String(row["auth_type"]) as AuthType,
    status: String(row["status"]) as IntegrationStatus,
    isEnabled: Boolean(row["is_enabled"]),
    isActive: Boolean(row["is_active"]),
    timeoutMs: Number(row["timeout_ms"] ?? 10000),
    maxRetries: Number(row["max_retries"] ?? 1),
    monitorIntervalMinutes: Number(row["monitor_interval_minutes"] ?? 60),
    consecutiveFailures: Number(row["consecutive_failures"] ?? 0),
    verifiedAt: (row["verified_at"] as string | null) ?? null,
    lastSuccessAt: (row["last_success_at"] as string | null) ?? null,
    lastFailureAt: (row["last_failure_at"] as string | null) ?? null,
    lastCheckedAt: (row["last_checked_at"] as string | null) ?? null,
    latencyMs: (row["latency_ms"] as number | null) ?? null,
    lastErrorCode: (row["last_error_code"] as string | null) ?? null,
    lastErrorDetail: (row["last_error_detail"] as string | null) ?? null,
    lastTraceId: (row["last_trace_id"] as string | null) ?? null,
    createdAt: String(row["created_at"]),
    secretHints: hints.map((hint) => ({
      ...hint,
      label: isCustomHeaderField(hint.fieldKey)
        ? `ترويسة ${customHeaderName(hint.fieldKey)}`
        : (SECRET_FIELD_LABELS[hint.fieldKey as keyof typeof SECRET_FIELD_LABELS] ?? hint.fieldKey),
    })),
    healthCheck: asHealthCheck(row["health_check_json"]),
    mapping: asMapping(row["mapping_json"]),
    allowedHosts: allowedHostsOf(row),
    senderId: (config["sender_id"] as string | null) ?? null,
    notes: (config["notes"] as string | null) ?? null,
  };
}

async function buildContext(row: IntegrationRow): Promise<ConnectorContext> {
  const config = configOf(row);
  const secrets = await IntegrationSecretVault.getSecretsServerSide(String(row["secret_reference"]));
  return {
    integrationId: row.id,
    providerKey: row.provider_key,
    adapterType: String(config["adapter_type"] ?? "custom_rest") as AdapterType,
    displayName: String(row["display_name"]),
    environment: String(row["environment"]) as IntegrationEnvironment,
    baseUrl: String(row["base_url"]),
    authType: String(row["auth_type"]) as AuthType,
    timeoutMs: Number(row["timeout_ms"] ?? 10000),
    maxRetries: Number(row["max_retries"] ?? 1),
    secrets,
    configuration: config,
    healthCheck: asHealthCheck(row["health_check_json"]),
    mapping: asMapping(row["mapping_json"]),
    allowedHosts: allowedHostsOf(row),
  };
}

/* ------------------------------------------------------------- القراءة */

export async function listDefinitions(): Promise<IntegrationDefinitionView[]> {
  const client = await db();
  const { data } = await client
    .from("integration_definitions")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"]),
    providerKey: String(row["provider_key"]),
    displayName: String(row["display_name"]),
    displayNameAr: String(row["display_name_ar"]),
    category: "otp",
    categoryLabel: String(row["category_label"]),
    adapterType: String(row["adapter_type"]) as AdapterType,
    logoPath: (row["logo_path"] as string | null) ?? null,
    websiteUrl: (row["website_url"] as string | null) ?? null,
    defaultBaseUrl: (row["default_base_url"] as string | null) ?? null,
    supportedAuthTypes: ((row["supported_auth_types"] as string[]) ?? []) as AuthType[],
    requiredFields: (row["required_fields"] as string[]) ?? [],
    optionalFields: (row["optional_fields"] as string[]) ?? [],
    capabilities: (row["capabilities"] as Record<string, boolean>) ?? {},
    healthHint: (row["health_hint"] as string | null) ?? null,
    isBuiltin: Boolean(row["is_builtin"]),
  }));
}

export async function listIntegrations(): Promise<IntegrationView[]> {
  const client = await db();
  const { data } = await client
    .from("platform_integrations")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as IntegrationRow[];
  return Promise.all(
    rows.map(async (row) => toView(row, await IntegrationSecretVault.listHints(String(row["secret_reference"])))),
  );
}

async function loadRow(id: string): Promise<IntegrationRow> {
  const client = await db();
  const { data } = await client.from("platform_integrations").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("التكامل غير موجود.");
  return data as IntegrationRow;
}

export async function getIntegration(id: string): Promise<IntegrationView> {
  const row = await loadRow(id);
  return toView(row, await IntegrationSecretVault.listHints(String(row["secret_reference"])));
}

export async function getCapabilities(id: string): Promise<Capabilities> {
  const row = await loadRow(id);
  const context = await buildContext(row);
  return getConnector(context.adapterType).getCapabilities(context);
}

/** سياق تشغيل تكامل محدد — للاختبار اليدوي من لوحة الإدارة فقط. */
export async function buildContextForIntegration(id: string): Promise<ConnectorContext> {
  return buildContext(await loadRow(id));
}

export async function listHealthLogs(integrationId: string | null, limit = 50): Promise<HealthLogView[]> {
  const client = await db();
  let query = client
    .from("integration_health_logs")
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (integrationId) query = query.eq("integration_id", integrationId);
  const { data } = await query;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"]),
    integrationId: (row["integration_id"] as string | null) ?? null,
    providerKey: String(row["provider_key"]),
    internalName: (row["internal_name"] as string | null) ?? null,
    result: String(row["result"]) as HealthLogView["result"],
    checkKind: String(row["check_kind"]),
    statusCode: (row["status_code"] as number | null) ?? null,
    latencyMs: (row["latency_ms"] as number | null) ?? null,
    safeErrorCode: (row["safe_error_code"] as string | null) ?? null,
    safeErrorDetail: (row["safe_error_detail"] as string | null) ?? null,
    traceId: String(row["trace_id"]),
    checkedAt: String(row["checked_at"]),
  }));
}

/* ------------------------------------------------------------- الحفظ */

export type SaveIntegrationInput = {
  id?: string | null;
  definitionId: string;
  internalName: string;
  displayName: string;
  environment: IntegrationEnvironment;
  baseUrl: string;
  authType: AuthType;
  timeoutMs: number;
  maxRetries: number;
  monitorIntervalMinutes: number;
  allowedHosts: string[];
  configuration: Record<string, unknown>;
  healthCheck: HealthCheckSpec;
  mapping: CustomMapping;
  notes: string | null;
  /** قيم سرّية جديدة فقط؛ الحقول غير المذكورة تبقى كما هي. */
  secrets: Record<string, string>;
  /** حقول سرّية يجب إبطالها وحذفها. */
  removedSecretFields: string[];
};

export async function saveIntegration(
  input: SaveIntegrationInput,
  actorId: string | null,
): Promise<IntegrationView> {
  const client = await db();
  const { data: definition } = await client
    .from("integration_definitions")
    .select("*")
    .eq("id", input.definitionId)
    .maybeSingle();
  if (!definition) throw new Error("مزوّد الخدمة المحدد غير متاح.");

  const adapterType = String(definition["adapter_type"]) as AdapterType;
  const internalName = normalizeInternalName(input.internalName || input.displayName);
  if (!internalName) throw new Error("الاسم الداخلي للتكامل مطلوب.");

  const configuration: Record<string, unknown> = {
    ...input.configuration,
    adapter_type: adapterType,
    category: "otp",
    category_label: String(definition["category_label"]),
    allowed_hosts: input.allowedHosts,
    notes: input.notes,
  };

  const payload: Record<string, unknown> = {
    definition_id: input.definitionId,
    provider_key: String(definition["provider_key"]),
    internal_name: internalName,
    display_name: input.displayName.trim().slice(0, 120),
    website_url: (definition["website_url"] as string | null) ?? null,
    logo_path: (definition["logo_path"] as string | null) ?? null,
    logo_source: definition["is_builtin"] ? "builtin" : "custom",
    environment: input.environment,
    base_url: input.baseUrl.trim(),
    auth_type: input.authType,
    configuration_json: configuration,
    health_check_json: input.healthCheck,
    mapping_json: input.mapping,
    timeout_ms: input.timeoutMs,
    max_retries: input.maxRetries,
    monitor_interval_minutes: input.monitorIntervalMinutes,
  };

  let id = input.id ?? null;
  let secretReference: string;

  if (id) {
    const existing = await loadRow(id);
    secretReference = String(existing["secret_reference"]);
    // أي تغيير في الإعدادات يُبطل حالة «متصل» حتى يُعاد الفحص بنجاح.
    const { error } = await client
      .from("platform_integrations")
      .update({
        ...payload,
        status: existing["is_enabled"] ? "verifying" : "not_configured",
        is_active: false,
        verified_at: null,
      })
      .eq("id", id);
    if (error) throw new Error("تعذّر حفظ إعدادات التكامل.");
  } else {
    secretReference = IntegrationSecretVault.newReference();
    const { data, error } = await client
      .from("platform_integrations")
      .insert({
        ...payload,
        secret_reference: secretReference,
        status: "not_configured",
        is_enabled: false,
        is_active: false,
        created_by: actorId,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error(
        String(error?.code) === "23505"
          ? "يوجد تكامل آخر بنفس الاسم الداخلي."
          : "تعذّر إنشاء التكامل.",
      );
    }
    id = String((data as { id: string }).id);
  }

  for (const fieldKey of input.removedSecretFields) {
    await IntegrationSecretVault.revokeSecret(secretReference, fieldKey);
    await IntegrationSecretVault.deleteSecret(secretReference, fieldKey);
  }
  for (const [fieldKey, value] of Object.entries(input.secrets)) {
    if (!value.trim()) continue;
    await IntegrationSecretVault.updateSecret(secretReference, fieldKey, value, actorId);
  }

  const row = await loadRow(id!);
  const context = await buildContext(row);
  const validation = getConnector(context.adapterType).validateConfig(context);
  if (!validation.ok) {
    await client
      .from("platform_integrations")
      .update({ status: "not_configured", last_error_code: "CONFIG_INVALID", last_error_detail: validation.errors.join(" | ") })
      .eq("id", id);
  }
  return getIntegration(id!);
}

/* ----------------------------------------------------- الفحص والحالة */

function nextStatus(result: HealthResult, failures: number, isEnabled: boolean): IntegrationStatus {
  if (result.ok) return isEnabled ? "connected" : "disabled";
  if (result.code === "SSRF_BLOCKED" || result.code === "CONFIG_INVALID") return "failed";
  if (result.code === "TIMEOUT" || result.code === "NETWORK_ERROR") return failures >= 3 ? "unavailable" : "degraded";
  return failures >= 3 ? "failed" : "degraded";
}

async function recordHealth(
  row: IntegrationRow,
  result: HealthResult,
  traceId: string,
  checkKind: "manual" | "monitor" | "runtime",
  actorId: string | null,
): Promise<void> {
  const client = await db();
  const now = new Date().toISOString();
  const failures = result.ok ? 0 : Number(row["consecutive_failures"] ?? 0) + 1;
  const isEnabled = Boolean(row["is_enabled"]);
  const status = nextStatus(result, failures, isEnabled);

  await client
    .from("platform_integrations")
    .update({
      status,
      consecutive_failures: failures,
      latency_ms: result.latencyMs,
      last_checked_at: now,
      last_trace_id: traceId,
      ...(result.ok
        ? { last_success_at: now, verified_at: now, last_error_code: null, last_error_detail: null }
        : {
            last_failure_at: now,
            last_error_code: result.code,
            last_error_detail: result.detail?.slice(0, 500) ?? null,
            // فقدان الاتصال يوقف التفعيل تلقائياً حتى ينجح فحص جديد.
            ...(status === "failed" || status === "unavailable" ? { is_active: false } : {}),
          }),
    })
    .eq("id", row.id);

  await client.from("integration_health_logs").insert({
    integration_id: row.id,
    provider_key: row.provider_key,
    internal_name: String(row["internal_name"]),
    result: result.ok ? "success" : result.code === "SSRF_BLOCKED" ? "blocked" : "failure",
    check_kind: checkKind,
    status_code: result.statusCode,
    latency_ms: result.latencyMs,
    safe_error_code: result.ok ? null : result.code,
    safe_error_detail: result.ok ? null : (result.detail?.slice(0, 500) ?? null),
    trace_id: traceId,
    actor_id: actorId,
  });
}

export type TestResult = {
  ok: boolean;
  traceId: string;
  statusCode: number | null;
  latencyMs: number;
  code: string | null;
  detail: string | null;
  status: IntegrationStatus;
};

/** فحص اتصال حقيقي. لا تُشتق حالة «متصل» إلا من نجاح هذا الفحص. */
export async function testIntegration(
  id: string,
  actorId: string | null,
  checkKind: "manual" | "monitor" = "manual",
): Promise<TestResult> {
  const row = await loadRow(id);
  const traceId = newTraceId();
  const context = await buildContext(row);
  const connector = getConnector(context.adapterType);

  const validation = connector.validateConfig(context);
  if (!validation.ok) {
    const failure: HealthResult = {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      code: "CONFIG_INVALID",
      detail: validation.errors.join(" | "),
    };
    await recordHealth(row, failure, traceId, checkKind, actorId);
    return {
      ok: false,
      traceId,
      statusCode: null,
      latencyMs: 0,
      code: "CONFIG_INVALID",
      detail: validation.errors.join(" | "),
      status: (await getIntegration(id)).status,
    };
  }

  const result = await connector.testConnection(context, traceId);
  await recordHealth(row, result, traceId, checkKind, actorId);
  const view = await getIntegration(id);
  return {
    ok: result.ok,
    traceId,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    code: result.ok ? null : result.code,
    detail: result.ok ? (result.detail ?? null) : result.detail,
    status: view.status,
  };
}

/** تفعيل/تعطيل التكامل. التفعيل يتطلب فحص اتصال ناجح أولاً. */
export async function setIntegrationEnabled(id: string, enabled: boolean): Promise<IntegrationView> {
  const client = await db();
  const row = await loadRow(id);
  if (enabled && !row["verified_at"]) {
    throw new Error("نفّذ فحص اتصال ناجحاً قبل تشغيل التكامل.");
  }
  await client
    .from("platform_integrations")
    .update(
      enabled
        ? { is_enabled: true, status: "connected" }
        : { is_enabled: false, is_active: false, status: "disabled" },
    )
    .eq("id", id);
  return getIntegration(id);
}

/** تعيين التكامل الفعّال لفئة OTP — واحد فقط، والباقي يُنزَع تفعيله. */
export async function setIntegrationActive(id: string): Promise<IntegrationView> {
  const client = await db();
  const row = await loadRow(id);
  if (!row["is_enabled"] || !row["verified_at"]) {
    throw new Error("لا يمكن اعتماد تكامل غير مُتحقق منه أو غير مُشغّل.");
  }
  await client
    .from("platform_integrations")
    .update({ is_active: false })
    .eq("configuration_json->>category", "otp")
    .neq("id", id);
  const { error } = await client.from("platform_integrations").update({ is_active: true }).eq("id", id);
  if (error) throw new Error("تعذّر اعتماد التكامل كخدمة فعّالة.");
  return getIntegration(id);
}

export async function deactivateCategory(): Promise<void> {
  const client = await db();
  await client.from("platform_integrations").update({ is_active: false }).eq("configuration_json->>category", "otp");
}

export async function deleteIntegration(id: string): Promise<void> {
  const client = await db();
  const row = await loadRow(id);
  if (row["is_active"]) {
    const { data: settings } = await client
      .from("sms_settings")
      .select("enabled, signup_mode")
      .eq("id", true)
      .maybeSingle();
    const enforced =
      Boolean(settings?.enabled) && String(settings?.signup_mode ?? "") === "required_verified";
    if (enforced) {
      throw new Error(
        "هذا المزوّد معتمد وتوثيق الجوال إلزامي حالياً. اعتمد مزوّداً بديلاً أو ألغِ الإلزام قبل الحذف.",
      );
    }
  }
  const reference = String(row["secret_reference"]);
  await IntegrationSecretVault.revokeSecret(reference);
  await IntegrationSecretVault.deleteSecret(reference);
  const { error } = await client.from("platform_integrations").delete().eq("id", id);
  if (error) throw new Error("تعذّر حذف التكامل.");
}

/** عدد تكاملات خدمة الرموز المهيأة — يحدد ما إن كان المسار القديم مسموحاً كرجوع انتقالي. */
export async function countOtpIntegrations(): Promise<number> {
  const client = await db();
  const { count } = await client
    .from("platform_integrations")
    .select("id", { count: "exact", head: true })
    .eq("configuration_json->>category", "otp");
  return Number(count ?? 0);
}

/** فحص دوري لكل تكامل مُشغّل تجاوز فترة المراقبة الخاصة به. */
export async function runIntegrationMonitor(): Promise<{ checked: number; failures: number }> {
  const client = await db();
  const { data } = await client
    .from("platform_integrations")
    .select("id, monitor_interval_minutes, last_checked_at")
    .eq("is_enabled", true);
  const rows = (data ?? []) as { id: string; monitor_interval_minutes: number; last_checked_at: string | null }[];
  let checked = 0;
  let failures = 0;
  for (const row of rows) {
    const dueAt = row.last_checked_at
      ? new Date(row.last_checked_at).getTime() + row.monitor_interval_minutes * 60_000
      : 0;
    if (dueAt > Date.now()) continue;
    const result = await testIntegration(row.id, null, "monitor");
    checked += 1;
    if (!result.ok) failures += 1;
  }
  return { checked, failures };
}

/* --------------------------------------- سياق التشغيل لمحرك الرموز */

export type ActiveOtpIntegration = {
  view: IntegrationView;
  context: ConnectorContext;
  capabilities: Capabilities;
  connector: ReturnType<typeof getConnector>;
};

/**
 * التكامل الفعّال لخدمة الرموز، أو null عندما لا يوجد تكامل مُعتمد.
 * محرك الرموز هو المستهلك الوحيد لهذه الدالة، ولا يعرف اسم المزوّد.
 */
export async function resolveActiveOtpIntegration(): Promise<ActiveOtpIntegration | null> {
  const client = await db();
  const { data } = await client
    .from("platform_integrations")
    .select("*")
    .eq("is_active", true)
    .eq("is_enabled", true)
    .eq("configuration_json->>category", "otp")
    .maybeSingle();
  if (!data) return null;
  const row = data as IntegrationRow;
  const context = await buildContext(row);
  const connector = getConnector(context.adapterType);
  if (!connector.validateConfig(context).ok) return null;
  return {
    view: toView(row, await IntegrationSecretVault.listHints(String(row["secret_reference"]))),
    context,
    capabilities: connector.getCapabilities(context),
    connector,
  };
}

/** تسجيل نتيجة تشغيل حقيقية (إرسال رمز) في صحة التكامل. */
export async function recordRuntimeOutcome(
  integrationId: string,
  outcome: { ok: boolean; latencyMs: number; statusCode?: number | null; code?: string; detail?: string },
  traceId: string,
): Promise<void> {
  const row = await loadRow(integrationId);
  const result: HealthResult = outcome.ok
    ? { ok: true, statusCode: outcome.statusCode ?? 200, latencyMs: outcome.latencyMs }
    : {
        ok: false,
        statusCode: outcome.statusCode ?? null,
        latencyMs: outcome.latencyMs,
        code: outcome.code ?? "PROVIDER_ERROR",
        detail: outcome.detail ?? "",
      };
  await recordHealth(row, result, traceId, "runtime", null);
}