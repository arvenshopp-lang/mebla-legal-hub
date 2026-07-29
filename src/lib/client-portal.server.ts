import { getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** SHA-256 hex of a string, using Web Crypto (available in the Worker runtime). */
export async function hashText(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIp() {
  try {
    return (getRequestIP({ xForwardedFor: true }) ?? "unknown").slice(0, 60);
  } catch {
    return "unknown";
  }
}

export type LoadedRequest = {
  request: any;
  org: { name: string; logo_url: string | null } | null;
  clientId: string | null;
  effectiveStatus: "active" | "completed" | "expired" | "revoked";
};

export async function loadRequestByToken(token: string): Promise<LoadedRequest | null> {
  const tokenHash = await hashText(token);
  const { data: request } = await supabaseAdmin
    .from("document_requests")
    .select("*, case:cases(client_id), organization:organizations(name, logo_url)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!request) return null;

  let effectiveStatus = request.status as LoadedRequest["effectiveStatus"];
  if (effectiveStatus === "active" && request.expires_at && new Date(request.expires_at) < new Date()) {
    effectiveStatus = "expired";
    await supabaseAdmin.from("document_requests").update({ status: "expired" }).eq("id", request.id).eq("status", "active");
  }

  return {
    request,
    org: (request as any).organization ?? null,
    clientId: (request as any).case?.client_id ?? null,
    effectiveStatus,
  };
}

export async function logEvent(request: any, event: string, detail: Record<string, unknown>, ip: string) {
  await supabaseAdmin.from("document_request_events").insert({
    organization_id: request.organization_id,
    request_id: request.id,
    event,
    detail,
    ip,
  });
}

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;
const MAX_FAILURES = 6;

export async function checkLookupRateLimit(ipHash: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("case_lookup_attempts")
    .select("success")
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .limit(100);
  const rows = data ?? [];
  const failures = rows.filter((r) => !r.success).length;
  return rows.length >= MAX_ATTEMPTS || failures >= MAX_FAILURES;
}

export async function recordLookupAttempt(ipHash: string, code: string, success: boolean) {
  await supabaseAdmin.from("case_lookup_attempts").insert({
    ip_hash: ipHash,
    code_attempt: success ? code : `${code.slice(0, 3)}*******`,
    success,
  });
}

/** Cryptographically strong, URL-safe single-use token. */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
