import { getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Tables, Json } from "@/integrations/supabase/types";

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

type DocumentRequestWithRelations = Tables<"document_requests"> & {
  case: { client_id: string; organization_id: string } | null;
  organization: { name: string; logo_url: string | null } | null;
};

export type LoadedRequest = {
  request: DocumentRequestWithRelations;
  org: { name: string; logo_url: string | null } | null;
  clientId: string | null;
  effectiveStatus: "active" | "completed" | "expired" | "revoked";
};

export async function loadRequestByToken(token: string): Promise<LoadedRequest | null> {
  const tokenHash = await hashText(token);
  const { data: request } = await supabaseAdmin
    .from("document_requests")
    .select("*, case:cases(client_id, organization_id), organization:organizations(name, logo_url)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!request) return null;

  // رفض دفاعي: أي طلب مرتبط بقضية من مكتب مختلف يُعتبر رابطاً غير صالح،
  // فالعميل والمسار يُستمدّان من القضية المتحققة فقط.
  const linked = request as DocumentRequestWithRelations;
  if (!linked.case || linked.case.organization_id !== linked.organization_id) return null;

  let effectiveStatus = request.status as LoadedRequest["effectiveStatus"];
  if (
    effectiveStatus === "active" &&
    request.expires_at &&
    new Date(request.expires_at) < new Date()
  ) {
    effectiveStatus = "expired";
    await supabaseAdmin
      .from("document_requests")
      .update({ status: "expired" })
      .eq("id", request.id)
      .eq("status", "active");
  }

  return {
    request: request as DocumentRequestWithRelations,
    org: (request as DocumentRequestWithRelations).organization ?? null,
    clientId: (request as DocumentRequestWithRelations).case?.client_id ?? null,
    effectiveStatus,
  };
}

export async function logEvent(
  request: Pick<Tables<"document_requests">, "organization_id" | "id">,
  event: string,
  detail: Record<string, Json>,
  ip: string,
) {
  await supabaseAdmin.from("document_request_events").insert({
    organization_id: request.organization_id,
    request_id: request.id,
    event,
    detail: detail as Json,
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

/**
 * Rate limit for the public upload-link endpoints.
 * Uses the same ledger as case lookups with a namespaced ip hash so that
 * brute-forcing tokens is bounded per IP and every attempt is recorded.
 */
const UPLOAD_MAX_ATTEMPTS = 30;
const UPLOAD_MAX_FAILURES = 8;

export async function guardUploadToken(rawIp: string) {
  const ipHash = await hashText(`upload:${rawIp}`);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("case_lookup_attempts")
    .select("success")
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .limit(200);
  const rows = data ?? [];
  const failures = rows.filter((r) => !r.success).length;
  return {
    limited: rows.length >= UPLOAD_MAX_ATTEMPTS || failures >= UPLOAD_MAX_FAILURES,
    record: async (success: boolean) => {
      await supabaseAdmin
        .from("case_lookup_attempts")
        .insert({ ip_hash: ipHash, code_attempt: "upload-token", success });
    },
  };
}

/** Cryptographically strong, URL-safe single-use token. */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
