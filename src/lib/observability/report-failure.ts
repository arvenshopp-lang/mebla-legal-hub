/**
 * مساعد الواجهة: يُسجّل العطل في السجل الداخلي ويُعيد معرّف التعرّف لعرضه
 * للمستخدم داخل رسالة عامة، دون أي تفاصيل تقنية.
 */
import { reportFailure } from "./failure-log.functions";

type Surface = "secure_view" | "support_ticket" | "support_message" | "support_rating" | "print";

/** يستخرج رسالة مفهومة من أي شكل خطأ (Error أو خطأ قاعدة بيانات أو نص). */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.code, e.message, e.details, e.hint]
      .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
      .map(String)
      .filter((part) => part.trim().length > 0);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  }
  return "";
}

export async function trackFailure(input: {
  surface: Surface;
  action: string;
  error?: unknown;
  organizationId?: string | null;
  ticketId?: string | null;
  documentId?: string | null;
}): Promise<string | null> {
  const message = describeError(input.error);
  try {
    const res = await reportFailure({
      data: {
        surface: input.surface,
        action: input.action,
        message: message.slice(0, 600),
        organizationId: input.organizationId ?? null,
        ticketId: input.ticketId ?? null,
        documentId: input.documentId ?? null,
        path: typeof window === "undefined" ? "" : window.location.pathname.slice(0, 200),
      },
    });
    return res.ref;
  } catch {
    return null;
  }
}

/** وصف موحّد يُذكر فيه معرّف التعرّف عند توفّره. */
export function failureHint(ref: string | null, fallback: string): string {
  return ref ? `${fallback} · معرّف التعرّف: ${ref}` : fallback;
}
