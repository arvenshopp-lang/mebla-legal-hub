/**
 * مساعد الواجهة: يُسجّل العطل في السجل الداخلي ويُعيد معرّف التعرّف لعرضه
 * للمستخدم داخل رسالة عامة، دون أي تفاصيل تقنية.
 */
import { reportFailure } from "./failure-log.functions";

type Surface = "secure_view" | "support_ticket" | "support_message" | "support_rating" | "print";

export async function trackFailure(input: {
  surface: Surface;
  action: string;
  error?: unknown;
  organizationId?: string | null;
  ticketId?: string | null;
  documentId?: string | null;
}): Promise<string | null> {
  const message =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
        ? input.error
        : "";
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
