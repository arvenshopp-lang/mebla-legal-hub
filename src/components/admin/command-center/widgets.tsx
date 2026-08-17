/**
 * مكوّنات مركز قيادة مالك المنصة — عرض فقط.
 * كل Widget معزول بحالات (تحميل / خطأ + إعادة محاولة موضعية / فراغ) فلا يُسقط
 * فشل مصدر واحد بقية الصفحة، ولا يُعرض Toast أثناء التحميل.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronLeft, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Btn, SectionCard } from "@/lib/list-utils";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/enums";
import {
  HEALTH_LABEL,
  SEVERITY_LABEL,
  type CommandAlert,
  type HealthRow,
} from "@/lib/admin-command-center.shared";

/* ------------------------------------------------------------------ الغلاف */

export function Widget({
  title,
  description,
  actions,
  className,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  return (
    <SectionCard title={title} description={description} actions={actions} className={className}>
      {isLoading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">جاري التحميل</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-11 animate-pulse rounded-[var(--radius-m)] bg-surface-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="grid gap-3 rounded-[var(--radius-m)] border border-danger/30 bg-danger-soft/40 p-4 text-center">
          <p className="text-[13px] text-foreground">
            {errorMessage || "تعذّر تحميل هذا الجزء. البيانات الأخرى في الصفحة غير متأثرة."}
          </p>
          {onRetry && (
            <div className="flex justify-center">
              <Btn size="sm" variant="outline" onClick={onRetry}>
                إعادة المحاولة
              </Btn>
            </div>
          )}
        </div>
      ) : (
        children
      )}
    </SectionCard>
  );
}

/* ----------------------------------------------------------------- المؤشرات */

export type KpiTone = "default" | "success" | "warning" | "danger";

export function Kpi({
  label,
  value,
  hint,
  Icon,
  tone = "default",
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  Icon: LucideIcon;
  tone?: KpiTone;
  to?: string;
}) {
  const toneCls = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft",
    danger: "text-danger bg-danger-soft",
  }[tone];

  const body = (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-m)]",
          toneCls,
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11.5px] text-muted-foreground">{label}</p>
        <p className="text-[19px] font-bold tabular-nums [overflow-wrap:anywhere]">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );

  if (!to) return <div className="surface-card p-4">{body}</div>;
  return (
    <Link
      to={to}
      className="surface-card block p-4 transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </Link>
  );
}

/* ----------------------------------------------------------------- التنبيهات */

const SEVERITY_STYLE = {
  critical: {
    wrap: "border-danger/35 bg-danger-soft/40",
    badge: "red" as const,
    Icon: AlertTriangle,
  },
  warning: {
    wrap: "border-warning/35 bg-warning-soft/40",
    badge: "warn" as const,
    Icon: AlertTriangle,
  },
  info: { wrap: "border-border bg-surface", badge: "muted" as const, Icon: Info },
};

export function AlertsList({ alerts }: { alerts: CommandAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="grid gap-2 rounded-[var(--radius-m)] border border-success/30 bg-success-soft/40 p-5 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-success" aria-hidden />
        <p className="text-[13.5px] font-semibold">لا يوجد ما يحتاج انتباهك الآن</p>
        <p className="text-[12px] text-muted-foreground">
          لا أعطال مفتوحة ولا تجاوز مهل ولا فواتير متأخرة ولا مهام فاشلة.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {alerts.map((alert) => {
        const style = SEVERITY_STYLE[alert.severity];
        return (
          <li
            key={alert.id}
            className={cn("rounded-[var(--radius-m)] border p-3.5 sm:p-4", style.wrap)}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <style.Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      alert.severity === "critical"
                        ? "text-danger"
                        : alert.severity === "warning"
                          ? "text-warning"
                          : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <p className="text-[13.5px] font-semibold [overflow-wrap:anywhere]">
                    {alert.title}
                  </p>
                  <Badge tone={style.badge}>{SEVERITY_LABEL[alert.severity]}</Badge>
                </div>
                <p className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                  {alert.detail}
                </p>
                {alert.at && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    آخر تحديث: {fmtDateTime(alert.at)}
                  </p>
                )}
              </div>
              <Link
                to={alert.to}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-m)] border border-border bg-surface px-3 text-[12.5px] font-semibold transition hover:bg-surface-muted sm:shrink-0"
              >
                {alert.cta}
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------- الصحة التشغيلية */

export function HealthList({ rows }: { rows: HealthRow[] }) {
  const tone = (state: HealthRow["state"]) =>
    state === "healthy"
      ? ("green" as const)
      : state === "degraded"
        ? ("warn" as const)
        : state === "down"
          ? ("red" as const)
          : ("muted" as const);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            to={row.to}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-m)] border border-border px-3 py-2.5 transition hover:bg-surface-muted"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{row.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{row.hint}</span>
            </span>
            <Badge tone={tone(row.state)}>{HEALTH_LABEL[row.state]}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- الاتجاهات */

export function Sparkline({
  points,
  label,
  format,
}: {
  points: { day: string; value: number }[];
  label: string;
  format: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((acc, p) => acc + p.value, 0);

  if (points.length === 0 || total === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-muted-foreground">
        لا حركة مسجّلة في هذه الفترة.
      </p>
    );
  }

  return (
    <>
      <div
        className="flex h-32 items-end gap-[3px]"
        role="img"
        aria-label={`${label}: الإجمالي ${format(total)} خلال ${points.length} يوماً`}
      >
        {points.map((p) => (
          <span
            key={p.day}
            title={`${p.day} · ${format(p.value)}`}
            className="min-w-[3px] flex-1 rounded-t-[3px] bg-primary/75"
            style={{ height: `${Math.max(3, (p.value / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        الإجمالي: <span className="font-semibold tabular-nums">{format(total)}</span> · الأعلى
        يومياً: <span className="font-semibold tabular-nums">{format(max)}</span>
      </p>
    </>
  );
}

/* -------------------------------------------------------------------- الملخصات */

export function SummaryRows({
  rows,
  to,
  cta,
}: {
  rows: { label: string; value: ReactNode; tone?: KpiTone }[];
  to: string;
  cta: string;
}) {
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
          >
            <dt className="min-w-0 truncate text-[12.5px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "shrink-0 text-[13.5px] font-semibold tabular-nums",
                row.tone === "danger" && "text-danger",
                row.tone === "warning" && "text-warning",
                row.tone === "success" && "text-success",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        to={to}
        className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-m)] border border-border px-3 text-[12.5px] font-semibold transition hover:bg-surface-muted"
      >
        {cta}
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
