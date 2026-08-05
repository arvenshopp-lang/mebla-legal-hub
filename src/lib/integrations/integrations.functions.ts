/**
 * دوال خادم مركز التكاملات — كل عملية تتطلب موظف منصة يملك صلاحية إعدادات المنصة.
 * لا تُعيد أي دالة هنا قيمة سرّية؛ فقط تلميحات مقنّعة ونتائج فحص آمنة.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pairSchema = z.object({ name: z.string().trim().max(80), value: z.string().trim().max(400) });

const healthCheckSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH"]),
  path: z.string().trim().max(300),
  headers: z.array(pairSchema).max(20),
  query: z.array(pairSchema).max(20),
  body: z.string().max(4000).nullable(),
  successStatusCodes: z.array(z.number().int().min(100).max(599)).max(10),
  successJsonPath: z.string().trim().max(160).nullable(),
  expectedValue: z.string().trim().max(160).nullable(),
  expectJson: z.boolean(),
});

const operationSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]),
  path: z.string().trim().max(300),
  headers: z.array(pairSchema).max(20),
  query: z.array(pairSchema).max(20),
  bodyTemplate: z.string().max(4000).nullable(),
  successStatusCodes: z.array(z.number().int().min(100).max(599)).max(10),
  successJsonPath: z.string().trim().max(160).nullable(),
  expectedValue: z.string().trim().max(160).nullable(),
  resultJsonPath: z.string().trim().max(160).nullable(),
});

const saveSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  definitionId: z.string().uuid(),
  internalName: z.string().trim().min(2).max(60),
  displayName: z.string().trim().min(2).max(120),
  environment: z.enum(["sandbox", "production"]),
  baseUrl: z.string().trim().url().max(300),
  authType: z.enum([
    "api_key_header",
    "bearer_token",
    "basic_auth",
    "oauth2_client_credentials",
    "query_api_key",
    "custom_headers",
  ]),
  timeoutMs: z.number().int().min(1000).max(30000),
  maxRetries: z.number().int().min(0).max(5),
  monitorIntervalMinutes: z.number().int().min(5).max(1440),
  allowedHosts: z.array(z.string().trim().max(200)).max(10),
  configuration: z.record(z.string(), z.unknown()),
  healthCheck: healthCheckSchema,
  mapping: z.object({ send: operationSchema, verify: operationSchema, status: operationSchema }),
  notes: z.string().trim().max(1000).nullable(),
  secrets: z.record(z.string().max(120), z.string().max(4000)),
  removedSecretFields: z.array(z.string().max(120)).max(30),
});

export type SaveIntegrationPayload = z.infer<typeof saveSchema>;

/** كل ما تحتاجه صفحة مركز التكاملات في طلب واحد. */
export const getIntegrationsHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guard = await import("@/lib/admin-guard.server");
    await guard.requireStaff(context.supabase, context.userId, "integrations.read");
    const engine = await import("./integrations.server");
    const [definitions, integrations, logs] = await Promise.all([
      engine.listDefinitions(),
      engine.listIntegrations(),
      engine.listHealthLogs(null, 60),
    ]);
    return { definitions, integrations, logs, vaultReady: (await import("./vault.server")).vaultReady() };
  });

export const saveIntegrationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveIntegrationPayload) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.manage");
    const engine = await import("./integrations.server");
    const view = await engine.saveIntegration(
      {
        id: data.id ?? null,
        definitionId: data.definitionId,
        internalName: data.internalName,
        displayName: data.displayName,
        environment: data.environment,
        baseUrl: data.baseUrl,
        authType: data.authType,
        timeoutMs: data.timeoutMs,
        maxRetries: data.maxRetries,
        monitorIntervalMinutes: data.monitorIntervalMinutes,
        allowedHosts: data.allowedHosts,
        configuration: data.configuration,
        healthCheck: data.healthCheck,
        mapping: data.mapping,
        notes: data.notes,
        secrets: data.secrets,
        removedSecretFields: data.removedSecretFields,
      },
      context.userId,
    );
    await guard.writeAudit(context.supabase, staff, {
      action: data.id ? "integration.update" : "integration.create",
      entity_type: "platform_integration",
      entity_id: view.id,
      description: `${data.id ? "تعديل" : "إضافة"} تكامل ${view.displayName}`,
      metadata: {
        provider: view.providerKey,
        environment: view.environment,
        secret_fields: Object.keys(data.secrets),
        removed_fields: data.removedSecretFields,
      },
    });
    return view;
  });

