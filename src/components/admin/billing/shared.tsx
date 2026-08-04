import type { ReactNode } from "react";
import { Badge } from "@/lib/list-utils";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  REFUND_STATUS_LABELS,
  WEBHOOK_STATUS_LABELS,
  formatMoney,
  type InvoiceStatus,
  type PaymentStatus,
} from "@/lib/billing/billing.shared";

export function Money({ value, currency = "SAR" }: { value: number | string | null | undefined; currency?: string }) {
  return <span className="tabular-nums">{formatMoney(value, currency)}</span>;
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const key = status as InvoiceStatus;
  return <Badge tone={INVOICE_STATUS_TONES[key] ?? "default"}>{INVOICE_STATUS_LABELS[key] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const key = status as PaymentStatus;
  return <Badge tone={PAYMENT_STATUS_TONES[key] ?? "default"}>{PAYMENT_STATUS_LABELS[key] ?? status}</Badge>;
}

export function RefundStatusBadge({ status }: { status: string }) {
  const tone = status === "completed" ? "green" : status === "rejected" || status === "failed" ? "red" : "warn";
  return <Badge tone={tone}>{REFUND_STATUS_LABELS[status] ?? status}</Badge>;
}

export function WebhookStatusBadge({ status }: { status: string }) {
  const tone =
    status === "processed" ? "green" : status === "dead_letter" ? "red" : status === "failed" ? "warn" : "muted";
  return <Badge tone={tone}>{WEBHOOK_STATUS_LABELS[status] ?? status}</Badge>;
}

export function KpiCard({
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

/** حقل نصي/رقمي داخل النماذج المالية. */
export const num = (value: string): number => {
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** مفتاح منع تكرار الدفعات — يُولَّد مرة واحدة لكل نموذج. */
export const newIdempotencyKey = (): string =>
  `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
