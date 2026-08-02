import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
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
import { listSystemFailures, type SystemFailureRow } from "@/lib/observability/failure-log.functions";

export const Route = createFileRoute("/mehla-admin/failures")({
  head: () => ({
    meta: [{ title: "سجل الأعطال · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: FailuresPage,
});

const SURFACE_LABELS: Record<string, string> = {
  secure_view: "عرض المستندات",
  secure_share: "روابط المشاركة",
  document_processing: "معالجة المستندات",
  support_ticket: "تذاكر الدعم",
  support_message: "رسائل الدعم",
  support_rating: "تقييم الدعم",
  print: "الطباعة",
  other: "أخرى",
};

const PAGE_SIZE = 25;

function FailuresPage() {
  const [search, setSearch] = useState("");
  const [surface, setSurface] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<SystemFailureRow | null>(null);

  const debounced = useDebounced(search);
  const listFn = useServerFn(listSystemFailures);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-failures", debounced, surface, from, to, page],
    queryFn: () => listFn({ data: { search: debounced, surface, from, to, page, pageSize: PAGE_SIZE } }),
  });

  const rows = data?.rows ?? [];

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setPage(1);
      setter(value);
    };

  const copyRef = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      toast.success("تم نسخ معرّف التعرّف.");
    } catch {
      toast.error("تعذّر النسخ، انسخ المعرّف يدوياً.");
    }
  };

  return (
    <AdminShell
      title="سجل الأعطال"
      description="كل عطل في عرض المستندات أو تذاكر الدعم يُسجَّل بمعرّف تعرّف آمن لتتبّع السبب دون كشف أي بيانات للمستخدم."
    >
      <PageToolbar
        search={search}
        setSearch={resetPage(setSearch)}
        placeholder="بحث بمعرّف التعرّف أو نص العطل…"
        searching={isFetching && !isLoading}
        filters={
          <>
            <select
              value={surface}
              onChange={(e) => resetPage(setSurface)(e.target.value)}
              aria-label="سطح النظام"
              className={`${inputCls} h-11 w-auto min-w-[170px]`}
            >
              <option value="all">كل الأسطح</option>
              {Object.entries(SURFACE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
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
        <EmptyState title="لا توجد أعطال مسجّلة" hint="جرّب توسيع المدة الزمنية أو إزالة عوامل التصفية." />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[820px] text-right">
              <thead>
                <tr>
                  <Th>التاريخ</Th>
                  <Th>معرّف التعرّف</Th>
                  <Th>السطح</Th>
                  <Th>الإجراء</Th>
                  <Th>الوصف</Th>
                  <Th>الحالة</Th>
                  <Th>عرض</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-muted/60">
                    <Td className="whitespace-nowrap text-[12px] text-muted-foreground">{fmtDateTime(row.created_at)}</Td>
                    <Td className="text-left">
                      <button
                        type="button"
                        onClick={() => copyRef(row.ref)}
                        className="inline-flex items-center gap-1.5 font-mono text-[12px] hover:underline"
                        title="نسخ معرّف التعرّف"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {row.ref}
                      </button>
                    </Td>
                    <Td>
                      <Badge tone="warning">{SURFACE_LABELS[row.surface] ?? row.surface}</Badge>
                    </Td>
                    <Td className="text-left text-[12px]">{row.action}</Td>
                    <Td className="max-w-[280px] text-[12px] text-muted-foreground">
                      <span className="block truncate" title={row.error_message}>
                        {row.error_message}
                      </span>
                    </Td>
                    <Td className="text-[12px] text-muted-foreground">{row.http_status ?? "—"}</Td>
                    <Td>
                      <IconBtn aria-label="عرض تفاصيل العطل" onClick={() => setDetail(row)}>
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

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="تفاصيل العطل" size="lg">
        {detail && (
          <div className="space-y-4 text-body-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Row label="معرّف التعرّف" value={detail.ref} />
              <Row label="التاريخ" value={fmtDateTime(detail.created_at)} />
              <Row label="السطح" value={SURFACE_LABELS[detail.surface] ?? detail.surface} />
              <Row label="الإجراء" value={detail.action} />
              <Row label="رمز الخطأ" value={detail.error_code ?? "—"} />
              <Row label="حالة الاستجابة" value={detail.http_status ? String(detail.http_status) : "—"} />
              <Row label="المسار" value={detail.path ?? "—"} />
              <Row label="المكتب" value={detail.organization_id ?? "—"} />
              <Row label="المستخدم" value={detail.user_id ?? "—"} />
              <Row label="المستند" value={detail.document_id ?? "—"} />
              <Row label="التذكرة" value={detail.ticket_id ?? "—"} />
              <Row label="عنوان الشبكة" value={detail.ip ?? "—"} />
              <Row label="الجهاز" value={[detail.device, detail.os].filter(Boolean).join(" · ") || "—"} />
              <Row label="المتصفح" value={detail.browser ?? "—"} />
            </dl>
            <div>
              <p className="text-caption mb-1">نص العطل</p>
              <pre
                dir="ltr"
                className="max-h-40 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 font-mono text-[12px] leading-5"
              >
                {detail.error_message}
              </pre>
            </div>
            <div>
              <p className="text-caption mb-1">بيانات إضافية</p>
              <pre
                dir="ltr"
                className="max-h-40 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 font-mono text-[12px] leading-5"
              >
                {detail.metadata && Object.keys(detail.metadata).length ? JSON.stringify(detail.metadata, null, 2) : "—"}
              </pre>
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
