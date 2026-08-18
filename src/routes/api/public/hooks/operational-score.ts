/**
 * مسار دوري لتوليد لقطات مؤشر الإنجاز التشغيلي — مجدول كل 6 ساعات
 * (مهمة `mehla-operational-score`). عام بحكم البادئة، لذا التحقق بسر التشغيل
 * المركزي، والرد عدّادات فقط بلا أي معرّف مكتب أو بيانات تشغيلية.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/operational-score")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { withJobHeartbeat } = await import("@/lib/observability/heartbeat.server");
          const result = await withJobHeartbeat("operational-score", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { generateOperationalScoreSnapshots } = await import(
              "@/lib/operational-score/snapshot.server"
            );
            return generateOperationalScoreSnapshots(supabaseAdmin);
          });
          return json({ ok: true, ...result });
        } catch (error) {
          console.error(
            "[operational-score]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "snapshot_run_failed" }, 500);
        }
      },
    },
  },
});
