import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SMS_DISABLED_CONFIG,
  normalizePhone,
  type SmsPublicConfig,
} from "./sms.shared";

const phoneSchema = z.string().trim().min(6).max(24);
const codeSchema = z.string().trim().min(4).max(8);
const purposeSchema = z.enum(["signup", "phone_verification", "login_mfa", "phone_change"]);

const settingsSchema = z.object({
  enabled: z.boolean(),
  active_provider: z.enum(["infobip", "twilio", "unifonic", "custom"]),
  provider_label: z.string().trim().max(80).nullable(),
  base_url: z.string().trim().max(300).nullable(),
  application_id: z.string().trim().max(200).nullable(),
  service_sid: z.string().trim().max(200).nullable(),
  sender_id: z.string().trim().max(60).nullable(),
  sender_name: z.string().trim().max(80).nullable(),
  default_country: z.string().trim().min(2).max(2),
  default_dial_code: z.string().trim().regex(/^\+\d{1,4}$/),
  code_length: z.number().int().min(4).max(8),
  code_ttl_minutes: z.number().int().min(1).max(30),
  resend_wait_seconds: z.number().int().min(15).max(600),
  max_verify_attempts: z.number().int().min(1).max(10),
  rate_limit_per_hour: z.number().int().min(1).max(30),
  message_template: z.string().trim().min(10).max(400),
  message_language: z.enum(["ar", "en"]),
  test_mode: z.boolean(),
  signup_mode: z.enum([
    "disabled",
    "optional",
    "required_unverified_allowed",
    "required_verified",
    "outage_bypass",
  ]),
  show_phone_field: z.boolean(),
  require_phone: z.boolean(),
  hide_phone_when_disabled: z.boolean(),
  allow_signup_during_outage: z.boolean(),
  show_outage_notice: z.boolean(),
  emergency_email_only: z.boolean(),
  alert_admin_on_failure: z.boolean(),
});

/** إعدادات عامة للتسجيل وإعدادات الحساب — بلا أي مفاتيح أو روابط مزوّد. */
export const getSmsPublicConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SmsPublicConfig> => {
    try {
      const otp = await import("./otp.server");
      return otp.toPublicConfig(await otp.loadSmsSettings());
    } catch {
      return SMS_DISABLED_CONFIG;
    }
  },
);

/** طلب رمز تحقق لرقم جوال (تسجيل جديد أو توثيق لاحق). */
export const requestPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; purpose: z.infer<typeof purposeSchema>; email?: string }) =>
    z.object({ phone: phoneSchema, purpose: purposeSchema, email: z.string().trim().email().max(180).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const otp = await import("./otp.server");
    const guard = await import("@/lib/security/sensitive-guard.server");
    const settings = await otp.loadSmsSettings();
    const parsed = normalizePhone(data.phone, settings.default_dial_code);
    if (!parsed.ok) throw new Error(parsed.message);
    const meta = guard.requestSecurityMeta();
    const result = await otp.requestOtp({
      phone: parsed.e164,
      purpose: data.purpose,
      email: data.email ?? null,
      ip: meta.ip,
      device: meta.device,
      userAgent: meta.userAgent,
    });
    return { ...result, phone: parsed.e164 };
  });

/** تحقق من رمز قبل إنشاء الحساب (لا يتطلب جلسة). */
export const verifyPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string; purpose: z.infer<typeof purposeSchema> }) =>
    z.object({ phone: phoneSchema, code: codeSchema, purpose: purposeSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const otp = await import("./otp.server");
    const guard = await import("@/lib/security/sensitive-guard.server");
    const settings = await otp.loadSmsSettings();
    const parsed = normalizePhone(data.phone, settings.default_dial_code);
    if (!parsed.ok) throw new Error(parsed.message);
    const meta = guard.requestSecurityMeta();
    const { traceRef } = await otp.verifyOtp({
      phone: parsed.e164,
      purpose: data.purpose,
      code: data.code,
      ip: meta.ip,
      device: meta.device,
    });
    return { verified: true as const, phone: parsed.e164, traceRef };
  });

/** حالة رقم الجوال والتحقق بخطوتين للمستخدم الحالي — حالتان مستقلتان. */
export const getMyPhoneStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("phone, phone_verification_status, phone_verified_at, mfa_status")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      phone: data?.phone ?? null,
      status: (data?.phone_verification_status ?? "not_required") as string,
      verifiedAt: data?.phone_verified_at ?? null,
      mfaStatus: (data?.mfa_status ?? "disabled") as string,
    };
  });

