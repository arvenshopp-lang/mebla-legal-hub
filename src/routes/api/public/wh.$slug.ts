import { createFileRoute } from "@tanstack/react-router";

/**
 * مسار استقبال قصير مكافئ تماماً لـ `/api/public/webhooks/<slug>`.
 * وُجد لأن بعض المزوّدين (مثل Whats Line) يحدّون طول عمود رابط الويب هوك،
 * ويستدعي نفس محرك البوابة بنفس التحقق الإلزامي وتسجيل الأحداث.
 */
export const Route = createFileRoute("/api/public/wh/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { handleIncomingWebhook } = await import("@/lib/webhooks/gateway.server");
          return await handleIncomingWebhook(params.slug, request);
        } catch {
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
      GET: async ({ request, params }) => {
        try {
          const { handleWebhookVerification } = await import("@/lib/webhooks/gateway.server");
          return await handleWebhookVerification(params.slug, request);
        } catch {
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
    },
  },
});
