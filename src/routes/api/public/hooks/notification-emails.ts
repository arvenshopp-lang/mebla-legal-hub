/**
 * مسار دوري لقناة بريد التنبيهات: سحب الدفعة المستحقة وإرسالها.
 * عام بحكم البادئة، لذا التوثيق بسر التشغيل الخاص فقط، والاستجابة عدّادات لا مستلمين.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/notification-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { withJobHeartbeat } = await import("@/lib/observability/heartbeat.server");
          const report = await withJobHeartbeat("notification-emails", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { processNotificationEmailBatch, BATCH_SIZE } = await import(
              "@/lib/notifications/email-worker.server"
            );
            return processNotificationEmailBatch(supabaseAdmin, BATCH_SIZE);
          });
          return json({ ok: true, ...report });
        } catch (error) {
          console.error(
            "[notification-emails]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "dispatch_failed" }, 500);
        }
      },
    },
  },
});
