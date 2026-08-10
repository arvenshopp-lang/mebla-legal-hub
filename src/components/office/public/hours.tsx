/** أوقات العمل — صفوف أيام واضحة مع تمييز الحالة، وتحديد اليوم على العميل فقط. */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceCard } from "./primitives";

type Hour = { day: string; label: string; closed: boolean; from: string; to: string };

const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** يوم الرياض الحالي — يُحسب بعد الترطيب فقط لتجنب أي اختلاف بين الخادم والمتصفح. */
function useRiyadhDay() {
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    try {
      const now = new Date();
      const riyadh = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
      setDay(DAY_ORDER[riyadh.getDay()] ?? null);
    } catch {
      setDay(null);
    }
  }, []);
  return day;
}

export function OfficePublicHours({ hours }: { hours: Hour[] }) {
  const today = useRiyadhDay();

  return (
    <SurfaceCard>
      <h2 id="hours-title" className="flex items-center gap-2 text-h3">
        <Clock size={18} strokeWidth={1.9} aria-hidden="true" className="text-primary" />
        أوقات العمل
      </h2>
      <ul className="mt-3">
        {hours.map((hour) => {
          const isToday = today === hour.day;
          return (
            <li
              key={hour.day}
              className={cn(
                "flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0",
                isToday && "font-semibold",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-body-sm">{hour.label}</span>
                {isToday && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-caption text-primary">
                    اليوم
                  </span>
                )}
              </span>
              {hour.closed ? (
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-caption text-muted-foreground">
                  مغلق
                </span>
              ) : (
                <span dir="ltr" className="shrink-0 text-body-sm tabular-nums">
                  {hour.from} — {hour.to}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </SurfaceCard>
  );
}
