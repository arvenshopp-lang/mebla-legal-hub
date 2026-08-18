/**
 * مسار معالجة استجابة تفويض جوجل للتقويم (Google Calendar OAuth Callback)
 * GET /api/integrations/google/callback?code=...&state=...
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeGoogleCodeForTokens,
  ensureMehlaGoogleCalendar,
  syncEventsToGoogleCalendar,
} from "@/lib/calendar/google-calendar.server";
import {
  getCalendarSyncSettings,
  getCalendarEvents,
} from "@/lib/calendar/calendar.server";

export const Route = createFileRoute("/api/integrations/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") || "";
        const error = url.searchParams.get("error");

        if (error || !code) {
          return Response.redirect(
            `${url.origin}/calendar?google_error=${encodeURIComponent(error || "missing_code")}`,
            302,
          );
        }

        try {
          // Parse state (e.g. state:google:orgId:userId)
          const parts = state.split(":");
          const orgId = parts[2] || "00000000-0000-0000-0000-000000000001";
          const userId = parts[3] || "usr-default-lawyer";

          // 1. Exchange code for tokens
          const tokens = await exchangeGoogleCodeForTokens(code);
          if (!tokens) {
            return Response.redirect(`${url.origin}/calendar?google_error=token_exchange_failed`, 302);
          }

          // 2. Ensure dedicated MEHLA Calendar exists
          const cal = await ensureMehlaGoogleCalendar(tokens.accessToken);
          const calendarId = cal ? cal.calendarId : "primary";

          // 3. Perform initial events sync
          const events = await getCalendarEvents(orgId);
          await syncEventsToGoogleCalendar(tokens.accessToken, calendarId, events);

          // 4. Update settings in memory
          const settings = await getCalendarSyncSettings(orgId, userId);
          settings.googleConnected = true;
          settings.googleCalendarId = calendarId;
          settings.googleCalendarName = cal?.calendarName || "مِهلة | الجلسات والمهل القضائية";
          settings.googleLastSyncAt = new Date().toISOString();
          settings.googleSyncStatus = "success";

          return Response.redirect(`${url.origin}/calendar?google_connected=true`, 302);
        } catch (err) {
          console.error("[google-callback]", err);
          return Response.redirect(
            `${url.origin}/calendar?google_error=${encodeURIComponent("sync_initialization_failed")}`,
            302,
          );
        }
      },
    },
  },
});
