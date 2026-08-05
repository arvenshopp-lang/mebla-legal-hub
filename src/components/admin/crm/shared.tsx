/**
 * شارات وتنسيقات مشتركة لوحدة إدارة العلاقات (CRM).
 */
import { Badge } from "@/lib/list-utils";
import {
  CRM_ACTIVITY_KIND_LABEL,
  CRM_DEAL_STATUS_LABEL,
  CRM_LEAD_STATUS_LABEL,
  type CrmActivityKind,
  type CrmDealStatus,
  type CrmLeadStatus,
} from "@/lib/crm.shared";

const LEAD_STATUS_TONE: Record<CrmLeadStatus, "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"> = {
  new: "info",
  contacted: "warn",
  qualified: "gold",
  unqualified: "muted",
  converted: "green",
  lost: "red",
};

const DEAL_STATUS_TONE: Record<CrmDealStatus, "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"> = {
  open: "info",
  won: "green",
  lost: "red",
  abandoned: "muted",
};

export function LeadStatusBadge({ status }: { status: CrmLeadStatus }) {
  return <Badge tone={LEAD_STATUS_TONE[status]}>{CRM_LEAD_STATUS_LABEL[status]}</Badge>;
}

export function DealStatusBadge({ status }: { status: CrmDealStatus }) {
  return <Badge tone={DEAL_STATUS_TONE[status]}>{CRM_DEAL_STATUS_LABEL[status]}</Badge>;
}

export function ActivityKindBadge({ kind }: { kind: CrmActivityKind }) {
  return <Badge tone="default">{CRM_ACTIVITY_KIND_LABEL[kind]}</Badge>;
}

export function Money({ value, currency = "SAR" }: { value: number; currency?: string | null }) {
  return (
    <span className="tabular-nums">
      {Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
      {currency || "SAR"}
    </span>
  );
}

export function OwnerCell({ owner }: { owner: { full_name: string } | null }) {
  return <span>{owner ? owner.full_name : "—"}</span>;
}
