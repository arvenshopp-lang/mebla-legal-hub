import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Baseline security headers applied to every response.
 * Kept in one place so the policy is auditable.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lovable.dev https://*.lovable.app https://www.google-analytics.com https://region1.google-analytics.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "interest-cohort=()",
].join(", ");

function isSecureRequest() {
  try {
    const proto = getRequestHeader("x-forwarded-proto");
    return proto ? proto.split(",")[0].trim() === "https" : false;
  } catch {
    return false;
  }
}

export function applySecurityHeaders(response: Response) {
  const headers = response.headers;
  headers.set("content-security-policy", CSP);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", PERMISSIONS_POLICY);
  headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  headers.set("x-permitted-cross-domain-policies", "none");
  if (isSecureRequest()) {
    headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}