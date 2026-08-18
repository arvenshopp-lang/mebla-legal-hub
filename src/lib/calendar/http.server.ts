/**
 * محوّل اتصال آمن لمزوّدي التقويم — يمرّ عبر طبقة التكاملات (SSRF + مهلة + حد حجم)
 * ويقدّم واجهة مبسطة على شكل fetch لمحركات جوجل وأوتلوك.
 */
import { integrationFetch } from "@/lib/integrations/http.server";

const ALLOWED_HOSTS = [
  "oauth2.googleapis.com",
  "accounts.google.com",
  "www.googleapis.com",
  "login.microsoftonline.com",
  "graph.microsoft.com",
];

export type CalendarFetchResult = {
  ok: boolean;
  status: number;
  json: <T>() => T | null;
  bodyText: string;
};

export async function calendarFetch(
  url: string,
  init: {
    method?: "GET" | "POST" | "PUT" | "PATCH";
    headers?: Record<string, string>;
    body?: string | URLSearchParams | null;
  } = {},
): Promise<CalendarFetchResult> {
  const response = await integrationFetch({
    method: init.method ?? "GET",
    url,
    headers: init.headers ?? {},
    body:
      init.body == null
        ? null
        : typeof init.body === "string"
          ? init.body
          : init.body.toString(),
    timeoutMs: 15_000,
    policy: { environment: "production", allowedHosts: ALLOWED_HOSTS },
    retries: 1,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: <T>() => (response.json as T | null),
    bodyText: response.bodyText,
  };
}
