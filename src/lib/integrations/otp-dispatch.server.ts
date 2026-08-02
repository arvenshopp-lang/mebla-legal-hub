/**
 * جسر التوصيل بين محرك الرموز (OtpService) ومركز التكاملات.
 *
 * محرك الرموز لا يعرف أي مزوّد: يطلب «أرسل هذا النص لهذا الرقم» فقط.
 * إن وُجد تكامل معتمد في المركز يُستخدم، وإلا يعود المحرك لإعدادات الرسائل القديمة
 * حتى تُهاجر تهيئتها إلى المركز — دون أي انقطاع في الخدمة.
 */
import { newTraceId, recordRuntimeOutcome, resolveActiveOtpIntegration } from "./integrations.server";
import { safeErrorMessage } from "./integrations.shared";

export type DispatchOutcome = {
  /** اسم المزوّد المُستخدم فعلياً لتسجيله في سجل الرسائل. */
  provider: string;
  reference: string | null;
  latencyMs: number;
  /** true عندما تولّد المنصة الرمز وتتحقق منه محلياً. */
  localVerification: boolean;
  source: "integration" | "legacy";
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

/** هل يوجد تكامل معتمد يغطي إرسال الرموز؟ */
export async function integrationConfigured(): Promise<boolean> {
  return (await resolveActiveOtpIntegration()) !== null;
}

/**
 * إرسال نص رمز التحقق. يرمي DispatchError برسالة عربية آمنة عند الفشل،
 * ويعيد `null` عندما لا يوجد تكامل معتمد ليتولّى المتصل المسار القديم.
 */
export async function dispatchOtpText(input: {
  phone: string;
  text: string;
  code: string | null;
  purpose: string;
  traceRef: string;
}): Promise<DispatchOutcome | null> {
  const active = await resolveActiveOtpIntegration();
  if (!active) return null;

  try {
    const result = await active.connector.sendOtp(active.context, {
      phone: input.phone,
      code: input.code,
      text: input.text,
      purpose: input.purpose,
      traceId: input.traceRef,
    });
    await recordRuntimeOutcome(
      active.view.id,
      { ok: true, latencyMs: result.latencyMs },
      input.traceRef,
    );
    return {
      provider: active.view.providerKey,
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
 * تحقق عن بُعد عند المزوّد (Verify API). يعيد null عندما لا يدعم المزوّد ذلك،
 * فيتولّى محرك المنصة التحقق محلياً من الرمز المُخزَّن.
 */
export async function dispatchOtpVerify(input: {
  phone: string;
  code: string;
  referenceId: string | null;
  traceRef: string;
}): Promise<boolean | null> {
  const active = await resolveActiveOtpIntegration();
  if (!active || !active.capabilities.remoteVerification) return null;
  try {
    const result = await active.connector.verifyOtp(active.context, {
      phone: input.phone,
      code: input.code,
      referenceId: input.referenceId,
      traceId: input.traceRef,
    });
    if (result.detail === "NOT_SUPPORTED") return null;
    return result.verified;
  } catch {
    return null;
  }
}

/** رسالة اختبار حقيقية من لوحة الإدارة عبر تكامل محدد بالاسم. */
export async function sendIntegrationTest(
  integrationId: string,
  phone: string,
): Promise<{ ok: boolean; traceId: string; code: string | null; message: string; reference: string | null }> {
  const engine = await import("./integrations.server");
  const traceId = newTraceId();
  const view = await engine.getIntegration(integrationId);
  const active = await resolveActiveOtpIntegration();

  // الاختبار يجري على التكامل المحدد نفسه، لا على التكامل المعتمد.
  const { getConnector } = await import("./connectors/registry.server");
  const contextSource = active && active.view.id === integrationId ? active : null;
  const context = contextSource?.context ?? (await engine.buildContextForIntegration(integrationId));
  const connector = contextSource?.connector ?? getConnector(context.adapterType);

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