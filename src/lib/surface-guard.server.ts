import { getRequest } from "@tanstack/react-start/server";
import {
  isPathAllowed,
  isUniversalPath,
  ownerSurface,
  resolveSurface,
  surfaceUrl,
} from "@/config/surfaces";

/**
 * حارس النطاقات على الخادم:
 * - نطاق api لا يقدّم أي HTML.
 * - جذر كل نطاق يفتح صفحته الافتراضية.
 * - أي مسار لا يخص النطاق الحالي يُحوَّل للنطاق المالك له.
 * يعيد Response للتحويل/المنع، أو null للمتابعة الطبيعية.
 */
export function surfaceGuard(): Response | null {
  let request: Request | undefined;
  try {
    request = getRequest();
  } catch {
    return null;
  }
  if (!request) return null;

  const url = new URL(request.url);
  const host = request.headers.get("host");
  const surface = resolveSurface(host);
  if (!surface) return null;

  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  // نداءات الخادم والأصول تمر دائماً.
  if (
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/_build") ||
    pathname.startsWith("/assets")
  ) {
    return null;
  }

  if (surface.apiOnly) {
    if (pathname.startsWith("/api")) return null;
    return new Response(
      JSON.stringify({ error: "not_found", message: "This host serves the API only." }),
      {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }

  if (isUniversalPath(pathname)) return null;

  if (pathname === "/" && surface.entry !== "/") {
    return Response.redirect(new URL(surface.entry, url.origin).toString(), 302);
  }

  if (isPathAllowed(surface, pathname)) return null;

  const owner = ownerSurface(pathname);
  const target = surfaceUrl(owner.id, `${pathname}${url.search}`, host);
  if (!target || owner.id === surface.id) return null;
  return Response.redirect(target, 302);
}
