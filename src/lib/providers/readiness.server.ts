/**
 * تجميع جاهزية المزوّدين الخارجيين — خادمي فقط.
 *
 * قواعد ثابتة:
 *  - لا تعود أي قيمة سرّية للمتصفح، فقط حضور الحقل وتلميح مقنّع.
 *  - «متصل» تُشتق فقط من فحص اتصال فعلي ناجح مسجّل في القاعدة.
 *  - كل نطاق يُعرض فقط لموظف يملك صلاحية قراءته؛ الباقي يُعاد كنطاق مقيّد.
 */
import type { StaffRow } from "@/lib/admin-guard.server";
import { expandPermissions, type AdminPermission } from "@/lib/admin-permissions";
import { SECRET_FIELD_LABELS } from "@/lib/integrations/integrations.shared";
import {
  DOMAIN_LABELS,
  type ProviderDomain,
  type ProviderReadiness,
  type ReadinessField,
  type ReadinessOverview,
  type ReadinessStatus,
} from "./readiness.shared";

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyClient = any;

const PAYMENT_FIELD_LABELS: Record<string, string> = {
  secret_key: "المفتاح السرّي (Secret Key)",
  publishable_key: "المفتاح المنشور (Publishable Key)",
  webhook_secret: "سرّ التحقق من الرسائل الواردة (Webhook Secret)",
};

const WHATSAPP_ENV_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "WHATSLINE_BASE_URL", label: "رابط المزوّد الأساسي (Base URL)", required: true },
  { key: "WHATSLINE_HEADER_TOKEN", label: "رمز المصادقة (Header Token)", required: true },
  { key: "WHATSLINE_APP_ID", label: "معرّف التطبيق (App ID) — اختياري", required: false },
];

function fieldLabel(source: Record<string, string>, key: string): string {
  return source[key] ?? key;
}

export function staffPermissions(staff: StaffRow): Set<AdminPermission> {
  if (staff.role === "super_admin") return new Set<AdminPermission>();
  return new Set(
    expandPermissions([
      ...(staff.permissions ?? []),
      ...(staff.platform_roles?.permissions ?? []),
    ]) as AdminPermission[],
  );
}

export function staffCan(staff: StaffRow, permission: AdminPermission): boolean {
  if (staff.role === "super_admin") return true;
  return staffPermissions(staff).has(permission);
}

/** الحالة النهائية: نقص الحقول أولاً، ثم التعطيل الإداري، ثم نتيجة الفحص. */
function resolveStatus(input: {
  missing: number;
  hasAnyField: boolean;
  isEnabled: boolean;
  verified: boolean;
  failed: boolean;
  degraded?: boolean;
}): ReadinessStatus {
  if (!input.hasAnyField) return "not_linked";
  if (input.missing > 0) return "incomplete";
  if (!input.isEnabled) return "disabled";
  if (input.failed) return "failed";
  if (input.degraded) return "failed";
  return input.verified ? "connected" : "not_verified";
}

/* ------------------------------------------------------------------ الدفع */

async function paymentProviders(
  supabase: AnyClient,
  staff: StaffRow,
): Promise<ProviderReadiness[]> {
  const [engine, ctxMod] = await Promise.all([
    import("@/lib/billing/billing.server"),
    import("@/lib/billing/ctx.server"),
  ]);
  const ctx = await ctxMod.billingCtx(supabase, staff.user_id, "billing.read");
  const rows = await engine.listProviders(ctx);
  const canVerify = staffCan(staff, "billing.manage_providers");

  return rows.map((row) => {
    const saved = new Set(
      row.secrets.filter((secret) => secret.status === "active").map((secret) => secret.fieldKey),
    );
    const fields: ReadinessField[] = row.required_keys.map((key) => ({
      key,
      label: fieldLabel(PAYMENT_FIELD_LABELS, key),
      present: saved.has(key),
      required: true,
      hint: row.secrets.find((secret) => secret.fieldKey === key)?.hint ?? null,
    }));
    const missing = fields.filter((field) => !field.present).length;
    const status: ReadinessStatus = !row.requires_credentials
      ? row.is_enabled
        ? "not_required"
        : "disabled"
      : resolveStatus({
          missing,
          hasAnyField: saved.size > 0,
          isEnabled: row.is_enabled,
          verified: row.connection_status === "verified",
          failed: row.connection_status === "failed",
        });

    return {
      domain: "payment" as const,
      key: row.code,
      name: row.name_ar,
      description: row.description,
      status,
      isEnabled: row.is_enabled,
      canVerify: canVerify && row.requires_credentials && missing === 0,
      verifyBlockedReason: !row.requires_credentials
        ? "هذا المزوّد لا يتصل بأي خدمة خارجية."
        : missing > 0
          ? "أكمل الحقول الناقصة قبل فحص الاتصال."
          : canVerify
            ? null
            : "لا تملك صلاحية اختبار مزوّدي الدفع.",
      fields,
      lastCheckedAt: row.last_tested_at,
      lastError: row.last_test_error,
      manageTo: "/mehla-admin/billing/settings",
      manageLabel: "إعدادات المركز المالي",
    } satisfies ProviderReadiness;
  });
}

