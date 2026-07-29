import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ email: z.string().email().max(320) });

/**
 * Server-only lookup used ONLY after a failed password sign-in, so the UI can
 * tell the user their account uses Google instead of a password.
 * Returns no PII beyond the providers linked to the email the caller already typed.
 */
export const lookupSignInMethods = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { exists: false, providers: [] as string[], hasPassword: false };

    try {
      const res = await fetch(
        `${url}/auth/v1/admin/users?filter=${encodeURIComponent(data.email)}&per_page=5`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (!res.ok) return { exists: false, providers: [] as string[], hasPassword: false };
      const body = (await res.json()) as {
        users?: Array<{
          email?: string;
          identities?: Array<{ provider?: string }> | null;
          app_metadata?: { provider?: string; providers?: string[] } | null;
        }>;
      };
      const user = (body.users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
      );
      if (!user) return { exists: false, providers: [] as string[], hasPassword: false };
      // The admin list endpoint may omit `identities`; app_metadata always carries providers.
      const fromIdentities = (user.identities ?? [])
        .map((i) => i.provider)
        .filter((p): p is string => Boolean(p));
      const fromMetadata = user.app_metadata?.providers ??
        (user.app_metadata?.provider ? [user.app_metadata.provider] : []);
      const providers = Array.from(new Set([...fromIdentities, ...fromMetadata]));
      return { exists: true, providers, hasPassword: providers.includes("email") };
    } catch {
      return { exists: false, providers: [] as string[], hasPassword: false };
    }
  });
