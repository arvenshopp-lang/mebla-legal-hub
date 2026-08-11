/**
 * شارات وتنسيقات مشتركة لوحدة إدارة العلاقات (CRM).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/lib/list-utils";
import { exportCrmCsv } from "@/lib/crm.functions";
import { fmtDecimal } from "@/lib/format";
import {
  CRM_ACTIVITY_KIND_LABEL,
  CRM_DEAL_STATUS_LABEL,
  CRM_LEAD_STATUS_LABEL,
  type CrmActivityKind,
  type CrmDealStatus,
  type CrmLeadStatus,
} from "@/lib/crm.shared";

const LEAD_STATUS_TONE: Record<
  CrmLeadStatus,
  "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"
> = {
  new: "info",
  contacted: "warn",
  qualified: "gold",
  unqualified: "muted",
  converted: "green",
  lost: "red",
};

const DEAL_STATUS_TONE: Record<
  CrmDealStatus,
  "default" | "green" | "gold" | "red" | "warn" | "muted" | "info"
> = {
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
      {fmtDecimal(Number(value))} {currency || "SAR"}
    </span>
  );
}

export function OwnerCell({ owner }: { owner: { full_name: string } | null }) {
  return <span>{owner ? owner.full_name : "—"}</span>;
}

/** تنزيل تصدير CSV لكيان CRM مع رسائل عربية واضحة. */
export function useCrmCsvExport() {
  const exportFn = useServerFn(exportCrmCsv);
  const [exporting, setExporting] = useState<CrmExportEntity | null>(null);

  const download = async (entity: CrmExportEntity) => {
    setExporting(entity);
    try {
      const { csv, filename } = await exportFn({ data: { entity } });
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تصدير الملف.");
    } finally {
      setExporting(null);
    }
  };

  return { download, exporting };
}

export type CrmExportEntity = "leads" | "companies" | "contacts" | "deals";
