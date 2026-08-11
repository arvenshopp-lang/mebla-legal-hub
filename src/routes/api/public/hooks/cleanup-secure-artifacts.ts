import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

/**
 * Scheduled janitor endpoint (pg_cron → pg_net).
 *
 * Purges expired watermark tickets and their transient storage artefacts.
 * Public prefix, so the caller is verified here with the private cron secret.
 */

async function handle(request: Request) {
  const denied = await guardCronRequest(request);
  if (denied) return denied;

  try {
    const { runSecureArtifactCleanup } = await import("@/lib/secure-view/cleanup.server");
    const report = await runSecureArtifactCleanup();
    return new Response(JSON.stringify({ success: true, ...report }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[cleanup-secure-artifacts]", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ success: false, error: "cleanup_failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/cleanup-secure-artifacts")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
