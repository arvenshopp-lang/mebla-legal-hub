import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import { fmtDateTime } from "@/lib/enums";
import { Badge, DataCard, EmptyState, ErrorBlock, LoadingBlock, Pagination, SectionCard, Td, Th } from "@/lib/list-utils";
import { listPrintAudit } from "@/lib/print/print-audit.functions";
import { CLASSIFICATION_LABELS, PRINT_ACTION_LABELS, type Classification, type PrintAction } from "@/lib/print/print.shared";

export const Route = createFileRoute("/_authenticated/print-log")({
  component: Page,
  head: () => ({
    meta: [
      { title: "سجل الطباعة والتصدير | مِهلة" },
      { name: "description", content: "سجل غير قابل للتعديل لكل عملية طباعة أو تصدير أو تنزيل داخل مكتبك." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const PAGE_SIZE = 25;

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
          <EmptyState title="لا توجد عمليات طباعة" hint="ستظهر هنا أول عملية طباعة أو تصدير داخل المكتب." />
        ) : (
          <>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr>
                    <Th>معرّف الطباعة</Th>
                    <Th>العملية</Th>
                    <Th>المستند</Th>
                    <Th>التصنيف</Th>
                    <Th>المنفّذ</Th>
                    <Th>النسخة</Th>
                    <Th>الجهاز</Th>
                    <Th>IP</Th>
                    <Th>التاريخ</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-muted/40">
                      <Td className="font-mono text-xs">{row.print_ref}</Td>
                      <Td>
                        <Badge tone={row.action === "print" ? "info" : "muted"}>
                          {PRINT_ACTION_LABELS[row.action as PrintAction] ?? row.action}
                        </Badge>
                      </Td>
                      <Td className="font-medium">
                        {row.document_title}
                        <div className="text-xs text-muted-foreground">
                          {row.document_ref} · {row.document_version} · {row.pages_count} صفحة
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={row.classification === "internal" ? "muted" : "warning"}>
                          {CLASSIFICATION_LABELS[row.classification as Classification] ?? row.classification}
                        </Badge>
                      </Td>
                      <Td>
                        {row.user_name ?? "—"}
                        <div className="text-xs text-muted-foreground">{row.user_email ?? "—"}</div>
                      </Td>
                      <Td>{row.copy_number}</Td>
                      <Td>
                        {row.device ?? "—"}
                        <div className="text-xs text-muted-foreground">
                          {row.browser ?? "—"} · {row.os ?? "—"}
                        </div>
                      </Td>
                      <Td className="font-mono text-xs">
                        {row.ip || "—"}
                        {row.country ? ` · ${row.country}` : ""}
                      </Td>
                      <Td>{fmtDateTime(row.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}
      </SectionCard>
    </DashboardShell>
  );
}