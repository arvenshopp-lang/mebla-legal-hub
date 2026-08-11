import { Badge } from "@/lib/list-utils";
import { fmtDate, fmtDateTime, fmtDecimal } from "@/lib/format";
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
      {fmtDecimal(value)} {currency}
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
  return fmtDate(value);
}

export function formatDateTime(value: string | null): string {
  return fmtDateTime(value);
}
