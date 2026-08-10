import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app/app-shell";

/**
 * قشرة صفحات المكتب — واجهة مستقرة تُبنى الآن على AppShell الجديد.
 * تبقى التسمية DashboardShell للحفاظ على توافق جميع المسارات القائمة.
 */
export const DashboardShell = AppShell;

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "gold" | "success";
  loading?: boolean;
}) {
  const accent = {
    default: "bg-border-strong",
    gold: "bg-gold",
    success: "bg-success",
    warn: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div
      className="surface-card relative overflow-hidden p-4 transition-shadow duration-[var(--duration-fast)] hover:shadow-sm sm:p-5"
      aria-busy={loading || undefined}
    >
      <span className={cn("absolute inset-y-0 right-0 w-[3px]", accent)} aria-hidden />
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      {loading ? (
        <div
          className="mt-2 h-7 w-16 animate-pulse rounded-[var(--radius-s)] bg-surface-muted"
          aria-hidden
        />
      ) : (
        <p className="mt-2 text-[28px] font-bold leading-none tabular-nums">{value}</p>
      )}
      {hint && <p className="text-caption mt-1.5">{hint}</p>}
    </div>
  );
}
