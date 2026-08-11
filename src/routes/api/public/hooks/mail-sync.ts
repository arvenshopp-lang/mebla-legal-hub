/**
 * مسار دوري لمزامنة صناديق Hostinger: عبر Agentic Mail عند تفعيله، وعبر IMAP دائماً.
 *
 * المسار عام بحكم البادئة، لذا الحماية تُفرض هنا: سر التشغيل الخاص في الترويسة
 * المخصصة بمقارنة ثابتة الزمن، ولا تُعاد أي بيانات رسائل أو أسرار — عدّادات فقط.
 * مسار Agentic مجدول بذاته (منع تداخل، تراجع أُسّي، قاطع دائرة) فلا يُستدعى مباشرة.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/mail-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { admin } = await import("@/lib/admin-guard.server");
          const db = await admin();

          const { runScheduledAgenticSync } = await import("@/lib/email/agentic/scheduler.server");
          const agentic = await runScheduledAgenticSync(db);

          const { transportConfigured } = await import("@/lib/email/transport/config.server");
          if (!transportConfigured(null)) {
            return json({
              ok: true,
              imap: { skipped: "transport_not_configured" },
              agentic: agentic.ran
                ? { ran: true, ...agentic.outcome }
                : { ran: false, reason: agentic.reason },
            });
          }

          const { syncAllMailboxes } = await import("@/lib/email/transport/hostinger.server");
          const outcomes = await syncAllMailboxes(db, "cron");
          return json({
            ok: true,
            mailboxes: outcomes.length,
            ingested: outcomes.reduce((sum, o) => sum + o.ingested, 0),
            duplicates: outcomes.reduce((sum, o) => sum + o.duplicates, 0),
            tickets: outcomes.reduce((sum, o) => sum + o.ticketsCreated, 0),
            failed: outcomes.filter((o) => o.error).length,
            agentic: agentic.ran
              ? { ran: true, ...agentic.outcome }
              : { ran: false, reason: agentic.reason },
          });
        } catch (error) {
          console.error(
            "[mail-sync]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "sync_failed" }, 500);
        }
      },
    },
  },
});
