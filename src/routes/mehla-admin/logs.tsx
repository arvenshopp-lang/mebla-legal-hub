import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Eye } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  IconBtn,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  exportAuditLogs,
  listAuditFacets,
  listAuditLogs,
  type AuditLogRow,
} from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/logs")({
  head: () => ({
    meta: [
      { title: "سجل التدقيق · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LogsPage,
});

const ACTION_LABELS: Record<string, string> = {
  "subscription.activate": "تفعيل اشتراك",
  "subscription.cancel": "إلغاء اشتراك",
  "staff.create": "إضافة موظف",
  "staff.update": "تعديل موظف",
  "ticket.reply": "رد على تذكرة",
  "plan.update": "تعديل باقة",
  "settings.update": "تعديل إعدادات",
};

const ENTITY_LABELS: Record<string, string> = {
  subscription: "اشتراك",
  staff: "موظف",
  ticket: "تذكرة",
  plan: "باقة",
  settings: "إعدادات",
  platform_settings: "إعدادات المنصة",
  platform_role: "دور إداري",
  email_template: "قالب بريد",
  broadcast: "إشعار جماعي",
  organization: "مكتب",
  user: "مستخدم",
  audit: "سجل التدقيق",
  support_access: "وصول دعم مؤقت",
};

const PAGE_SIZE = 25;

function LogsPage() {
  const { can } = usePlatformAdmin();
  const canExport = can("audit.export");

  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const debounced = useDebounced(search);
  const debouncedActor = useDebounced(actor);

  const listFn = useServerFn(listAuditLogs);
  const facetsFn = useServerFn(listAuditFacets);
  const { data: facets } = useQuery({
    queryKey: ["admin-logs-facets"],
    queryFn: () => facetsFn({ data: undefined }),
    staleTime: 5 * 60_000,
  });

  const filters = {
    search: debounced,
    actor: debouncedActor,
    action: action === "all" ? "" : action,
    entity: entity === "all" ? "" : entity,
    from,
    to,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-logs", filters, page],
    queryFn: () => listFn({ data: { ...filters, page, pageSize: PAGE_SIZE } }),
  });

  const rows = data?.rows ?? [];

  const exportFn = useServerFn(exportAuditLogs);
  const exportCsv = useMutation({
    mutationFn: () => exportFn({ data: filters }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mehla-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير سجل التدقيق.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setPage(1);
      setter(value);
    };

  return (
    <AdminShell
      title="سجل التدقيق"
      description="سجل غير قابل للتعديل لكل عملية إدارية، يوثّق المنفّذ والقيم قبل/بعد وعنوان الشبكة والجهاز."
      actions={
        canExport ? (
          <Btn
            size="sm"
            variant="outline"
            loading={exportCsv.isPending}
            onClick={() => exportCsv.mutate()}
          >
            <Download className="h-4 w-4" aria-hidden /> تصدير CSV
          </Btn>
        ) : undefined
      }
    >
      <PageToolbar
        search={search}
        setSearch={resetPage(setSearch)}
        placeholder="بحث في وصف العملية…"
        searching={isFetching && !isLoading}
        filters={
          <>
            <input
              value={actor}
              onChange={(e) => resetPage(setActor)(e.target.value)}
              placeholder="بريد المنفّذ"
              aria-label="بريد المنفّذ"
              dir="ltr"
              className={`${inputCls} h-11 w-auto min-w-[170px]`}
            />
            <select
              value={entity}
              onChange={(e) => resetPage(setEntity)(e.target.value)}
              aria-label="نوع العنصر"
              className={`${inputCls} h-11 w-auto min-w-[150px]`}
            >
              <option value="all">كل الأنواع</option>
              {(facets?.entities ?? Object.keys(ENTITY_LABELS)).map((v) => (
                <option key={v} value={v}>
                  {ENTITY_LABELS[v] ?? v}
                </option>
              ))}
            </select>
            <select
              value={action}
              onChange={(e) => resetPage(setAction)(e.target.value)}
              aria-label="نوع العملية"
              className={`${inputCls} h-11 w-auto min-w-[170px]`}
            >
              <option value="all">كل العمليات</option>
              {(facets?.actions ?? Object.keys(ACTION_LABELS)).map((v) => (
                <option key={v} value={v}>
                  {ACTION_LABELS[v] ?? v}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => resetPage(setFrom)(e.target.value)}
              aria-label="من تاريخ"
              className={`${inputCls} h-11 w-auto`}
            />
            <input
              type="date"
              value={to}
              onChange={(e) => resetPage(setTo)(e.target.value)}
              aria-label="إلى تاريخ"
              className={`${inputCls} h-11 w-auto`}
            />
          </>
        }
      />

      {isLoading ? (
        <LoadingBlock rows={8} cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا توجد سجلات مطابقة"
          hint="جرّب توسيع المدة الزمنية أو إزالة عوامل التصفية."
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[820px] text-right">
              <thead>
                <tr>
                  <Th>التاريخ</Th>
                  <Th>المنفّذ</Th>
                  <Th>العملية</Th>
                  <Th>النوع</Th>
                  <Th>التفاصيل</Th>
                  <Th>الجهاز</Th>
                  <Th>IP</Th>
                  <Th>عرض</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-muted/60">
                    <Td className="whitespace-nowrap text-[12px] text-muted-foreground">
                      {fmtDateTime(l.created_at)}
                    </Td>
                    <Td className="text-left text-[12px]">{l.actor_email ?? "—"}</Td>
                    <Td>
                      <Badge tone="info">{ACTION_LABELS[l.action] ?? l.action}</Badge>
                    </Td>
                    <Td>{ENTITY_LABELS[l.entity_type] ?? l.entity_type}</Td>
                    <Td className="max-w-[260px] text-[12px] text-muted-foreground">
                      <span className="block truncate" title={l.description ?? ""}>
                        {l.description ?? "—"}
                      </span>
                    </Td>
                    <Td className="text-[12px] text-muted-foreground">
                      {[l.device, l.browser].filter(Boolean).join(" · ") || "—"}
                    </Td>
                    <Td className="text-left text-[12px] text-muted-foreground">{l.ip ?? "—"}</Td>
                    <Td>
                      <IconBtn aria-label="عرض تفاصيل السجل" onClick={() => setDetail(l)}>
                        <Eye className="h-4 w-4" aria-hidden />
                      </IconBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={data?.total ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="تفاصيل العملية"
        size="lg"
      >
        {detail && (
          <div className="space-y-4 text-body-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Row label="التاريخ" value={fmtDateTime(detail.created_at)} />
              <Row label="المنفّذ" value={detail.actor_email ?? "—"} />
              <Row label="العملية" value={ACTION_LABELS[detail.action] ?? detail.action} />
              <Row label="النوع" value={ENTITY_LABELS[detail.entity_type] ?? detail.entity_type} />
              <Row label="معرّف العنصر" value={detail.entity_id ?? "—"} />
              <Row label="عنوان الشبكة" value={detail.ip ?? "—"} />
              <Row label="الجهاز" value={detail.device ?? "—"} />
              <Row label="المتصفح" value={detail.browser ?? "—"} />
            </dl>
            {detail.description && <p className="text-muted-foreground">{detail.description}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <JsonBlock title="القيم قبل" value={detail.before_data} />
              <JsonBlock title="القيم بعد" value={detail.after_data} />
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="text-caption mb-1">{title}</p>
      <pre
        dir="ltr"
        className="max-h-56 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 font-mono text-[12px] leading-5"
      >
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
