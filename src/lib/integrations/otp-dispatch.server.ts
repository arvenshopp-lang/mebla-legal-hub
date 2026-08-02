/**
 * جسر التوصيل الموحّد بين محرك رموز التحقق (OtpService) ومركز التكاملات — خادم فقط.
 *
 * قواعد ثابتة:
 *  - محرك الرموز لا يعرف أي مزوّد؛ يطلب «أرسل هذا النص لهذا الرقم» فقط.
 *  - إن وُجد أي تكامل مهيأ في المركز فهو المرجع الوحيد: لا رجوع صامت للإعدادات القديمة
 *    عند فشل المفاتيح، بل يظهر المزوّد فاشلاً ويُرفض الطلب.
 *  - الرجوع للإعدادات القديمة انتقالي فقط: يُستخدم حين لا يوجد أي تكامل مهيأ، ويُسجَّل صراحة.
 *  - التحقق يتم عبر التكامل نفسه الذي أرسل الرمز (تثبيت المزوّد).
 *  - قاطع دائرة: بعد فشل متكرر قريب يُرفض الطلب فوراً بدل إغراق المزوّد.
 */
import {
  newTraceId,
  recordRuntimeOutcome,
  resolveActiveOtpIntegration,
  buildContextForIntegration,
  countOtpIntegrations,
  type ActiveOtpIntegration,
} from "./integrations.server";
import { safeErrorMessage } from "./integrations.shared";

/** حد قاطع الدائرة: عدد الأعطال المتتالية ومدة التهدئة. */
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 3 * 60_000;

export type DispatchSource = "integration" | "legacy";

export type DispatchTarget =
  | {
      mode: "integration";
      integrationId: string;
      providerKey: string;
      displayName: string;
      remoteVerification: boolean;
      active: ActiveOtpIntegration;
    }
  | { mode: "legacy"; providerKey: null }
  | { mode: "blocked"; code: string; message: string };

export type DispatchOutcome = {
  /** اسم المزوّد المُستخدم فعلياً — لسجل الرسائل فقط، ولا يُعاد للمتصفح. */
  provider: string;
  integrationId: string | null;
  reference: string | null;
  latencyMs: number;
  /** true عندما تولّد المنصة الرمز وتتحقق منه محلياً. */
  localVerification: boolean;
  source: DispatchSource;
};

export class DispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly traceId: string,
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

function circuitOpen(active: ActiveOtpIntegration): boolean {
  if (active.view.consecutiveFailures < CIRCUIT_FAILURE_THRESHOLD) return false;
  const lastFailure = active.view.lastFailureAt ? new Date(active.view.lastFailureAt).getTime() : 0;
  return Date.now() - lastFailure < CIRCUIT_COOLDOWN_MS;
}

/**
 * اختيار مسار الإرسال قبل توليد أي رمز.
 * ترتيب القرار: التكامل المعتمد ← منع الإرسال إن كان المركز مهيأ لكن غير جاهز ← الإعدادات القديمة.
 */
export async function resolveDispatchTarget(): Promise<DispatchTarget> {
  const active = await resolveActiveOtpIntegration();
  if (active) {
    if (circuitOpen(active)) {
      return {
        mode: "blocked",
        code: "CIRCUIT_OPEN",
        message: "خدمة إرسال الرموز متوقفة مؤقتاً بعد أعطال متكررة. أعد المحاولة بعد قليل.",
      };
    }
    return {
      mode: "integration",
      integrationId: active.view.id,
      providerKey: active.view.providerKey,
      displayName: active.view.displayName,
      remoteVerification: active.capabilities.remoteVerification,
      active,
    };
  }

  // مركز التكاملات مهيأ لكن لا يوجد تكامل معتمد وجاهز: لا تحويل صامت للمسار القديم.
  if ((await countOtpIntegrations()) > 0) {
    return {
      mode: "blocked",
      code: "INTEGRATION_NOT_READY",
      message: "لا يوجد مزوّد تحقق معتمد وجاهز حالياً. تحقّق من مركز التكاملات.",
    };
  }

  console.warn(
    "[otp-dispatch] استخدام الإعدادات القديمة كمسار انتقالي: لا يوجد أي تكامل مهيأ في مركز التكاملات.",
  );
  return { mode: "legacy", providerKey: null };
}

