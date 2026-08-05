/**
 * Google Analytics 4 — تحميل واحد فقط، بدون تكرار Tag أو Measurement ID.
 * لا يعمل إطلاقاً ما لم يكن معرّف القياس متوفراً عبر ربط موصّل Google Analytics.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    __mehlaGaLoaded?: boolean;
  }
}

export const GA_MEASUREMENT_ID: string | undefined =
  import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY || undefined;

export function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (!GA_MEASUREMENT_ID) return;
  // حماية من التحميل المزدوج (HMR، إعادة التركيب، وسم موجود مسبقاً في الصفحة)
  if (window.__mehlaGaLoaded) return;
  if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    window.__mehlaGaLoaded = true;
    return;
  }
  window.__mehlaGaLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
}

export function trackPageView(path: string) {
  if (!GA_MEASUREMENT_ID) return;
  gtag("event", "page_view", { page_path: path, page_location: window.location.href });
}
