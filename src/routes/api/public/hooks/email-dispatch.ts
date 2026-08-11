import { createFileRoute } from "@tanstack/react-router";

/**
 * معالجة قائمة الإرسال المستحقة (الرسائل المجدولة وإعادة المحاولات).
 * مسار دوري يُستدعى من pg_cron → pg_net، والتوثيق عبر سر التشغيل الخاص فقط.
 */
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request: Request) {
  const denied = await guardCronRequest(request);
  if (denied) return denied;

  try {
    const { dispatchDue } = await import("@/lib/email/workspace.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const report = await dispatchDue(supabaseAdmin, 25);
    return json({ success: true, ...report });
  } catch (error) {
    console.error("[email-dispatch]", error instanceof Error ? error.message : error);
    return json({ success: false, error: "dispatch_failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/email-dispatch")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