/** إرسال نص الرمز عبر التكامل المعتمد. يرمي DispatchError برسالة عربية آمنة عند الفشل. */
export async function dispatchOtpText(
  target: Extract<DispatchTarget, { mode: "integration" }>,
  input: {
    phone: string;
    text: string;
    code: string | null;
    purpose: string;
    traceRef: string;
    referenceId?: string | null;
  },
): Promise<DispatchOutcome> {
  const { active } = target;
  try {
    const result = await active.connector.sendOtp(active.context, {
      phone: input.phone,
      code: input.code,
      text: input.text,
      purpose: input.purpose,
      traceId: input.traceRef,
    });
    await recordRuntimeOutcome(active.view.id, { ok: true, latencyMs: result.latencyMs }, input.traceRef);
    return {
      provider: active.view.providerKey,
      integrationId: active.view.id,
      reference: result.reference,
      latencyMs: result.latencyMs,
      localVerification: !result.remoteVerification,
      source: "integration",
    };
  } catch (error) {
    const anyError = error as { code?: string; status?: number | null; detail?: string; message?: string };
    const code = anyError?.code ?? "PROVIDER_ERROR";
    await recordRuntimeOutcome(
      active.view.id,
      {
        ok: false,
        latencyMs: 0,
        statusCode: anyError?.status ?? null,
        code,
        detail: (anyError?.detail || anyError?.message || "").slice(0, 400),
      },
      input.traceRef,
    );
    throw new DispatchError(code, safeErrorMessage(code), input.traceRef);
  }
}

/**
 * تحقق عن بُعد عند نفس التكامل الذي أرسل الرمز (تثبيت المزوّد).
 * يعيد null عندما لا يدعم المزوّد التحقق عن بُعد فيتولّى المحرك التحقق محلياً.
 */
export async function dispatchOtpVerify(input: {
  integrationId: string;
  phone: string;
  code: string;
  referenceId: string | null;
  traceRef: string;
}): Promise<boolean | null> {
  const { getConnector } = await import("./connectors/registry.server");
  try {
    const context = await buildContextForIntegration(input.integrationId);
    const connector = getConnector(context.adapterType);
    if (!connector.getCapabilities(context).remoteVerification) return null;
    const result = await connector.verifyOtp(context, {
      phone: input.phone,
      code: input.code,
      referenceId: input.referenceId,
      traceId: input.traceRef,
    });
    if (result.detail === "NOT_SUPPORTED") return null;
    await recordRuntimeOutcome(
      input.integrationId,
      { ok: true, latencyMs: result.latencyMs ?? 0 },
      input.traceRef,
    );
    return result.verified;
  } catch (error) {
    const anyError = error as { code?: string; status?: number | null; detail?: string; message?: string };
    await recordRuntimeOutcome(
      input.integrationId,
      {
        ok: false,
        latencyMs: 0,
        statusCode: anyError?.status ?? null,
        code: anyError?.code ?? "PROVIDER_ERROR",
        detail: (anyError?.detail || anyError?.message || "").slice(0, 400),
      },
      input.traceRef,
    );
    throw new DispatchError(
      anyError?.code ?? "PROVIDER_ERROR",
      safeErrorMessage(anyError?.code ?? "PROVIDER_ERROR"),
      input.traceRef,
    );
  }
}

/** رسالة اختبار حقيقية من لوحة الإدارة عبر تكامل محدد بعينه. */
export async function sendIntegrationTest(
  integrationId: string,
  phone: string,
): Promise<{ ok: boolean; traceId: string; code: string | null; message: string; reference: string | null }> {
  const engine = await import("./integrations.server");
  const { getConnector } = await import("./connectors/registry.server");
  const traceId = newTraceId();
  const view = await engine.getIntegration(integrationId);
  const context = await buildContextForIntegration(integrationId);
  const connector = getConnector(context.adapterType);

  try {
    const result = await connector.sendOtp(context, {
      phone,
      code: null,
      text: `رسالة اختبار من منصة مِهلة — مرجع ${traceId}.`,
      purpose: "phone_verification",
      traceId,
    });
    await engine.recordRuntimeOutcome(view.id, { ok: true, latencyMs: result.latencyMs }, traceId);
    return {
      ok: true,
      traceId,
      code: null,
      message: "تم إرسال رسالة الاختبار بنجاح.",
      reference: result.reference,
    };
  } catch (error) {
    const anyError = error as { code?: string; status?: number | null; detail?: string; message?: string };
    const code = anyError?.code ?? "PROVIDER_ERROR";
    await engine.recordRuntimeOutcome(
      view.id,
      {
        ok: false,
        latencyMs: 0,
        statusCode: anyError?.status ?? null,
        code,
        detail: (anyError?.detail || anyError?.message || "").slice(0, 400),
      },
      traceId,
    );
    return { ok: false, traceId, code, message: safeErrorMessage(code), reference: null };
  }
}
