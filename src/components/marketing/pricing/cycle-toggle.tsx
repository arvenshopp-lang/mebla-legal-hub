import { CYCLE_LABELS, type BillingCycle } from "@/lib/pricing.shared";
import { cn } from "@/lib/utils";

const CYCLES: BillingCycle[] = ["monthly", "yearly"];

/** مبدّل مدة الاشتراك — عناصر radio حقيقية لدعم لوحة المفاتيح وقارئ الشاشة. */
export function CycleToggle({
  value,
  onChange,
  savingPercent,
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  savingPercent: number | null;
}) {
  return (
    <fieldset className="inline-flex flex-col items-center gap-2">
      <legend className="sr-only">مدة الاشتراك</legend>
      <div className="inline-flex rounded-[var(--radius-m)] border border-border bg-surface p-1">
        {CYCLES.map((cycle) => {
          const active = value === cycle;
          return (
            <label
              key={cycle}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--radius-s)] px-4 text-[13.5px] font-semibold transition",
                "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="billing-cycle"
                value={cycle}
                checked={active}
                onChange={() => onChange(cycle)}
                className="sr-only"
              />
              {CYCLE_LABELS[cycle]}
              {cycle === "yearly" && savingPercent !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    active ? "bg-primary-foreground/15" : "bg-surface-muted text-primary",
                  )}
                >
                  وفّر حتى {savingPercent}%
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
