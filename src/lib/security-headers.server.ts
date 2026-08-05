import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Baseline security headers applied to every response.
 * Kept in one place so the policy is auditable.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  // عارض PDF المدمج في المتصفح يُحمّل النسخة المائية كـ plugin document من نفس
  // الأصل؛ منع object-src كلياً يجعل المتصفح يعرض "تعذّر تحميل المستند".
  "object-src 'self'",
  "frame-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
  // الخطوط مستضافة محلياً بالكامل — لا نسمح بأي مصدر خطوط خارجي
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
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

/**
 * سياسة مخصّصة للاستجابات الثنائية (النسخ المائية PDF والصور): سياسة صفحة HTML
 * الكاملة تُطبَّق على مستند الـ PDF نفسه وتمنع عارض المتصفح من رسمه.
 */
const BINARY_CSP = [
  "default-src 'none'",
  "object-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'unsafe-inline'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
].join("; ");

function isBinaryDocument(response: Response) {
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  return type.startsWith("application/pdf") || type.startsWith("image/");
}

export function applySecurityHeaders(response: Response) {
  const headers = response.headers;
  headers.set("content-security-policy", isBinaryDocument(response) ? BINARY_CSP : CSP);
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
