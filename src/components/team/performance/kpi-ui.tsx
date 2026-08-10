/** مكونات عرض مؤشرات الأداء — عرض فقط، بلا حساب ولا منطق أعمال. */
import { useId } from "react";
import { Badge } from "@/lib/list-utils";
import { cn } from "@/lib/utils";
import {
  KPI_DIMENSION_HINTS,
  KPI_DIMENSION_LABELS,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type KpiDimension,
  type PeriodPreset,
  type ScoreTone,
} from "@/lib/kpi/kpi.shared";

const TONE_TEXT: Record<ScoreTone, string> = {
  excellent: "text-success",
  good: "text-success",
  fair: "text-info",
  watch: "text-warning",
  low: "text-danger",
};

const TONE_BG: Record<ScoreTone, string> = {
  excellent: "bg-success",
  good: "bg-success/80",
  fair: "bg-info",
  watch: "bg-warning",
  low: "bg-danger",
};

const TONE_BADGE: Record<ScoreTone, "green" | "info" | "warn" | "red"> = {
  excellent: "green",
  good: "green",
  fair: "info",
  watch: "warn",
  low: "red",
};

export function ScoreValue({
  score,
  tone,
  size = "md",
}: {
  score: number | null;
  tone: ScoreTone | null;
  size?: "md" | "lg";
}) {
  if (score === null || tone === null) {
    return <span className="text-body-sm text-muted-foreground">لا توجد بيانات كافية</span>;
  }
  return (
    <span
      className={cn(
        "font-bold tabular-nums",
        TONE_TEXT[tone],
        size === "lg" ? "text-[34px] leading-none" : "text-[19px]",
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}

export function BandBadge({ tone, label }: { tone: ScoreTone; label: string }) {
  return <Badge tone={TONE_BADGE[tone]}>{label}</Badge>;
}

export function TrendChip({ points }: { points: number | null }) {
  if (points === null) {
    return <span className="text-[11px] text-text-muted">لا مقارنة</span>;
  }
  const flat = Math.abs(points) < 0.1;
  return (
    <span
      className={cn(
        "text-[12px] font-semibold tabular-nums",
        flat ? "text-muted-foreground" : points > 0 ? "text-success" : "text-danger",
      )}
    >
      {flat ? "بلا تغيّر" : `${points > 0 ? "▲" : "▼"} ${Math.abs(points).toFixed(1)}`}
    </span>
  );
}

export function DimensionBar({ dimension }: { dimension: KpiDimension }) {
  const labelId = useId();
  const value = dimension.value;
  const tone: ScoreTone =
    value === null ? "fair" : value >= 90 ? "excellent" : value >= 75 ? "good" : value >= 60 ? "watch" : "low";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-[12.5px] font-semibold text-foreground">
          {KPI_DIMENSION_LABELS[dimension.key]}
          <span className="ms-1 text-[11px] font-normal text-text-muted">
            ({Math.round(dimension.weight * 100)}%)
          </span>
        </span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {value === null
            ? "غير قابل للتطبيق"
            : `${(Math.round(value * 10) / 10).toFixed(1)}% — ${dimension.numerator}/${dimension.denominator}`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-labelledby={labelId}
        aria-valuenow={value === null ? undefined : Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={value === null ? "غير قابل للتطبيق" : `${Math.round(value)}%`}
      >
        {value !== null && (
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", TONE_BG[tone])}
            style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-[11px] text-text-muted">{KPI_DIMENSION_HINTS[dimension.key]}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  onClick,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  tone?: "danger" | "warning";
}) {
  const body = (
    <>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[22px] font-bold tabular-nums",
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-text-muted">{hint}</p>}
    </>
  );
  if (!onClick) return <div className="surface-card p-4">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card min-h-[88px] p-4 text-right transition hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      {body}
    </button>
  );
}

export function PeriodPicker({
  preset,
  from,
  to,
  onChange,
  disabled,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
  onChange: (next: { preset: PeriodPreset; from: string; to: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[170px] flex-1 sm:flex-none">
        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground" htmlFor="kpi-period">
          الفترة
        </label>
        <select
          id="kpi-period"
          value={preset}
          disabled={disabled}
          onChange={(e) => onChange({ preset: e.target.value as PeriodPreset, from, to })}
          className="min-h-11 w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 text-sm"
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {preset === "custom" && (
        <>
          <div className="min-w-[140px] flex-1 sm:flex-none">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground" htmlFor="kpi-from">
              من
            </label>
            <input
              id="kpi-from"
              type="date"
              value={from}
              disabled={disabled}
              onChange={(e) => onChange({ preset, from: e.target.value, to })}
              className="min-h-11 w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 text-sm"
            />
          </div>
          <div className="min-w-[140px] flex-1 sm:flex-none">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground" htmlFor="kpi-to">
              إلى
            </label>
            <input
              id="kpi-to"
              type="date"
              value={to}
              disabled={disabled}
              onChange={(e) => onChange({ preset, from, to: e.target.value })}
              className="min-h-11 w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function NoticeBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-l)] border border-info/25 bg-info-soft px-4 py-3 text-body-sm text-info">
      {children}
    </div>
  );
}