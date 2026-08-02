/**
 * محرك رموز التحقق (OTP) — خادم فقط.
 *
 * قواعد ثابتة:
 *  - لا يُحفظ الرمز نصاً إطلاقاً؛ تُحفظ بصمة HMAC-SHA256 فقط.
 *  - رمز واحد نشط لكل رقم وغرض، ويُستهلك مرة واحدة.
 *  - حد معدّل لكل رقم بالساعة + مدة انتظار قبل إعادة الإرسال.
 *  - كل محاولة (إرسال أو تحقق) تُسجَّل بنتيجتها ومدتها دون كشف الرقم كاملاً.
 *  - توثيق الجوال مستقل تماماً عن التحقق بخطوتين.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SMS_MESSAGES,
  maskPhone,
  type OtpPurpose,
  type SignupMode,
  type SmsHealthStatus,
  type SmsProvider,
  type SmsPublicConfig,
} from "./sms.shared";
import { sendSms, SmsProviderError, type SmsProviderConfig } from "./providers.server";

export type SmsSettingsRow = {
  enabled: boolean;
  active_provider: SmsProvider;
  provider_label: string | null;
  base_url: string | null;
  application_id: string | null;
  service_sid: string | null;
  sender_id: string | null;
  sender_name: string | null;
  default_country: string;
  default_dial_code: string;
  code_length: number;
  code_ttl_minutes: number;
  resend_wait_seconds: number;
  max_verify_attempts: number;
  rate_limit_per_hour: number;
  message_template: string;
  message_language: string;
  test_mode: boolean;
  signup_mode: SignupMode;
  show_phone_field: boolean;
  require_phone: boolean;
  hide_phone_when_disabled: boolean;
  allow_signup_during_outage: boolean;
  show_outage_notice: boolean;
  emergency_email_only: boolean;
  alert_admin_on_failure: boolean;
  api_key_hint: string | null;
  api_secret_hint: string | null;
  health_status: SmsHealthStatus;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_reason: string | null;
  last_trace_ref: string | null;
  updated_at: string;
};

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newSmsTraceRef(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += REF_ALPHABET[byte % REF_ALPHABET.length];
  return `MS-${out}`;
}

export async function loadSmsSettings(): Promise<SmsSettingsRow> {
  const { data, error } = await supabaseAdmin.from("sms_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) throw new Error("تعذّر قراءة إعدادات خدمة الرسائل.");
  return data as unknown as SmsSettingsRow;
}

/** الإعدادات التي تُرسل للمتصفح: لا تحتوي أي مفاتيح أو روابط أو معرّفات مزوّد. */
export function toPublicConfig(row: SmsSettingsRow): SmsPublicConfig {
  const outage = row.health_status === "unavailable" || row.emergency_email_only;
  const mode: SignupMode = row.enabled ? row.signup_mode : "disabled";
  const requireVerification = mode === "required_verified" && row.enabled && !outage;
  return {
    smsEnabled: row.enabled && !row.emergency_email_only,
    signupMode: mode,
    showPhoneField: mode === "disabled" ? !row.hide_phone_when_disabled : row.show_phone_field,
    requirePhone:
      row.require_phone || mode === "required_verified" || mode === "required_unverified_allowed" || mode === "outage_bypass",
    requireVerification,
    allowSignupDuringOutage: row.allow_signup_during_outage,
    showOutageNotice: row.show_outage_notice && outage,
    outage,
    defaultDialCode: row.default_dial_code,
    codeLength: row.code_length,
    codeTtlMinutes: row.code_ttl_minutes,
    resendWaitSeconds: row.resend_wait_seconds,
    testMode: row.test_mode,
  };
}

export function providerConfig(row: SmsSettingsRow): SmsProviderConfig {
  return {
    provider: row.active_provider,
    baseUrl: row.base_url,
    applicationId: row.application_id,
    serviceSid: row.service_sid,
    senderId: row.sender_id,
    senderName: row.sender_name,
  };
}

