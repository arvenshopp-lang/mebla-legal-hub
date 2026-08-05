/**
 * أحداث دورة حياة الصفحة على Safari/iOS.
 *
 * Safari لا يعتمد على beforeunload بشكل موثوق، وقد يعيد الصفحة من BFCache،
 * لذا نتعامل مع visibilitychange و pagehide و pageshow معاً.
 */
import { useEffect, useRef } from "react";

export type PageLifecycleHandlers = {
  /** الصفحة على وشك الاختفاء (تبديل تطبيق، قفل الشاشة، إخفاء التبويب). */
  onHide?: () => void;
  /** الصفحة عادت للظهور — سواء من BFCache أو من الخلفية. */
  onShow?: (fromBackForwardCache: boolean) => void;
};

export function usePageLifecycle({ onHide, onShow }: PageLifecycleHandlers): void {
  const handlers = useRef({ onHide, onShow });
  handlers.current = { onHide, onShow };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hide = () => handlers.current.onHide?.();
    const visibility = () => {
      if (document.visibilityState === "hidden") handlers.current.onHide?.();
      else handlers.current.onShow?.(false);
    };
    const show = (event: PageTransitionEvent) => handlers.current.onShow?.(event.persisted);

    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, []);
}
