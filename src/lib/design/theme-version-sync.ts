/**
 * مزامنة خفيفة لإصدار التصميم المنشور.
 * الجلسات المفتوحة قبل النشر تحمل رابط حزمة CSS القديم؛ هذه المزامنة
 * تتحقق عند عودة المستخدم للتبويب (بحدّ أدنى 60 ثانية بين الفحوص)
 * وتستبدل رابط الحزمة عند تغيّر الإصدار دون إعادة تحميل الصفحة.
 */

const MIN_INTERVAL_MS = 60_000;
const THEME_HREF = "/api/public/theme.css";

function swapThemeLink(version: number) {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>(`link[rel="stylesheet"][href*="${THEME_HREF}"]`),
  );
  if (links.length === 0) return;
  const nextHref = `${THEME_HREF}?v=${version}`;
  for (const link of links) {
    if (link.getAttribute("href") === nextHref) continue;
    const fresh = link.cloneNode() as HTMLLinkElement;
    fresh.href = nextHref;
    // نُدخل النسخة الجديدة أولاً ونحذف القديمة بعد تحميلها لمنع أي وميض
    fresh.addEventListener("load", () => link.remove(), { once: true });
    fresh.addEventListener("error", () => fresh.remove(), { once: true });
    link.after(fresh);
  }
}

export function startThemeVersionSync(
  currentVersion: number,
  fetchVersion: () => Promise<{ cacheVersion: number }>,
): () => void {
  if (typeof document === "undefined") return () => {};
  let known = currentVersion;
  let lastCheck = Date.now();
  let running = false;

  const check = async () => {
    if (running || document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < MIN_INTERVAL_MS) return;
    running = true;
    lastCheck = Date.now();
    try {
      const { cacheVersion } = await fetchVersion();
      if (cacheVersion && cacheVersion !== known) {
        known = cacheVersion;
        swapThemeLink(cacheVersion);
      }
    } catch {
      /* تعذّر الفحص — تُطبَّق النسخة الحالية ويُعاد الفحص لاحقاً */
    } finally {
      running = false;
    }
  };

  const onVisible = () => void check();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}