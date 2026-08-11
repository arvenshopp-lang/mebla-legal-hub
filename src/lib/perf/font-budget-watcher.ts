import {
  describeViolation,
  evaluateFontBudget,
  formatBytes,
  isFontResource,
  type FontResourceSample,
} from "./font-budget";

/**
 * مراقب ميزانية الخطوط — بيئة التطوير فقط.
 * يرصد موارد الخطوط المحمَّلة عبر الشبكة ويطبع تحذيراً واضحاً عند تجاوز الميزانية.
 * لا يعمل في الإنتاج ولا يرسل أي بيانات خارج المتصفح.
 */
export function installFontBudgetWatcher(): (() => void) | undefined {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

  const seen = new Map<string, FontResourceSample>();
  let warned = "";

  const collect = (entries: readonly PerformanceEntry[]) => {
    for (const entry of entries) {
      if (entry.entryType !== "resource") continue;
      const resource = entry as PerformanceResourceTiming;
      if (!isFontResource(resource.name)) continue;
      const file = resource.name.split("/").pop() ?? resource.name;
      const previous = seen.get(resource.name);
      // نحتفظ بأكبر حجم نقل مُسجَّل لنفس الملف (الطلب الشبكي الحقيقي)
      if (!previous || resource.transferSize > previous.transferSize) {
        seen.set(resource.name, { name: file, transferSize: resource.transferSize });
      }
    }
    report();
  };

  const report = () => {
    const budget = evaluateFontBudget([...seen.values()]);
    if (budget.withinBudget) return;
    const signature = budget.violations.map(describeViolation).join(" | ");
    if (signature === warned) return;
    warned = signature;
    console.warn(
      [
        "⚠️ تجاوز ميزانية أداء الخطوط",
        ...budget.violations.map((v) => `• ${describeViolation(v)}`),
        `الملفات (${budget.fileCount}): ${budget.files.join(", ")}`,
        `إجمالي النقل: ${formatBytes(budget.transferBytes)}`,
      ].join("\n"),
    );
  };

  collect(performance.getEntriesByType("resource"));

  const observer = new PerformanceObserver((list) => collect(list.getEntries()));
  observer.observe({ type: "resource", buffered: true });
  return () => observer.disconnect();
}
