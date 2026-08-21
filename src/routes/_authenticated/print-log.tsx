import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import { fmtDateTime } from "@/lib/enums";
import {
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  SectionCard,
} from "@/lib/list-utils";
import { DataView, type Column } from "@/components/data/data-view";
import { listPrintAudit } from "@/lib/print/print-audit.functions";
import {
  CLASSIFICATION_LABELS,
  PRINT_ACTION_LABELS,
  type Classification,
  type PrintAction,
} from "@/lib/print/print.shared";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/_authenticated/print-log")({
  component: Page,
  head: () => ({
    meta: [
      { title: "سجل الطباعة والتصدير | مِهلة" },
      {
        name: "description",
        content: "سجل غير قابل للتعديل لكل عملية طباعة أو تصدير أو تنزيل داخل مكتبك.",
      },
      NOINDEX_META,
    ],
  }),
});

const PAGE_SIZE = 25;

type PrintAuditRow = {
  id: string;
  print_ref: string;
  action: string;
  document_title: string;
  document_ref: string;
  document_version: string | number;
  pages_count: number;
  classification: string;
  user_name: string | null;
  user_email: string | null;
  copy_number: number;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  country: string | null;
  created_at: string;
};

const printColumns: Column<PrintAuditRow>[] = [
  {
    id: "ref",
    header: "معرّف الطباعة",
    mobile: "subtitle",
    className: "font-mono text-xs",
    cell: (row) => <span className="font-mono text-xs">{row.print_ref}</span>,
  },
  {
    id: "action",
    header: "العملية",
    cell: (row) => (
      <Badge tone={row.action === "print" ? "info" : "muted"}>
        {PRINT_ACTION_LABELS[row.action as PrintAction] ?? row.action}
      </Badge>
    ),
  },
  {
    id: "document",
    header: "المستند",
    mobile: "title",
    wrap: true,
    cell: (row) => (
      <>
        {row.document_title}
        <div className="text-xs text-muted-foreground">
          {row.document_ref} · {row.document_version} · {row.pages_count} صفحة
        </div>
      </>
    ),
  },
  {
    id: "classification",
    header: "التصنيف",
    cell: (row) => (
      <Badge tone={row.classification === "internal" ? "muted" : "warn"}>
        {CLASSIFICATION_LABELS[row.classification as Classification] ?? row.classification}
      </Badge>
    ),
  },
  {
    id: "user",
    header: "المنفّذ",
    cell: (row) => (
      <>
        {row.user_name ?? "—"}
        <div className="text-xs text-muted-foreground">{row.user_email ?? "—"}</div>
      </>
    ),
  },
  { id: "copy", header: "النسخة", cell: (row) => row.copy_number },
  {
    id: "device",
    header: "الجهاز",
    cell: (row) => (
      <>
        {row.device ?? "—"}
        <div className="text-xs text-muted-foreground">
          {row.browser ?? "—"} · {row.os ?? "—"}
        </div>
      </>
    ),
  },
  {
    id: "ip",
    header: "IP",
    cell: (row) => (
      <span className="font-mono text-xs">
        {row.ip || "—"}
        {row.country ? ` · ${row.country}` : ""}
      </span>
    ),
  },
  { id: "date", header: "التاريخ", cell: (row) => fmtDateTime(row.created_at) },
];

function Page() {
  const { activeOrgId } = useAuth();
  const fetchLog = useServerFn(listPrintAudit);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["print-audit", activeOrgId, page],
    enabled: !!activeOrgId,
    queryFn: () =>
      fetchLog({
        data: { organizationId: activeOrgId!, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      }),
  });

  return (
    <DashboardShell title="سجل الطباعة والتصدير">
      <SectionCard
        title="سجل غير قابل للتعديل"
        description="كل عملية طباعة أو تصدير PDF أو تنزيل تُسجَّل تلقائياً مع هوية المنفّذ وبصمة جهازه، ولا يمكن تعديل السجل أو حذفه."
      >
        {isLoading ? (
          <LoadingBlock rows={6} cols={5} />
        ) : error ? (
          <ErrorBlock message={(error as Error).message} />
        ) : !data?.rows.length ? (
          <EmptyState
            title="لا توجد عمليات طباعة"
            hint="ستظهر هنا أول عملية طباعة أو تصدير داخل المكتب."
          />
        ) : (
          <>
            <DataView
              label="سجل الطباعة والتصدير"
              rows={data.rows as PrintAuditRow[]}
              rowKey={(row) => row.id}
              columns={printColumns}
            />
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
