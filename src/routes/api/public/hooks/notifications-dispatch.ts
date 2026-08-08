/**
 * مسار دوري لمحرك الإشعارات: إعادة العالقين → تحويل الأحداث إلى طابور → الإرسال.
 * عام بحكم البادئة، لذا التحقق هنا بمفتاح المشروع العام بمقارنة ثابتة الزمن،
 * ولا تُعاد أي بيانات مستلمين — عدّادات فقط.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/notifications-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["SUPABASE_ANON_KEY"] ??
          ""
        ).trim();
        const provided = (
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          ""
        ).trim();
        if (!expected || !safeEqual(provided, expected))
          return json({ error: "unauthorized" }, 401);

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
