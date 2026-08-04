/**
 * لبنات واجهة مركز الدعم المشتركة — عرض فقط.
 * لا حساب مهل هنا: كل الطوابع والحالات تأتي محسوبة من الخادم.
 */
import type { ReactNode } from "react";
import { Badge } from "@/lib/list-utils";
import {
  SLA_STATE_LABELS,
  SLA_STATE_TONES,
  TICKET_CHANNEL_LABELS,
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUS_LABELS_AR,
  dueLabel,
  type SlaState,
  type TicketChannel,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/support.shared";

export function StatusBadge({ status }: { status: string }) {
  const key = status as TicketStatus;
  const tone =
    key === "closed"
      ? "muted"
      : key === "new"
        ? "info"
        : key === "escalated"
          ? "red"
          : key === "resolved"
            ? "green"
            : key === "in_progress"
              ? "gold"
              : "warn";
  return <Badge tone={tone}>{TICKET_STATUS_LABELS_AR[key] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const key = priority as TicketPriority;
  const tone = key === "urgent" ? "red" : key === "high" ? "warn" : key === "medium" ? "gold" : "muted";
  return <Badge tone={tone}>{TICKET_PRIORITY_LABELS_AR[key] ?? priority}</Badge>;
}

export function SlaBadge({ state }: { state: string }) {
  const key = state as SlaState;
  return <Badge tone={SLA_STATE_TONES[key] ?? "muted"}>{SLA_STATE_LABELS[key] ?? state}</Badge>;
}

export function channelLabel(channel: string): string {
  return TICKET_CHANNEL_LABELS[channel as TicketChannel] ?? channel;
}

/** الوقت المتبقي لمهلة، بلون يعكس القرب من التجاوز. */
export function DueCell({ dueAt, done }: { dueAt: string | null; done?: string | null }) {
  if (done) return <span className="text-[12px] text-success">أُنجزت</span>;
  if (!dueAt) return <span className="text-[12px] text-muted-foreground">—</span>;
  const late = new Date(dueAt).getTime() < Date.now();
  return (
    <span className={`text-[12px] tabular-nums ${late ? "text-danger" : "text-muted-foreground"}`}>
      {dueLabel(dueAt)}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className="surface-card p-4">
      <p className="text-caption">{label}</p>
      <p className={`mt-1.5 text-h4 tabular-nums ${toneCls}`}>{value}</p>
      {hint && <p className="text-caption mt-1">{hint}</p>}
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`التقييم ${value} من 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="14" height="14" viewBox="0 0 20 20" aria-hidden className="shrink-0">
          <path
            d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z"
            fill={n <= rounded ? "var(--color-warning)" : "transparent"}
            stroke="var(--color-warning)"
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </span>
  );
}

/** جدول بسيط لعرض التوزيعات في التقارير. */
export function BreakdownTable({
  caption,
  head,
  rows,
  empty = "لا توجد بيانات في هذه الفترة.",
}: {
  caption: string;
  head: string[];
  rows: (ReactNode[])[];
  empty?: string;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">{caption}</h3>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60">
                {head.map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-[11.5px] font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((cells, i) => (
                <tr key={i}>
                  {cells.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 align-middle tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
