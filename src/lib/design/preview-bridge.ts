/**
 * جسر معاينة التصميم — يعرض الصفحة الحقيقية داخل إطار من نفس الأصل
 * ويحقن CSS المسودة فيها دون حفظ أو نشر.
 *
 * قواعد الأمان:
 * - لا تُقبل أي رسالة إلا من نفس الأصل ومن النافذة الأم فقط.
 * - الجسر لا يمنح أي صلاحية إضافية: الصفحة تُعرض بجلسة المستخدم نفسها،
 *   وأي صفحة محمية تُرفض كما تُرفض في التصفح العادي.
 * - CSS المحقون يعيش في عنصر <style> داخل الإطار فقط ولا يُخزَّن.
 */

export const DESIGN_PREVIEW_PARAM = "__design";
export const DRAFT_STYLE_ID = "mehla-design-draft";

/**
 * مفتاح ثبات وضع المعاينة داخل الإطار.
 * سببه: أي تحويل داخلي (مثل «/» إلى «/onboarding») يُسقط وسيط الرابط،
 * فيفقد الإطار الجسر ويتوقف حقن المسودة بلا أي رسالة للمستخدم.
 * النطاق: sessionStorage الخاص بالإطار فقط، ولا يُفعَّل إلا داخل إطار له نافذة أم.
 */
const STICKY_KEY = "mehla:design-preview";

const CSS_MESSAGE = "mehla:design-css";
const READY_MESSAGE = "mehla:design-ready";

type DraftMessage = { type: typeof CSS_MESSAGE; css: string };

/** هل هذا الطلب معاينة تصميم؟ (وسيط الرابط، أو ثبات الوضع داخل الإطار بعد تحويل) */
export function isDesignPreviewRequest(search: string): boolean {
  let fromParam = false;
  try {
    fromParam = new URLSearchParams(search).get(DESIGN_PREVIEW_PARAM) === "1";
  } catch {
    fromParam = false;
  }
  if (typeof window === "undefined" || window.parent === window) return fromParam;
  try {
    if (fromParam) {
      window.sessionStorage.setItem(STICKY_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(STICKY_KEY) === "1";
  } catch {
    return fromParam;
  }
}

/** رابط المعاينة لمسار حقيقي داخل المنصة. */
export function designPreviewUrl(path: string): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(DESIGN_PREVIEW_PARAM, "1");
  return `${pathname}?${params.toString()}`;
}

/** يُشغَّل داخل الإطار: يستقبل CSS المسودة ويطبقه فوق الحزمة المنشورة. */
export function installDesignPreviewBridge(): () => void {
  if (typeof window === "undefined" || window.parent === window) return () => {};
  const origin = window.location.origin;

  const style = document.createElement("style");
  style.id = DRAFT_STYLE_ID;
  style.setAttribute("data-design-preview", "1");
  document.head.appendChild(style);

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data as DraftMessage | null;
    if (!data || data.type !== CSS_MESSAGE || typeof data.css !== "string") return;
    style.textContent = data.css;
  };

  window.addEventListener("message", onMessage);
  window.parent.postMessage({ type: READY_MESSAGE }, origin);

  return () => {
    window.removeEventListener("message", onMessage);
    style.remove();
  };
}

/** يُشغَّل في اللوحة: يرسل CSS المسودة إلى الإطار. */
export function postDraftCss(frame: HTMLIFrameElement | null, css: string): void {
  if (typeof window === "undefined") return;
  frame?.contentWindow?.postMessage({ type: CSS_MESSAGE, css }, window.location.origin);
}

/** يُشغَّل في اللوحة: ينتظر إشعار جهوزية الإطار. */
export function onPreviewReady(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const origin = window.location.origin;
  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    if ((event.data as { type?: string } | null)?.type === READY_MESSAGE) handler();
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
