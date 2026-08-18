/**
 * مسار دوري لمولّد التذكيرات التشغيلية (جلسات، مهل، مهام متأخرة).
 * عام بحكم البادئة، لذا التوثيق بسر التشغيل الخاص فقط، والاستجابة عدّادات
 * مجمّعة لا مستلمين ولا محتوى. تكرار التشغيل آمن لأن منع التكرار حتمي.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/operational-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { withJobHeartbeat } = await import("@/lib/observability/heartbeat.server");
          const report = await withJobHeartbeat("operational-reminders", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { generateOperationalReminders } = await import(
              "@/lib/notifications/reminder-generator.server"
            );
            return generateOperationalReminders(supabaseAdmin);
          });
          return json({ ok: true, ...report });
        } catch (error) {
          console.error(
            "[operational-reminders]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "generation_failed" }, 500);
        }
      },
    },
  },
});
