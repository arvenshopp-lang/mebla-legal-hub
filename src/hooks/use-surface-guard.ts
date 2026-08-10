import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  isPathAllowed,
  isUniversalPath,
  ownerSurface,
  resolveSurface,
  surfaceUrl,
} from "@/config/surfaces";
import { isDesignPreviewRequest } from "@/lib/design/preview-bridge";

/**
 * نسخة العميل من حارس النطاقات: تمنع التنقل داخل التطبيق إلى مسار
 * لا يخص النطاق الفرعي الحالي، وتحوّله للنطاق المالك له.
 * لا تفعل شيئاً في بيئات التطوير/المعاينة.
 */
export function useSurfaceGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // معاينة التصميم تعمل داخل إطار من نفس الأصل: أي تحويل إلى نطاق فرعي آخر
    // يقطع جسر الحقن ويعرض الموقع المنشور بدل المسودة، فيُعطَّل الحارس هنا فقط.
    if (window.parent !== window && isDesignPreviewRequest(window.location.search)) return;
    const host = window.location.host;
    const surface = resolveSurface(host);
    if (!surface) return;

    const clean = pathname.replace(/\/+$/, "") || "/";
    if (isUniversalPath(clean)) return;

    if (clean === "/" && surface.entry !== "/") {
      window.location.replace(surface.entry);
      return;
    }
    if (isPathAllowed(surface, clean)) return;

    const owner = ownerSurface(clean);
    if (owner.id === surface.id) return;
    const target = surfaceUrl(owner.id, `${clean}${window.location.search}`, host);
    if (target) window.location.replace(target);
  }, [pathname]);
}

/**
 * يحوّل مساراً داخلياً إلى رابط النطاق الفرعي المالك له عند العمل على الدومين الرسمي،
 * ويبقيه مساراً نسبياً في بيئات التطوير والمعاينة.
 */
export function useSurfaceHref(path: string) {
  const [href, setHref] = useState(path);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.host;
    const current = resolveSurface(host);
    const clean = path.split("?")[0].split("#")[0];
    if (!current || isPathAllowed(current, clean)) {
      setHref(path);
      return;
    }
    const target = surfaceUrl(ownerSurface(clean).id, path, host);
    setHref(target || path);
  }, [path]);
  return href;
}
