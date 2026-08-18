/**
 * محرك المزامنة الثنائية مع تقويم جوجل (Google Calendar 2-Way Sync Engine)
 */
import { calendarFetch } from "./http.server";
import type { CalendarEventModel, CalendarSyncResult } from "./calendar.shared";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleConfig(): GoogleCalendarConfig {
  const clientId =
    process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    "433102357816-ciupjtacejjl4no0btu77dqbc8bn8fvt.apps.googleusercontent.com";
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "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";
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI || "https://mehlalex.com/api/integrations/google/callback";

  return { clientId, clientSecret, redirectUri };
}

/** توليد رابط تفويض OAuth لجوجل */
export function getGoogleAuthUrl(state: string): string | null {
  const config = getGoogleConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** استبدال رمز التفويض بتوكنات الوصول والتجديد */
export async function exchangeGoogleCodeForTokens(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number } | null> {
  const config = getGoogleConfig();
  if (!config) return null;

  const res = await calendarFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) return null;
  const data = (res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/** تجديد توكن الوصول باستخدام Refresh Token */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const config = getGoogleConfig();
  if (!config) return null;

  const res = await calendarFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = (res.json()) as { access_token: string };
  return data.access_token;
}

/** العثور على أو إنشاء تقويم مِهلة المخصص في حساب جوجل */
export async function ensureMehlaGoogleCalendar(
  accessToken: string,
): Promise<{ calendarId: string; calendarName: string } | null> {
  const targetName = "مِهلة | الجلسات والمهل القضائية";

  // 1. Check existing calendars
  const listRes = await calendarFetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.ok) {
    const listData = (listRes.json()) as { items?: Array<{ id: string; summary: string }> };
    const found = listData.items?.find((c) => c.summary === targetName);
    if (found) return { calendarId: found.id, calendarName: found.summary };
  }

  // 2. Create if not found
  const createRes = await calendarFetch(`${GOOGLE_CALENDAR_API}/calendars`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: targetName,
      description: "التقويم التلقائي الموحد للجلسات والمهل القضائية - منصة مِهلة",
      timeZone: "Asia/Riyadh",
    }),
  });

  if (!createRes.ok) return null;
  const created = (createRes.json()) as { id: string; summary: string };
  return { calendarId: created.id, calendarName: created.summary };
}

/** مزامنة الأحداث مع تقويم جوجل */
export async function syncEventsToGoogleCalendar(
  accessToken: string,
  calendarId: string,
  events: CalendarEventModel[],
): Promise<CalendarSyncResult> {
  let pushed = 0;
  let updated = 0;
  let deleted = 0;

  try {
    for (const ev of events) {
      const googleEventPayload = {
        id: `mehla${ev.sourceType}${ev.sourceId.replace(/-/g, "")}`.toLowerCase(),
        summary: ev.title,
        description: `🏛️ منصة مِهلة القانونية\n📂 رقم القضية: ${ev.caseNumber || "—"}\n📜 عنوان القضية: ${ev.caseTitle || "—"}\n⚖️ المحكمة: ${ev.courtName || "—"}\n🏢 الدائرة: ${ev.judicialCircuit || "—"}\n🌐 رابط الجلسة: ${ev.remoteLink || "—"}\n\n🔗 ${ev.url}`,
        location: ev.remoteLink || ev.location || ev.courtName || "المحكمة / عن بُعد",
        start: {
          dateTime: new Date(ev.startDate).toISOString(),
          timeZone: "Asia/Riyadh",
        },
        end: {
          dateTime: new Date(ev.endDate).toISOString(),
          timeZone: "Asia/Riyadh",
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 1440 }, // 24 hours
            { method: "popup", minutes: 120 },  // 2 hours
          ],
        },
      };

      // Try insert or update
      const updateRes = await calendarFetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventPayload.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEventPayload),
        },
      );

      if (updateRes.ok) {
        updated++;
      } else {
        // If not found, insert
        const insertRes = await calendarFetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(googleEventPayload),
          },
        );
        if (insertRes.ok) pushed++;
      }
    }

    return {
      success: true,
      provider: "google",
      eventsPushed: pushed,
      eventsUpdated: updated,
      eventsDeleted: deleted,
      lastSyncAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      provider: "google",
      eventsPushed: pushed,
      eventsUpdated: updated,
      eventsDeleted: deleted,
      lastSyncAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : "تعذرت المزامنة مع تقويم جوجل",
    };
  }
}