async function hmacHex(value: string): Promise<string> {
  const secret = process.env["MEHLA_BLIND_INDEX_KEY_V1"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashInput(purpose: OtpPurpose, phone: string, code: string): string {
  return `${purpose}:${phone}:${code}`;
}

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += String(byte % 10);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SmsLogInput = {
  provider: string;
  purpose: OtpPurpose;
  action: "send" | "resend" | "verify" | "test";
  phone: string;
  outcome: "success" | "failure" | "rate_limited" | "invalid_code" | "expired";
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  referenceId?: string | null;
  traceRef: string;
  ip?: string | null;
  device?: string | null;
};

export async function logSms(input: SmsLogInput): Promise<void> {
  await supabaseAdmin.from("sms_delivery_logs").insert({
    provider: input.provider,
    purpose: input.purpose,
    action: input.action,
    phone_masked: maskPhone(input.phone),
    outcome: input.outcome,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
    latency_ms: input.latencyMs ?? null,
    reference_id: input.referenceId ?? null,
    trace_ref: input.traceRef,
    ip: input.ip ?? null,
    device: input.device ?? null,
  } as never);
}

async function recordHealth(
  status: SmsHealthStatus,
  patch: { reason?: string | null; traceRef?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("sms_settings")
    .update({
      health_status: status,
      last_error_reason: patch.reason ?? null,
      last_trace_ref: patch.traceRef ?? null,
      ...(status === "operational" ? { last_success_at: now } : { last_failure_at: now }),
    } as never)
    .eq("id", true);
}

export type RequestOtpInput = {
  phone: string;
  purpose: OtpPurpose;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  device?: string | null;
  userAgent?: string | null;
  /** مفتاح منع التكرار: نفس المفتاح لا يُنتج إرسالاً ثانياً. */
  idempotencyKey?: string | null;
};

export type RequestOtpResult = {
  traceRef: string;
  expiresAt: string;
  resendAfterSeconds: number;
  codeLength: number;
  testMode: boolean;
  delivered: boolean;
  /** true عندما يُعاد نفس الطلب السابق بلا إرسال جديد. */
  deduplicated?: boolean;
};

export class SmsFlowError extends Error {
  code: string;
  traceRef: string | null;
  constructor(code: string, message: string, traceRef: string | null = null) {
    super(traceRef ? `${message} (مرجع: ${traceRef})` : message);
    this.code = code;
    this.traceRef = traceRef;
  }
}

/** إرسال رمز تحقق جديد مع فرض حد المعدّل ومدة الانتظار. */
export async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const settings = await loadSmsSettings();
  const traceRef = newSmsTraceRef();
  if (!settings.enabled || settings.emergency_email_only) {
    throw new SmsFlowError("SMS_DISABLED", SMS_MESSAGES.disabled);
  }

  // منع التكرار عند الضغط المتكرر: نفس المفتاح يعيد نتيجة الطلب الأول.
  if (input.idempotencyKey) {
    const { data: duplicate } = await supabaseAdmin
      .from("otp_verifications")
      .select("trace_ref, expires_at, delivery_status")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    const existing = duplicate as { trace_ref: string | null; expires_at: string; delivery_status: string } | null;
    if (existing) {
      return {
        traceRef: existing.trace_ref ?? traceRef,
        expiresAt: existing.expires_at,
        resendAfterSeconds: settings.resend_wait_seconds,
        codeLength: settings.code_length,
        testMode: settings.test_mode,
        delivered: existing.delivery_status !== "failed",
        deduplicated: true,
      };
    }
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("otp_verifications")
    .select("id, created_at")
    .eq("phone_e164", input.phone)
    .eq("purpose", input.purpose)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });
  const history = (recent ?? []) as { id: string; created_at: string }[];

  if (history.length >= settings.rate_limit_per_hour) {
    await logSms({
      provider: settings.active_provider,
      purpose: input.purpose,
      action: "send",
      phone: input.phone,
      outcome: "rate_limited",
      traceRef,
      ip: input.ip ?? null,
      device: input.device ?? null,
    });
    throw new SmsFlowError("RATE_LIMITED", SMS_MESSAGES.rateLimited, traceRef);
  }

  const last = history[0];
  if (last) {
    const waited = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (waited < settings.resend_wait_seconds) {
      const remaining = Math.ceil(settings.resend_wait_seconds - waited);
      throw new SmsFlowError(
        "RESEND_TOO_SOON",
        `يمكنك طلب رمز جديد بعد ${remaining} ثانية.`,
      );
    }
  }

  // اختيار المزوّد قبل توليد الرمز: المركز أولاً، والمسار القديم رجوع انتقالي فقط.
  const dispatch = await import("@/lib/integrations/otp-dispatch.server");
  const target = await dispatch.resolveDispatchTarget();
  if (target.mode === "blocked") {
    await logSms({
      provider: "integration",
      purpose: input.purpose,
      action: "send",
      phone: input.phone,
      outcome: "failure",
      errorCode: target.code,
      errorMessage: target.message,
      traceRef,
      ip: input.ip ?? null,
      device: input.device ?? null,
    });
    await recordHealth("unavailable", { reason: target.code, traceRef });
    throw new SmsFlowError(target.code, target.message, traceRef);
  }

  const remoteVerification = target.mode === "integration" && target.remoteVerification;
  const providerName = target.mode === "integration" ? target.providerKey : settings.active_provider;
  const code = randomCode(settings.code_length);
  const codeHash = await hmacHex(hashInput(input.purpose, input.phone, code));
  const expiresAt = new Date(Date.now() + settings.code_ttl_minutes * 60_000).toISOString();

  // إبطال أي رمز نشط سابق لنفس الرقم والغرض: رمز واحد فعّال فقط، ومزوّد واحد فقط.
  await supabaseAdmin
    .from("otp_verifications")
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("phone_e164", input.phone)
    .eq("purpose", input.purpose)
    .is("consumed_at", null);

  // حجز صف الرمز قبل الإرسال: الفهرس الفريد يمنع إرسال رمزين متزامنين لنفس الطلب.
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("otp_verifications")
    .insert({
      purpose: input.purpose,
      phone_e164: input.phone,
      code_hash: codeHash,
      user_id: input.userId ?? null,
      email: input.email ?? null,
      max_attempts: settings.max_verify_attempts,
      expires_at: expiresAt,
      provider: providerName,
      integration_id: target.mode === "integration" ? target.integrationId : null,
      dispatch_source: settings.test_mode ? "test_mode" : target.mode === "integration" ? "integration" : "legacy",
      idempotency_key: input.idempotencyKey ?? null,
      remote_verification: remoteVerification,
      delivery_status: "queued",
      ip: input.ip ?? null,
      device: input.device ?? null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      trace_ref: traceRef,
      dispatch_trace: traceRef,
    } as never)
    .select("id")
    .maybeSingle();

  if (reservationError || !reservation) {
    if (String((reservationError as { code?: string } | null)?.code) === "23505") {
      throw new SmsFlowError("SEND_IN_PROGRESS", "طلب إرسال رمز قيد التنفيذ لهذا الرقم. انتظر قليلاً.", traceRef);
    }
    throw new SmsFlowError("SEND_FAILED", SMS_MESSAGES.sendFailed, traceRef);
  }
  const reservationId = String((reservation as { id: string }).id);

  const text = settings.message_template
    .replace(/\{\{\s*code\s*\}\}/g, code)
    .replace(/\{\{\s*minutes\s*\}\}/g, String(settings.code_ttl_minutes));

  let reference: string | null = null;
  let latencyMs: number | null = null;
  let delivered = false;

  if (settings.test_mode) {
    await supabaseAdmin
      .from("otp_verifications")
      .update({ delivery_status: "test" } as never)
      .eq("id", reservationId);
  } else {
    try {
      if (target.mode === "integration") {
        const outcome = await dispatch.dispatchOtpText(target, {
          phone: input.phone,
          text,
          code: remoteVerification ? null : code,
          purpose: input.purpose,
          traceRef,
        });
        reference = outcome.reference;
        latencyMs = outcome.latencyMs;
      } else {
        const result = await sendSms(providerConfig(settings), { to: input.phone, text });
        reference = result.reference;
        latencyMs = result.latencyMs;
      }
      delivered = true;
      await supabaseAdmin
        .from("otp_verifications")
        .update({ delivery_status: "sent", provider_reference: reference } as never)
        .eq("id", reservationId);
      await recordHealth("operational", { reason: null, traceRef });
    } catch (error) {
      const anyError = error as { code?: string; message?: string };
      const failureCode =
        error instanceof SmsProviderError
          ? error.code
          : (anyError?.code ?? "SEND_FAILED");
      const reason = error instanceof Error ? error.message.slice(0, 400) : "unknown";
      // الطلب الفاشل لا يترك رمزاً قابلاً للاستخدام، ولا يُحوَّل صامتاً لمزوّد آخر.
      await supabaseAdmin
        .from("otp_verifications")
        .update({ delivery_status: "failed", consumed_at: new Date().toISOString() } as never)
        .eq("id", reservationId);
      await logSms({
        provider: providerName,
        purpose: input.purpose,
        action: "send",
        phone: input.phone,
        outcome: "failure",
        errorCode: failureCode,
        errorMessage: reason,
        traceRef,
        ip: input.ip ?? null,
        device: input.device ?? null,
      });
      await recordHealth("unavailable", { reason, traceRef });
      throw new SmsFlowError(failureCode, SMS_MESSAGES.sendFailed, traceRef);
    }
  }

  await logSms({
    provider: providerName,
    purpose: input.purpose,
    action: last ? "resend" : "send",
    phone: input.phone,
    outcome: "success",
    latencyMs,
    referenceId: reference,
    traceRef,
    ip: input.ip ?? null,
    device: input.device ?? null,
  });

  return {
    traceRef,
    expiresAt,
    resendAfterSeconds: settings.resend_wait_seconds,
    codeLength: settings.code_length,
    testMode: settings.test_mode,
    delivered,
  };
}

export type VerifyOtpInput = {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  ip?: string | null;
  device?: string | null;
};

/** تحقق من الرمز واستهلاكه مرة واحدة. يرمي خطأ عربياً واضحاً عند الفشل. */
export async function verifyOtp(input: VerifyOtpInput): Promise<{ traceRef: string; userId: string | null }> {
  const settings = await loadSmsSettings();
  const { data } = await supabaseAdmin
    .from("otp_verifications")
    .select(
      "id, code_hash, attempts, max_attempts, expires_at, consumed_at, trace_ref, user_id, provider, integration_id, provider_reference, remote_verification",
    )
    .eq("phone_e164", input.phone)
    .eq("purpose", input.purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as
    | {
        id: string;
        code_hash: string;
        attempts: number;
        max_attempts: number;
        expires_at: string;
        trace_ref: string | null;
        user_id: string | null;
        provider: string | null;
        integration_id: string | null;
        provider_reference: string | null;
        remote_verification: boolean | null;
      }
    | null;

  const traceRef = row?.trace_ref ?? newSmsTraceRef();
  const providerName = row?.provider ?? settings.active_provider;
  const fail = async (
    outcome: "invalid_code" | "expired",
    code: string,
    message: string,
  ): Promise<never> => {
    await logSms({
      provider: providerName,
      purpose: input.purpose,
      action: "verify",
      phone: input.phone,
      outcome,
      errorCode: code,
      traceRef,
      ip: input.ip ?? null,
      device: input.device ?? null,
    });
    throw new SmsFlowError(code, message, traceRef);
  };

  if (!row) await fail("expired", "EXPIRED", SMS_MESSAGES.expiredCode);
  if (new Date(row!.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("otp_verifications")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("id", row!.id);
    await fail("expired", "EXPIRED", SMS_MESSAGES.expiredCode);
  }
  if (row!.attempts >= row!.max_attempts) {
    await supabaseAdmin
      .from("otp_verifications")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("id", row!.id);
    await fail("invalid_code", "TOO_MANY_ATTEMPTS", SMS_MESSAGES.tooManyAttempts);
  }

  const submitted = await hmacHex(hashInput(input.purpose, input.phone, input.code.replace(/\D/g, "")));
  // التحقق يجري عند المزوّد نفسه الذي أرسل الرمز عند دعمه ذلك، وإلا محلياً.
  let verified: boolean;
  if (row!.remote_verification && row!.integration_id) {
    const dispatch = await import("@/lib/integrations/otp-dispatch.server");
    try {
      const remote = await dispatch.dispatchOtpVerify({
        integrationId: row!.integration_id,
        phone: input.phone,
        code: input.code.replace(/\D/g, ""),
        referenceId: row!.provider_reference,
        traceRef,
      });
      verified = remote ?? timingSafeEqual(submitted, row!.code_hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذّر التحقق من الرمز.";
      await logSms({
        provider: providerName,
        purpose: input.purpose,
        action: "verify",
        phone: input.phone,
        outcome: "failure",
        errorCode: "VERIFY_FAILED",
        errorMessage: message,
        traceRef,
        ip: input.ip ?? null,
        device: input.device ?? null,
      });
      throw new SmsFlowError("VERIFY_FAILED", message, traceRef);
    }
  } else {
    verified = timingSafeEqual(submitted, row!.code_hash);
  }

  if (!verified) {
    await supabaseAdmin
      .from("otp_verifications")
      .update({ attempts: row!.attempts + 1 } as never)
      .eq("id", row!.id);
    await fail("invalid_code", "INVALID_CODE", SMS_MESSAGES.invalidCode);
  }

  await supabaseAdmin
    .from("otp_verifications")
    .update({ consumed_at: new Date().toISOString(), delivery_status: "delivered" } as never)
    .eq("id", row!.id);

  await logSms({
    provider: providerName,
    purpose: input.purpose,
    action: "verify",
    phone: input.phone,
    outcome: "success",
    traceRef,
    ip: input.ip ?? null,
    device: input.device ?? null,
  });

  return { traceRef, userId: row!.user_id };
}

/** رسالة اختبار من لوحة الإدارة — تتحقق من صحة المفاتيح والمُرسل فعلياً. */
export async function sendTestMessage(phone: string): Promise<{ traceRef: string; reference: string | null }> {
  const settings = await loadSmsSettings();
  const traceRef = newSmsTraceRef();
  // الاختبار يمر بنفس مسار الإرسال الحقيقي: التكامل المعتمد أولاً.
  const dispatch = await import("@/lib/integrations/otp-dispatch.server");
  const target = await dispatch.resolveDispatchTarget();
  if (target.mode === "blocked") {
    throw new SmsFlowError(target.code, target.message, traceRef);
  }
  if (target.mode === "integration") {
    const outcome = await dispatch.sendIntegrationTest(target.integrationId, phone);
    await logSms({
      provider: target.providerKey,
      purpose: "phone_verification",
      action: "test",
      phone,
      outcome: outcome.ok ? "success" : "failure",
      errorCode: outcome.code,
      errorMessage: outcome.ok ? null : outcome.message,
      referenceId: outcome.reference,
      traceRef: outcome.traceId,
    });
    if (!outcome.ok) throw new SmsFlowError(outcome.code ?? "SEND_FAILED", outcome.message, outcome.traceId);
    await recordHealth("operational", { reason: null, traceRef: outcome.traceId });
    return { traceRef: outcome.traceId, reference: outcome.reference };
  }
  try {
    const result = await sendSms(providerConfig(settings), {
      to: phone,
      text: `رسالة اختبار من منصة مِهلة — مرجع ${traceRef}.`,
    });
    await recordHealth("operational", { reason: null, traceRef });
    await logSms({
      provider: settings.active_provider,
      purpose: "phone_verification",
      action: "test",
      phone,
      outcome: "success",
      latencyMs: result.latencyMs,
      referenceId: result.reference,
      traceRef,
    });
    return { traceRef, reference: result.reference };
  } catch (error) {
    const code = error instanceof SmsProviderError ? error.code : "SEND_FAILED";
    const reason = error instanceof Error ? error.message.slice(0, 400) : "unknown";
    await recordHealth("unavailable", { reason, traceRef });
    await logSms({
      provider: settings.active_provider,
      purpose: "phone_verification",
      action: "test",
      phone,
      outcome: "failure",
      errorCode: code,
      errorMessage: reason,
      traceRef,
    });
    throw new SmsFlowError(code, `تعذّر إرسال رسالة الاختبار: ${reason}`, traceRef);
  }
}