/**
 * قراءة بيانات الظهور العام من الخادم بمفتاح عام فقط (RLS: is_public).
 * لا يُستخدم هنا أي مفتاح خدمة، ولا تُقرأ أي إعدادات أخرى.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_PUBLIC_SITE,
  PUBLIC_SITE_SETTINGS_KEY,
  normalizePublicSite,
  type PublicSiteInfo,
} from "@/lib/public-site.shared";

export async function readPublicSiteInfo(): Promise<PublicSiteInfo> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return DEFAULT_PUBLIC_SITE;

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", PUBLIC_SITE_SETTINGS_KEY)
      .maybeSingle();
    return normalizePublicSite((data as { value?: unknown } | null)?.value);
  } catch {
    return DEFAULT_PUBLIC_SITE;
  }
}