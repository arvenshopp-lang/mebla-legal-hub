import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

import { indexingDecision } from "@/config/indexing";


/**
 * Baseline security headers applied to every response.
 * Kept in one place so the policy is auditable.
 */
/**
 * في الإنتاج نمنع `'unsafe-eval'` تماماً؛ خادم التطوير (Vite/HMR) يحتاجه فقط أثناء
 * التطوير المحلي، لذلك يُضاف شرطياً ولا يصل أبداً إلى الاستجابات الإنتاجية.
 */
const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

const SCRIPT_SRC = [
  "script-src 'self' 'unsafe-inline'",
  IS_PRODUCTION ? "" : " 'unsafe-eval'",
  " https://www.googletagmanager.com https://www.google-analytics.com",
].join("");

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  // لا يوجد في التطبيق أي <object>/<embed>؛ النسخة المائية تُعرض داخل <iframe>
  // من blob: فقط، لذلك تبقى object-src محصورة بالأصل بلا توسعة blob:.
  "object-src 'self'",
  "frame-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  SCRIPT_SRC,
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
  // مستند الـ PDF نفسه لا يُدرج أي مورد خارجي؛ العرض يتم في المتصفح من blob:
  // داخل إطار من نفس الأصل، فلا حاجة لتوسعة object-src.
  "object-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'unsafe-inline'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
].join("; ");

function isBinaryDocument(response: Response) {
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  return type.startsWith("application/pdf") || type.startsWith("image/");
}

/** ملفات إرشاد الزواحف نفسها لا تُوسم بـ noindex حتى لا تتعارض الإشارات. */
const CRAWLER_CONTROL_PATHS = new Set(["/robots.txt", "/sitemap.xml"]);

/**
 * حوكمة الفهرسة على مستوى الاستجابة: `X-Robots-Tag` مشتقة من نفس دالة القرار
 * المركزية التي تُشتق منها Meta robots داخل الصفحات، مع سياق الطلب الكامل
 * (المسار + Query Parameters)، فلا يمكن أن تختلف الإشارتان.
 */
function applyIndexingHeaders(response: Response) {
  let pathname = "/";
  let search = "";
  try {
    const url = new URL(getRequest().url);
    pathname = url.pathname;
    search = url.search;
  } catch {
    return;
  }
  if (CRAWLER_CONTROL_PATHS.has(pathname)) return;

  const decision = indexingDecision({ pathname, search });
  if (!decision.indexable) {
    response.headers.set("x-robots-tag", `${decision.robots}, noarchive`);
  } else {
    response.headers.delete("x-robots-tag");
  }
  if (decision.noStore) {
    response.headers.set("cache-control", "private, no-store, max-age=0");
  }
  if (decision.noReferrer) {
    response.headers.set("referrer-policy", "no-referrer");
  }
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
  applyIndexingHeaders(response);
  if (isBinaryDocument(response)) {
    headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet");
  }
  if (isSecureRequest()) {
    headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

