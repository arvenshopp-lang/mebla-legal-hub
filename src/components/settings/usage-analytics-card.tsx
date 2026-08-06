import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  isAnalyticsConsentGranted,
  setAnalyticsConsent,
  startAnalytics,
  stopAnalytics,
  subscribeToAnalyticsConsent,
} from "@/lib/product-analytics";

/**
 * «تحليلات الاستخدام» — معطّلة افتراضياً.
 * لا تُشغَّل أي تحليلات ولا يُنشأ أي تخزين قبل موافقة المستخدم، ويمكنه سحبها في أي وقت.
 */
export function UsageAnalyticsCard() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    setGranted(isAnalyticsConsentGranted());
    return subscribeToAnalyticsConsent(setGranted);
  }, []);

  const toggle = (next: boolean) => {
    setAnalyticsConsent(next);
    setGranted(next);
    if (next) {
      startAnalytics();
      toast.success("تم تفعيل تحليلات الاستخدام");
    } else {
      stopAnalytics();
      toast.success("تم إيقاف تحليلات الاستخدام");
    }
  };

  return (
    <section className="max-w-3xl rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <h3 className="text-sm font-bold text-foreground">الخصوصية</h3>
      <label className="mt-4 flex items-start justify-between gap-4 rounded-[var(--radius-m)] border border-border bg-surface-muted/40 p-4">
        <span className="space-y-1.5">
          <span className="block text-sm font-semibold text-foreground">تحليلات الاستخدام</span>
          <span className="block text-[12.5px] leading-6 text-muted-foreground">
            قياس مجهول لعدد مرات استخدام شاشات المنصة، لتحسين الأداء وترتيب الأولويات. لا نرسل
            أسماءً ولا بريداً ولا بيانات قضايا أو عملاء أو مستندات أو فواتير، ولا نستخدم Cookies.
            يمكنك إيقافه في أي وقت.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="تحليلات الاستخدام"
          checked={granted}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
        />
      </label>
    </section>
  );
}