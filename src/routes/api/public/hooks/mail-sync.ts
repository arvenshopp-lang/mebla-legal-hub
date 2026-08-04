/**
 * مسار دوري لمزامنة صناديق Hostinger: عبر Agentic Mail عند تفعيله، وعبر IMAP دائماً.
 *
 * المسار عام بحكم البادئة، لذا الحماية تُفرض هنا: مفتاح المشروع العام في ترويسة
 * `apikey` بمقارنة ثابتة الزمن، ولا تُعاد أي بيانات رسائل أو أسرار — عدّادات فقط.
 * مسار Agentic مجدول بذاته (منع تداخل، تراجع أُسّي، قاطع دائرة) فلا يُستدعى مباشرة.
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

export const Route = createFileRoute("/api/public/hooks/mail-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();
        const provided = (
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          ""
        ).trim();
        if (!expected || !safeEqual(provided, expected)) {
          return json({ error: "unauthorized" }, 401);
        }

        try {
          const { admin } = await import("@/lib/admin-guard.server");
          const db = await admin();

          const { runScheduledAgenticSync } = await import(
            "@/lib/email/agentic/scheduler.server"
          );
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
