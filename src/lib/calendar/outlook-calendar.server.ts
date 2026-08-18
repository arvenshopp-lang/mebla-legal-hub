/**
 * محرك المزامنة الثنائية مع تقويم مايكروسوفت أوتلوك (Microsoft Outlook 365 Sync Engine)
 */
import { calendarFetch } from "./http.server";
import type { CalendarEventModel, CalendarSyncResult } from "./calendar.shared";

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";

export interface OutlookConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOutlookConfig(): OutlookConfig | null {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const redirectUri =
    process.env.MICROSOFT_CALENDAR_REDIRECT_URI || "https://mehlalex.com/api/integrations/microsoft/callback";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** توليد رابط تفويض OAuth لمايكروسوفت */
export function getOutlookAuthUrl(state: string): string | null {
  const config = getOutlookConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email offline_access Calendars.ReadWrite",
    response_mode: "query",
    state,
  });

  return `${MS_AUTH_URL}?${params.toString()}`;
}

/** استبدال رمز التفويض بتوكنات مايكروسوفت */
export async function exchangeOutlookCodeForTokens(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number } | null> {
  const config = getOutlookConfig();
  if (!config) return null;

  const res = await calendarFetch(MS_TOKEN_URL, {
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

/** تجديد توكن الوصول لمايكروسوفت */
export async function refreshOutlookAccessToken(refreshToken: string): Promise<string | null> {
  const config = getOutlookConfig();
  if (!config) return null;

  const res = await calendarFetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      scope: "Calendars.ReadWrite offline_access",
    }),
  });

  if (!res.ok) return null;
  const data = (res.json()) as { access_token: string };
  return data.access_token;
}

/** العثور على أو إنشاء تقويم مِهلة المخصص في مايكروسوفت أوتلوك */
export async function ensureMehlaOutlookCalendar(
  accessToken: string,
): Promise<{ calendarId: string; calendarName: string } | null> {
  const targetName = "مِهلة | الجلسات والمهل القضائية";

  // 1. Check existing calendars
  const listRes = await calendarFetch(`${MS_GRAPH_API}/me/calendars`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.ok) {
    const listData = (listRes.json()) as { value?: Array<{ id: string; name: string }> };
    const found = listData.value?.find((c) => c.name === targetName);
    if (found) return { calendarId: found.id, calendarName: found.name };
  }

  // 2. Create if not found
  const createRes = await calendarFetch(`${MS_GRAPH_API}/me/calendars`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: targetName,
    }),
  });

  if (!createRes.ok) return null;
  const created = (createRes.json()) as { id: string; name: string };
  return { calendarId: created.id, calendarName: created.name };
}

/** مزامنة الأحداث مع تقويم مايكروسوفت أوتلوك */
export async function syncEventsToOutlookCalendar(
  accessToken: string,
  calendarId: string,
  events: CalendarEventModel[],
): Promise<CalendarSyncResult> {
  let pushed = 0;
  let updated = 0;
  let deleted = 0;

  try {
    for (const ev of events) {
      const outlookEventPayload = {
        subject: ev.title,
        body: {
          contentType: "HTML",
          content: `
            <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h3 style="color: #1a365d;">🏛️ منصة مِهلة القانونية</h3>
              <p><strong>📂 رقم القضية:</strong> ${ev.caseNumber || "—"}</p>
              <p><strong>📜 عنوان القضية:</strong> ${ev.caseTitle || "—"}</p>
              <p><strong>⚖️ المحكمة:</strong> ${ev.courtName || "—"}</p>
              <p><strong>🏢 الدائرة:</strong> ${ev.judicialCircuit || "—"}</p>
              <p><strong>🌐 رابط الجلسة:</strong> <a href="${ev.remoteLink}">${ev.remoteLink || "—"}</a></p>
              <p><strong>📝 التفاصيل:</strong> ${ev.description || "—"}</p>
              <hr />
              <p><a href="${ev.url}">🔗 فتح القضية في مِهلة</a></p>
            </div>
          `,
        },
        start: {
          dateTime: new Date(ev.startDate).toISOString().replace("Z", ""),
          timeZone: "Arab Standard Time",
        },
        end: {
          dateTime: new Date(ev.endDate).toISOString().replace("Z", ""),
          timeZone: "Arab Standard Time",
        },
        location: {
          displayName: ev.remoteLink || ev.location || ev.courtName || "المحكمة / عن بُعد",
        },
        isReminderOn: true,
        reminderMinutesBeforeStart: 120, // 2 hours
      };

      const res = await calendarFetch(`${MS_GRAPH_API}/me/calendars/${calendarId}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(outlookEventPayload),
      });

      if (res.ok) pushed++;
    }

    return {
      success: true,
      provider: "outlook",
      eventsPushed: pushed,
      eventsUpdated: updated,
      eventsDeleted: deleted,
      lastSyncAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      provider: "outlook",
      eventsPushed: pushed,
      eventsUpdated: updated,
      eventsDeleted: deleted,
      lastSyncAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : "تعذرت المزامنة مع تقويم أوتلوك",
    };
  }
}
