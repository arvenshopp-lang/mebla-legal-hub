import { createFileRoute } from "@tanstack/react-router";

/**
 * مسار استقبال رسائل مزودي الدفع.
 * عام بالضرورة (يستدعيه المزوّد)، ومحمي داخلياً بقائمة سماح وتحقق توقيع إلزامي.
 * لا يُرجع هذا المسار أي أسرار أو تفاصيل داخلية أو أثر تنفيذ.
 */
export const Route = createFileRoute("/api/public/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { handleProviderWebhook } = await import("@/lib/billing/webhooks.server");
          const outcome = await handleProviderWebhook(params.provider, request);
          return Response.json(outcome.body, { status: outcome.status });
        } catch {
          return Response.json({ error: "تعذّر معالجة الرسالة." }, { status: 500 });
        }
      },
      GET: async () => Response.json({ error: "طريقة غير مدعومة." }, { status: 405 }),
    },
  },
});
