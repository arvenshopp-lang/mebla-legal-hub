/**
 * مسار دوري لحارس التشغيل: يقيس نبضات المهام والطوابير ويفتح/يغلق الحوادث.
 * عام بحكم البادئة، لذا التوثيق بسر التشغيل الخاص فقط، والاستجابة عدّادات
 * مجمّعة بلا أي معرّف مكتب أو محتوى.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/ops-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { withJobHeartbeat } = await import("@/lib/observability/heartbeat.server");
          const report = await withJobHeartbeat("ops-watchdog", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { runWatchdog } = await import("@/lib/observability/watchdog.server");
            return runWatchdog(supabaseAdmin);
          });
          return json({ ok: true, ...report });
        } catch (error) {
          console.error(
            "[ops-watchdog]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "watchdog_failed" }, 500);
        }
      },
    },
  },
});