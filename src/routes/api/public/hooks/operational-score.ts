/**
 * مسار دوري لتوليد لقطات مؤشر الإنجاز التشغيلي (الهدف لاحقاً: كل 6 ساعات).
 * عام بحكم البادئة، لذا التحقق بسر التشغيل المركزي، والرد عدّادات فقط
 * بلا أي معرّف مكتب أو بيانات تشغيلية. لا يوجد مهمة Cron حيّة الآن.
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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { generateOperationalScoreSnapshots } = await import(
            "@/lib/operational-score/snapshot.server"
          );
          const result = await generateOperationalScoreSnapshots(supabaseAdmin);
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