/* -------------------------------------------------- الرسائل وتوثيق الجوال */

async function otpProviders(staff: StaffRow): Promise<ProviderReadiness[]> {
  const engine = await import("@/lib/integrations/integrations.server");
  const [definitions, integrations] = await Promise.all([
    engine.listDefinitions(),
    engine.listIntegrations(),
  ]);
  const canVerify = staffCan(staff, "integrations.test");
  const byId = new Map(definitions.map((def) => [def.id, def]));

  return integrations.map((row) => {
    const def = byId.get(row.definitionId);
    const required = def?.requiredFields ?? [];
    const saved = new Map(
      row.secretHints
        .filter((hint) => hint.status === "active")
        .map((hint) => [hint.fieldKey, hint.hint]),
    );
    const fields: ReadinessField[] = required.map((key) => ({
      key,
      label: fieldLabel(SECRET_FIELD_LABELS as Record<string, string>, key),
      present: saved.has(key),
      required: true,
      hint: saved.get(key) ?? null,
    }));
    const missing = fields.filter((field) => !field.present).length;
    const status = resolveStatus({
      missing,
      hasAnyField: saved.size > 0 || fields.length === 0,
      isEnabled: row.isEnabled,
      verified: row.status === "connected" && Boolean(row.verifiedAt),
      failed: row.status === "failed" || row.status === "unavailable",
      degraded: row.status === "degraded",
    });

    return {
      domain: "otp" as const,
      key: row.id,
      name: row.displayName,
      description: `${row.categoryLabel} · ${row.internalName}`,
      status,
      isEnabled: row.isEnabled,
      canVerify: canVerify && missing === 0,
      verifyBlockedReason:
        missing > 0
          ? "أكمل الحقول الناقصة قبل فحص الاتصال."
          : canVerify
            ? null
            : "لا تملك صلاحية فحص التكاملات.",
      fields,
      lastCheckedAt: row.lastCheckedAt,
      lastError: row.lastErrorDetail ?? row.lastErrorCode,
      manageTo: "/mehla-admin/integrations",
      manageLabel: "مركز التكاملات",
    } satisfies ProviderReadiness;
  });
}

/* ------------------------------------------------------- واتساب الرسمي */

async function whatsappProvider(staff: StaffRow): Promise<ProviderReadiness[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { WHATSAPP_PROVIDER } = await import("@/lib/notifications/notifications.shared");
  const { data } = await (supabaseAdmin as AnyClient)
    .from("whatsapp_provider_state")
    .select(
      "provider, is_enabled, status, devices_count, templates_count, default_device_id, last_checked_at, last_error_code, last_error_detail",
    )
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();

  const state = (data ?? null) as {
    is_enabled: boolean;
    status: string;
    devices_count: number;
    templates_count: number;
    default_device_id: string | null;
    last_checked_at: string | null;
    last_error_code: string | null;
    last_error_detail: string | null;
  } | null;

  const fields: ReadinessField[] = WHATSAPP_ENV_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    present: Boolean((process.env[field.key] ?? "").trim()),
    required: field.required,
    hint: null,
  }));
  fields.push({
    key: "default_device_id",
    label: "الرقم/الجهاز المُعتمد للإرسال",
    present: Boolean(state?.default_device_id),
    required: true,
    hint: null,
  });
  fields.push({
    key: "templates",
    label: "قالب رسائل رسمي واحد على الأقل",
    present: (state?.templates_count ?? 0) > 0,
    required: true,
    hint: null,
  });

  const missing = fields.filter((field) => field.required && !field.present).length;
  const credentialsPresent = fields
    .filter((field) => field.required && field.key.startsWith("WHATSLINE_"))
    .every((field) => field.present);
  const canVerify = staffCan(staff, "integrations.test");

  const status = resolveStatus({
    missing,
    hasAnyField: fields.some((field) => field.present),
    isEnabled: Boolean(state?.is_enabled),
    verified: state?.status === "connected",
    failed: state?.status === "failed",
    degraded: state?.status === "degraded",
  });

  return [
    {
      domain: "whatsapp" as const,
      key: WHATSAPP_PROVIDER,
      name: "واتساب الرسمي — Whats Line Official",
      description: `أجهزة معتمدة: ${state?.devices_count ?? 0} · قوالب: ${state?.templates_count ?? 0}`,
      status,
      isEnabled: Boolean(state?.is_enabled),
      canVerify: canVerify && credentialsPresent,
      verifyBlockedReason: !credentialsPresent
        ? "أضف رابط المزوّد ورمز المصادقة قبل فحص الاتصال."
        : canVerify
          ? null
          : "لا تملك صلاحية فحص التكاملات.",
      fields,
      lastCheckedAt: state?.last_checked_at ?? null,
      lastError: state?.last_error_detail ?? state?.last_error_code ?? null,
      manageTo: "/mehla-admin/notifications",
      manageLabel: "مركز الإشعارات",
    } satisfies ProviderReadiness,
  ];
}

