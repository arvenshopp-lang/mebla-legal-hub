import { createFileRoute } from "@tanstack/react-router";

/**
 * اسم مستعار قصير: `https://mehlalex.com/api/webhook?provider=<slug>`.
 * نفس محرك البوابة ونفس التحقق الإلزامي — الرابط الموصى به للمزوّدين هو
 * `/api/public/webhooks/<slug>` لأنه مضمون التجاوز لبوابة المصادقة دائماً.
 */
function resolveSlug(request: Request): string {
  const url = new URL(request.url);
  return (
    url.searchParams.get("provider") ??
    url.searchParams.get("endpoint") ??
    request.headers.get("x-mehla-endpoint") ??
    ""
  ).trim();
}

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const slug = resolveSlug(request);
        if (!slug) return Response.json({ error: "missing_provider" }, { status: 400 });
        try {
          const { handleIncomingWebhook } = await import("@/lib/webhooks/gateway.server");
          return await handleIncomingWebhook(slug, request);
        } catch {
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        const slug = resolveSlug(request);
        if (!slug) return Response.json({ error: "missing_provider" }, { status: 400 });
        try {
          const { handleWebhookVerification } = await import("@/lib/webhooks/gateway.server");
          return await handleWebhookVerification(slug, request);
        } catch {
          return Response.json({ error: "internal_error" }, { status: 500 });
        }
      },
    },
  },
});
