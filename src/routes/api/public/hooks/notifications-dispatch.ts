/**
 * مسار دوري لمحرك الإشعارات: إعادة العالقين → تحويل الأحداث إلى طابور → الإرسال.
 * عام بحكم البادئة، لذا التحقق هنا بسر التشغيل الخاص بمقارنة ثابتة الزمن،
 * ولا تُعاد أي بيانات مستلمين — عدّادات فقط.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/notifications-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { materializeDueEvents } = await import("@/lib/notifications/engine.server");
          const { processQueueBatch, reapStuckRows } =
            await import("@/lib/notifications/queue.server");

          const reaped = await reapStuckRows(supabaseAdmin);
          const materialized = await materializeDueEvents(supabaseAdmin, 50);
          const dispatched = await processQueueBatch(supabaseAdmin, 25);
          return json({ ok: true, reaped, materialized, dispatched });
        } catch (error) {
          console.error(
            "[notifications-dispatch]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "dispatch_failed" }, 500);
        }
      },
    },
  },
});
