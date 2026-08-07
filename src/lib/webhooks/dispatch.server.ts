/**
 * المُوجِّه الداخلي: يستقبل الحدث الموحّد ويسلّمه للمعالجات المسجّلة.
 *
 * لا معالجات مسجّلة في هذه المرحلة، فكل حدث موثّق يُسجَّل بحالة «بلا معالج»
 * ويُعرض في لوحة الإدارة. ربط الأحداث بمحرك الإشعارات أو أي وحدة أخرى
 * يتم بإضافة مُعالج هنا دون أي تعديل في المسار أو طبقة التحقق.
 */
import type { NormalizedWebhookEvent } from "./adapters/base.server";

export type WebhookHandlerContext = {
  slug: string;
  adapterType: string;
  testMode: boolean;
  correlationId: string;
};

export type WebhookHandler = (
  event: NormalizedWebhookEvent,
  context: WebhookHandlerContext,
) => Promise<void>;

/** مفتاح الخريطة: `<slug>:<type>` أو `*:<type>` لأي مزوّد. */
const HANDLERS: Record<string, WebhookHandler> = {};

export function resolveHandler(slug: string, type: string): WebhookHandler | null {
  return HANDLERS[`${slug}:${type}`] ?? HANDLERS[`*:${type}`] ?? null;
}

export type DispatchOutcome = { status: "processed" | "ignored" | "failed"; error?: string };

export async function dispatchNormalizedEvents(
  events: NormalizedWebhookEvent[],
  context: WebhookHandlerContext,
): Promise<DispatchOutcome> {
  let handled = 0;
  for (const event of events) {
    const handler = resolveHandler(context.slug, event.type);
    if (!handler) continue;
    try {
      await handler(event, context);
      handled += 1;
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "تعذّر تنفيذ معالج الحدث.",
      };
    }
  }
  return { status: handled > 0 ? "processed" : "ignored" };
}