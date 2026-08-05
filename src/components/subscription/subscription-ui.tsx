import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Info, Lock, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Btn } from "@/lib/list-utils";
import { cn } from "@/lib/utils";
import {
  STATE_LABELS,
  STATE_TONES,
  expiryNotice,
  type ExpiryNotice,
  type LimitRow,
  type SubscriptionOverview,
  type SubscriptionState,
} from "@/lib/subscription.shared";

export function StateBadge({ state }: { state: SubscriptionState }) {
  return <Badge tone={STATE_TONES[state]}>{STATE_LABELS[state]}</Badge>;
}

export function LimitBar({ row }: { row: LimitRow }) {
  const barTone = { ok: "bg-success", warn: "bg-warning", danger: "bg-danger" }[row.tone];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">{row.label}</p>
        <p className="text-[12.5px] tabular-nums text-muted-foreground">{row.display}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label={row.label}
        aria-valuenow={row.percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", barTone)}
          style={{ width: `${row.percent ?? 4}%` }}
        />
      </div>
      <p className="mt-1 text-[11.5px] text-text-muted">
        {row.percent === null ? "غير محدود في باقتك" : `${row.percent}% من الحد المسموح`}
      </p>
    </div>
  );
}

export function FeatureLine({
  label,
  available,
  value,
  requiredPlan,
}: {
  label: string;
  available: boolean;
  value?: string;
  requiredPlan?: string | null;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
            available ? "bg-success-soft text-success" : "bg-surface-muted text-text-muted",
          )}
          aria-hidden
        >
          {available ? <Check className="h-3 w-3" /> : <Lock className="h-2.5 w-2.5" />}
        </span>
        <span className="min-w-0">
          <span className={cn("block text-[13.5px]", !available && "text-muted-foreground")}>
            {label}
          </span>
          {!available && requiredPlan && (
            <span className="block text-[11.5px] text-text-muted">متوفرة في {requiredPlan}</span>
          )}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-[12.5px] tabular-nums",
          available ? "text-foreground" : "text-text-muted",
        )}
      >
        {value ?? (available ? "متوفر" : "غير متوفر")}
      </span>
    </li>
  );
}

const NOTICE_STYLES = {
  info: { wrap: "border-info/25 bg-info-soft text-info", Icon: Info },
  warn: { wrap: "border-warning/30 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { wrap: "border-danger/30 bg-danger-soft text-danger", Icon: ShieldAlert },
} as const;

export function NoticeBanner({ notice, action }: { notice: ExpiryNotice; action?: ReactNode }) {
  if (!notice) return null;
  const { wrap, Icon } = NOTICE_STYLES[notice.tone];
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-m)] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        wrap,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{notice.title}</p>
          <p className="text-[12.5px] opacity-90">{notice.body}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Global banner rendered inside the dashboard pages. */
export function SubscriptionAlert({ overview }: { overview: SubscriptionOverview | null }) {
  const notice = expiryNotice(overview);
  if (!notice) return null;
  return (
    <div className="mb-5">
      <NoticeBanner
        notice={notice}
        action={
          <Link to="/subscription" className="shrink-0">
            <Btn variant="ghost">إدارة الاشتراك</Btn>
          </Link>
        }
      />
    </div>
  );
}