/* ------------------------------------------------------------------ التجميع */

const DOMAIN_READ_PERMISSION: Record<ProviderDomain, AdminPermission> = {
  payment: "billing.read",
  otp: "integrations.read",
  whatsapp: "integrations.read",
};

export async function buildReadinessOverview(
  supabase: AnyClient,
  staff: StaffRow,
): Promise<ReadinessOverview> {
  const providers: ProviderReadiness[] = [];
  const restrictedDomains: ProviderDomain[] = [];

  const domains: ProviderDomain[] = ["payment", "otp", "whatsapp"];
  for (const domain of domains) {
    if (!staffCan(staff, DOMAIN_READ_PERMISSION[domain])) {
      restrictedDomains.push(domain);
      continue;
    }
    if (domain === "payment") providers.push(...(await paymentProviders(supabase, staff)));
    if (domain === "otp") providers.push(...(await otpProviders(staff)));
    if (domain === "whatsapp") providers.push(...(await whatsappProvider(staff)));
  }

  return { providers, restrictedDomains };
}

export type VerifyResult = {
  ok: boolean;
  message: string;
  missing: string[];
};

/** فحص اتصال فعلي عبر محرك النطاق نفسه — لا تُشتق نتيجة من حضور المفاتيح. */
export async function verifyProviderConnection(
  supabase: AnyClient,
  staff: StaffRow,
  input: { domain: ProviderDomain; key: string },
): Promise<VerifyResult> {
  const overview = await buildReadinessOverview(supabase, staff);
  const provider = overview.providers.find(
    (row) => row.domain === input.domain && row.key === input.key,
  );
  if (!provider) throw new Error("المزوّد غير معروف أو خارج نطاق صلاحياتك.");

  const missing = provider.fields
    .filter((field) => field.required && !field.present)
    .map((field) => field.label);
  if (!provider.canVerify) {
    return {
      ok: false,
      message: provider.verifyBlockedReason ?? "فحص الاتصال غير متاح لهذا المزوّد.",
      missing,
    };
  }

  if (input.domain === "payment") {
    const [engine, ctxMod] = await Promise.all([
      import("@/lib/billing/billing.server"),
      import("@/lib/billing/ctx.server"),
    ]);
    const ctx = await ctxMod.billingCtx(supabase, staff.user_id, "billing.manage_providers");
    const result = await engine.testProvider(ctx, { code: input.key });
    return { ok: result.ok, message: result.message, missing };
  }

  if (input.domain === "otp") {
    const engine = await import("@/lib/integrations/integrations.server");
    const result = await engine.testIntegration(input.key, staff.user_id, "manual");
    const { SAFE_ERROR_MESSAGES } = await import("@/lib/integrations/integrations.shared");
    return {
      ok: result.ok,
      message: result.ok
        ? `تم الاتصال بالمزوّد بنجاح (${result.latencyMs} مللي ثانية).`
        : ((result.code ? SAFE_ERROR_MESSAGES[result.code] : null) ??
          "تعذّر الاتصال بالمزوّد."),
      missing,
    };
  }

  const provider_ = await import("@/lib/notifications/whatsline.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const probe = await provider_.testConnection();
  await (supabaseAdmin as AnyClient)
    .from("whatsapp_provider_state")
    .update({
      status: probe.ok ? "connected" : "failed",
      last_checked_at: new Date().toISOString(),
      last_error_code: probe.ok ? null : probe.code,
      last_error_detail: probe.ok ? null : (probe.detail?.slice(0, 400) ?? null),
    })
    .eq("provider", input.key);

  const { providerErrorMessage } = await import("@/lib/notifications/notifications.shared");
  return {
    ok: probe.ok,
    message: probe.ok
      ? `تم الاتصال بالمزوّد بنجاح (${probe.latencyMs} مللي ثانية).`
      : providerErrorMessage(probe.code ?? "UNKNOWN_PROVIDER_ERROR"),
    missing,
  };
}

export { DOMAIN_LABELS };
