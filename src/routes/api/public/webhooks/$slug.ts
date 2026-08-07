import { createFileRoute } from "@tanstack/react-router";

/**
 * بوابة استقبال الويب هوك لأي مزوّد: `/api/public/webhooks/<slug>`.
 * عامة بالضرورة (المزوّد هو المُستدعي)، ومحمية داخلياً بتحقّق إلزامي
 * من التوقيع أو الرمز السرّي داخل محرك البوابة.
 */
export const Route = createFileRoute("/api/public/webhooks/$slug")({
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
