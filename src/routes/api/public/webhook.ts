import { createFileRoute } from "@tanstack/react-router";

/**
 * مسار توافقي مبسّط: `/api/public/webhook?provider=<slug>`.
 * بعض المزوّدين لا يقبلون مساراً بمقاطع متغيّرة، فيُقرأ المُعرّف من المعامل
 * أو من ترويسة `x-mehla-endpoint`، ثم يُمرَّر لنفس المحرك بنفس التحقق تماماً.
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

export const Route = createFileRoute("/api/public/webhook")({
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