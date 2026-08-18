/**
 * مسار معالجة استجابة تفويض مايكروسوفت أوتلوك للتقويم (Microsoft Calendar OAuth Callback)
 * GET /api/integrations/microsoft/callback?code=...&state=...
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeOutlookCodeForTokens,
  ensureMehlaOutlookCalendar,
  syncEventsToOutlookCalendar,
} from "@/lib/calendar/outlook-calendar.server";
import {
  getCalendarSyncSettings,
  getCalendarEvents,
} from "@/lib/calendar/calendar.server";

export const Route = createFileRoute("/api/integrations/microsoft/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") || "";
        const error = url.searchParams.get("error");

        if (error || !code) {
          return Response.redirect(
            `${url.origin}/calendar?outlook_error=${encodeURIComponent(error || "missing_code")}`,
            302,
          );
        }

        try {
          const parts = state.split(":");
          const orgId = parts[2] || "00000000-0000-0000-0000-000000000001";
          const userId = parts[3] || "usr-default-lawyer";

          const tokens = await exchangeOutlookCodeForTokens(code);
          if (!tokens) {
            return Response.redirect(`${url.origin}/calendar?outlook_error=token_exchange_failed`, 302);
          }

          const cal = await ensureMehlaOutlookCalendar(tokens.accessToken);
          const calendarId = cal ? cal.calendarId : "primary";

          const events = await getCalendarEvents(orgId);
          await syncEventsToOutlookCalendar(tokens.accessToken, calendarId, events);

          const settings = await getCalendarSyncSettings(orgId, userId);
          settings.outlookConnected = true;
          settings.outlookCalendarId = calendarId;
          settings.outlookCalendarName = cal?.calendarName || "مِهلة | الجلسات والمهل القضائية";
          settings.outlookLastSyncAt = new Date().toISOString();
          settings.outlookSyncStatus = "success";

          return Response.redirect(`${url.origin}/calendar?outlook_connected=true`, 302);
        } catch (err) {
          console.error("[microsoft-callback]", err);
          return Response.redirect(
            `${url.origin}/calendar?outlook_error=${encodeURIComponent("sync_initialization_failed")}`,
            302,
          );
        }
      },
    },
  },
});