/** توثيق رقم جوال المستخدم الحالي بعد إدخال الرمز — لا يفعّل التحقق بخطوتين. */
export const confirmMyPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; code: string }) =>
    z.object({ phone: phoneSchema, code: codeSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const otp = await import("./otp.server");
    const guard = await import("@/lib/security/sensitive-guard.server");
    const settings = await otp.loadSmsSettings();
    const parsed = normalizePhone(data.phone, settings.default_dial_code);
    if (!parsed.ok) throw new Error(parsed.message);
    const meta = guard.requestSecurityMeta();
    const { traceRef } = await otp.verifyOtp({
      phone: parsed.e164,
      purpose: "phone_verification",
      code: data.code,
      ip: meta.ip,
      device: meta.device,
    });
    const { error } = await context.supabase
      .from("profiles")
      .update({
        phone: parsed.e164,
        phone_verification_status: "verified",
        phone_verified_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error("تم التحقق من الرمز لكن تعذّر حفظ حالة التوثيق. حاول مرة أخرى.");
    return { verified: true as const, phone: parsed.e164, traceRef };
  });

/** تفعيل أو إلغاء التحقق بخطوتين عبر الرسائل — اختياري بالكامل. */
export const setSmsMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("mfa_status, phone_verification_status")
      .eq("id", context.userId)
      .maybeSingle();
    const current = (profile?.mfa_status ?? "disabled") as string;
    const hasTotp = current === "totp_enabled" || current === "both_enabled";
    if (data.enabled && profile?.phone_verification_status !== "verified") {
      throw new Error("وثّق رقم جوالك أولاً قبل تفعيل التحقق بخطوتين عبر الرسائل.");
    }
    const next = data.enabled
      ? hasTotp
        ? "both_enabled"
        : "sms_enabled"
      : hasTotp
        ? "totp_enabled"
        : "disabled";
    const { error } = await context.supabase
      .from("profiles")
      .update({ mfa_status: next })
      .eq("id", context.userId);
    if (error) throw new Error("تعذّر تحديث إعداد التحقق بخطوتين.");
    return { mfaStatus: next };
  });

/** إعدادات خدمة الرسائل الكاملة — لفريق المنصة المخوّل بإدارة الإعدادات. */
export const getSmsSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await import("@/lib/admin-guard.server");
    await admin.requireStaff(context.supabase, context.userId, "settings.manage");
    const otp = await import("./otp.server");
    const settings = await otp.loadSmsSettings();
    const providers = await import("./providers.server");
    const creds = providers.readSmsCredentials();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs } = await supabaseAdmin
      .from("sms_delivery_logs")
      .select("id, provider, purpose, action, phone_masked, outcome, error_code, error_message, latency_ms, trace_ref, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      settings,
      credentials: { hasKey: Boolean(creds.key), hasSecret: Boolean(creds.secret) },
      logs: logs ?? [],
    };
  });

/** تحديث إعدادات خدمة الرسائل — تغيير المزوّد أو نمط التسجيل دون أي تعديل برمجي. */
export const updateSmsSettingsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await import("@/lib/admin-guard.server");
    const staff = await admin.requireStaff(context.supabase, context.userId, "settings.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("sms_settings").select("*").eq("id", true).maybeSingle();
    const health = !data.enabled || data.emergency_email_only ? "disabled" : "operational";
    const { error } = await supabaseAdmin
      .from("sms_settings")
      .update({ ...data, health_status: health, updated_by: context.userId } as never)
      .eq("id", true);
    if (error) throw new Error("تعذّر حفظ إعدادات خدمة الرسائل.");
    await supabaseAdmin.from("admin_audit_logs").insert({
      actor_email: staff.email,
      action: "sms_settings.update",
      entity_type: "sms_settings",
      description: "تحديث إعدادات خدمة الرسائل النصية وتوثيق الجوال",
      before_data: before ?? null,
      after_data: data,
    } as never);
    return { saved: true as const };
  });

/** رسالة اختبار فعلية للتأكد من صحة المزوّد والمفاتيح. */
export const sendTestSmsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await import("@/lib/admin-guard.server");
    await admin.requireStaff(context.supabase, context.userId, "settings.manage");
    const otp = await import("./otp.server");
    const settings = await otp.loadSmsSettings();
    const parsed = normalizePhone(data.phone, settings.default_dial_code);
    if (!parsed.ok) throw new Error(parsed.message);
    return otp.sendTestMessage(parsed.e164);
  });