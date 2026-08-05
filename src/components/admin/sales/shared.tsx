import { Badge } from "@/lib/list-utils";
import {
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  type SalesDocKind,
  type SalesDocStatus,
} from "@/lib/sales-docs.shared";

export function Money({ value, currency = "SAR" }: { value: number; currency?: string }) {
  return (
    <span className="tabular-nums">
      {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
      {currency}
    </span>
  );
}

export function KindBadge({ kind }: { kind: SalesDocKind }) {
  return <Badge tone={kind === "contract" ? "gold" : "default"}>{KIND_LABELS[kind]}</Badge>;
}

export function StatusBadge({ status }: { status: SalesDocStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "default"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
