import { Badge } from "@/lib/list-utils";
import {
  OFFICE_INVOICE_DISPLAY_LABELS,
  STATUS_TONE,
  type OfficeInvoiceDisplayStatus,
} from "@/lib/office-billing/billing.shared";

const TONE_MAP: Record<
  "neutral" | "info" | "success" | "warn" | "danger",
  "default" | "info" | "green" | "warn" | "red"
> = {
  neutral: "default",
  info: "info",
  success: "green",
  warn: "warn",
  danger: "red",
};

export function InvoiceStatusBadge({ status }: { status: OfficeInvoiceDisplayStatus }) {
  return (
    <Badge tone={TONE_MAP[STATUS_TONE[status]]}>{OFFICE_INVOICE_DISPLAY_LABELS[status]}</Badge>
  );
}
