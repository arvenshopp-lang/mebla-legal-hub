/**
 * مسار تغذية التقويم العام (RFC 5545 iCalendar Live Stream Endpoint)
 * GET /api/public/calendar/feed/:token
 */
import { createFileRoute } from "@tanstack/react-router";
import { getIcsCalendarByToken } from "@/lib/calendar/calendar.server";

export const Route = createFileRoute("/api/public/calendar/feed/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Strip .ics extension if client appended it
        const token = params.token.replace(/\.ics$/i, "").trim();

        if (!token || token.length < 8) {
          return new Response("Invalid Calendar Token", { status: 400 });
        }

        try {
          const icsContent = await getIcsCalendarByToken(token);

          if (!icsContent) {
            return new Response("Calendar Feed Not Found", { status: 404 });
          }

          return new Response(icsContent, {
            status: 200,
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": 'inline; filename="mehla-calendar.ics"',
              "Cache-Control": "no-cache, must-revalidate, max-age=300",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (error) {
          console.error("[calendar-feed]", error instanceof Error ? error.message : "Unknown error");
          return new Response("Internal Calendar Error", { status: 500 });
        }
      },
    },
  },
});
