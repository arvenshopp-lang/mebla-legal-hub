/**
 * محوّل اتصال آمن موحّد لمزودي الخدمات الخارجية (تقويم / تخزين سحابي).
 * يمرّ كل طلب عبر `integrationFetch` (حماية SSRF + مهلة + منع إعادة التوجيه + حد الحجم)
 * ويعيد واجهة شبيهة بـ Response لتبسيط الاستخدام في المحركات.
 */
import { integrationFetch } from "./http.server";
import type { HttpMethod } from "./integrations.shared";

export type ProviderFetchInit = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string | Uint8Array | null;
  timeoutMs?: number;
};

export type ProviderFetchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  text: () => string;
  json: <T = unknown>() => T;
};

/** ينشئ دالة جلب مقيّدة بقائمة مضيفين موثوقين. */
export function createProviderFetch(allowedHosts: string[]) {
  return async function providerFetch(
    url: string,
    init: ProviderFetchInit = {},
  ): Promise<ProviderFetchResult> {
    const response = await integrationFetch({
      method: init.method ?? "GET",
      url,
      headers: init.headers ?? {},
      body: init.body ?? null,
      timeoutMs: init.timeoutMs ?? 20_000,
      policy: {
        environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
        allowedHosts,
      },
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      bodyText: response.bodyText,
      text: () => response.bodyText,
      json: <T = unknown>() => (response.json ?? null) as T,
    };
  };
}