export const testIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.test");
    const engine = await import("./integrations.server");
    const result = await engine.testIntegration(data.id, context.userId, "manual");
    await guard.writeAudit(context.supabase, staff, {
      action: "integration.test",
      entity_type: "platform_integration",
      entity_id: data.id,
      description: `فحص اتصال ${result.ok ? "ناجح" : "فاشل"} — مرجع ${result.traceId}`,
      metadata: { ok: result.ok, code: result.code, latency_ms: result.latencyMs },
    });
    return result;
  });

export const setIntegrationEnabledState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.activate");
    const engine = await import("./integrations.server");
    const view = await engine.setIntegrationEnabled(data.id, data.enabled);
    await guard.writeAudit(context.supabase, staff, {
      action: data.enabled ? "integration.enable" : "integration.disable",
      entity_type: "platform_integration",
      entity_id: data.id,
      description: `${data.enabled ? "تشغيل" : "إيقاف"} تكامل ${view.displayName}`,
    });
    return view;
  });

export const activateIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.activate");
    const engine = await import("./integrations.server");
    const view = await engine.setIntegrationActive(data.id);
    await guard.writeAudit(context.supabase, staff, {
      action: "integration.activate",
      entity_type: "platform_integration",
      entity_id: data.id,
      description: `اعتماد ${view.displayName} كخدمة التحقق الفعّالة`,
    });
    return view;
  });

export const deactivateOtpIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.activate");
    const engine = await import("./integrations.server");
    await engine.deactivateCategory();
    await guard.writeAudit(context.supabase, staff, {
      action: "integration.deactivate_all",
      entity_type: "platform_integration",
      description: "إلغاء اعتماد جميع تكاملات خدمة التحقق",
    });
    return { ok: true as const };
  });

export const removeIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.manage");
    const engine = await import("./integrations.server");
    const view = await engine.getIntegration(data.id);
    await engine.deleteIntegration(data.id);
    await guard.writeAudit(context.supabase, staff, {
      action: "integration.delete",
      entity_type: "platform_integration",
      entity_id: data.id,
      description: `حذف تكامل ${view.displayName} وإبطال أسراره`,
    });
    return { ok: true as const };
  });

/** إرسال رسالة اختبار حقيقية عبر التكامل المحدد للتأكد من التسليم الفعلي. */
export const sendIntegrationTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; phone: string }) =>
    z.object({ id: z.string().uuid(), phone: z.string().trim().min(6).max(24) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireStaff(context.supabase, context.userId, "integrations.test");
    const dispatch = await import("./otp-dispatch.server");
    const result = await dispatch.sendIntegrationTest(data.id, data.phone);
    await guard.writeAudit(context.supabase, staff, {
      action: "integration.test_message",
      entity_type: "platform_integration",
      entity_id: data.id,
      description: `رسالة اختبار ${result.ok ? "أُرسلت" : "فشلت"} — مرجع ${result.traceId}`,
      metadata: { ok: result.ok, code: result.code },
    });
    return result;
  });

export const refreshIntegrationHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guard = await import("@/lib/admin-guard.server");
    await guard.requireStaff(context.supabase, context.userId, "integrations.view_logs");
    const engine = await import("./integrations.server");
    return engine.runIntegrationMonitor();
  });