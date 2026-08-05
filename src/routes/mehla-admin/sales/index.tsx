import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  PageToolbar,
  SectionCard,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { salesExportCsv, salesList } from "@/lib/sales-docs.functions";
import { KIND_LABELS, STATUS_LABELS, type SalesDocKind, type SalesDocStatus } from "@/lib/sales-docs.shared";
import { DocumentFormModal, emptyDraft } from "@/components/admin/sales/document-form";
import { TemplatesPanel } from "@/components/admin/sales/templates-panel";
import { KindBadge, Money, StatusBadge, formatDate } from "@/components/admin/sales/shared";

type TabKey = SalesDocKind | "all" | "templates";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "quote", label: "عروض الأسعار" },
  { key: "proposal", label: "المقترحات" },
  { key: "contract", label: "العقود" },
  { key: "templates", label: "القوالب" },
];

const isTab = (value: unknown): value is TabKey => TABS.some((tab) => tab.key === value);

export const Route = createFileRoute("/mehla-admin/sales/")({
  head: () => ({
    meta: [
      { title: "العروض والعقود · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({ tab: isTab(search.tab) ? search.tab : ("all" as TabKey) }),
  component: SalesPage,
});

const PAGE_SIZE = 20;

function SalesPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { can } = usePlatformAdmin();
  const listFn = useServerFn(salesList);
  const exportFn = useServerFn(salesExportCsv);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | SalesDocStatus>("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const debounced = useDebounced(search);

  const kind = tab === "all" || tab === "templates" ? null : tab;
  const filters = {
    search: debounced || null,
    kind,
    status: status || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const documents = useQuery({
    queryKey: ["sales-documents", filters],
    queryFn: () => listFn({ data: filters }),
    enabled: can("sales_docs.read") && tab !== "templates",
  });

  const exportCsv = async () => {
    try {
      const result = await exportFn({ data: { ...filters, page: 1, pageSize: 100 } });
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تصدير الملف.");
    }
  };

  if (!can("sales_docs.read")) {
    return (
      <AdminShell title="العروض والعقود">
        <EmptyState
          title="لا تملك صلاحية الوصول"
          hint="الوصول إلى وحدة العروض والعقود يتطلب صلاحية «مشاهدة العروض والعقود»."
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="العروض والعقود"
      description="عروض الأسعار والمقترحات والعقود — اعتماد، إرسال، توقيع إلكتروني، وتحويل لفاتورة أو اشتراك."
      actions={
        tab !== "templates" && can("sales_docs.export") ? (
          <Btn variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden /> تصدير CSV
          </Btn>
        ) : undefined
      }
    >
      <div className="mb-5 -mx-1 overflow-x-auto px-1">
        <nav className="flex min-w-max gap-1 rounded-[var(--radius-m)] bg-surface-muted p-1" aria-label="أقسام العروض والعقود">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => {
                setPage(1);
                void navigate({ search: { tab: item.key }, replace: true });
              }}
              className={`min-h-10 whitespace-nowrap rounded-[var(--radius-s)] px-3.5 text-body-sm transition ${
                tab === item.key
                  ? "bg-surface font-semibold text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "templates" ? (
        <TemplatesPanel />
      ) : (
        <SectionCard>
          <PageToolbar
            search={search}
            setSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searching={documents.isFetching}
            placeholder="بحث بالعنوان أو الرقم…"
            onAdd={can("sales_docs.create") ? () => setFormOpen(true) : undefined}
            addLabel="مستند جديد"
            filters={
              <select
                className={`${inputCls} h-11 w-auto min-w-[10rem]`}
                aria-label="تصفية بالحالة"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as SalesDocStatus | "");
                  setPage(1);
                }}
              >
                <option value="">كل الحالات</option>
                {(Object.keys(STATUS_LABELS) as SalesDocStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {STATUS_LABELS[key]}
                  </option>
                ))}
              </select>
            }
          />

          {documents.isLoading ? (
            <LoadingBlock rows={6} cols={6} />
          ) : documents.isError ? (
            <ErrorBlock message="تعذّر جلب المستندات. حدّث الصفحة أو تحقق من صلاحياتك." />
          ) : (documents.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              title="لا توجد مستندات"
              hint="ابدأ بإنشاء عرض سعر أو مقترح أو عقد جديد."
              action={
                can("sales_docs.create") ? (
                  <Btn onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> مستند جديد
                  </Btn>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataCard>
                <table className="w-full text-body-sm">
                  <thead>
                    <tr>
                      <Th>الرقم</Th>
                      <Th>النوع</Th>
                      <Th>العنوان</Th>
                      <Th>العميل</Th>
                      <Th>الحالة</Th>
                      <Th>الإجمالي</Th>
                      <Th>صالح حتى</Th>
                      <Th>—</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(documents.data?.rows ?? []).map((row) => (
                      <tr key={row.id}>
                        <Td className="tabular-nums">{row.number ?? "مسودة"}</Td>
                        <Td>
                          <KindBadge kind={row.kind} />
                        </Td>
                        <Td className="max-w-[16rem] truncate">{row.title}</Td>
                        <Td>{row.organization_name ?? "—"}</Td>
                        <Td>
                          <StatusBadge status={row.status} />
                        </Td>
                        <Td>
                          <Money value={row.total} currency={row.currency} />
                        </Td>
                        <Td>{formatDate(row.valid_until)}</Td>
                        <Td>
                          <Link
                            to="/mehla-admin/sales/$id"
                            params={{ id: row.id }}
                            className="text-body-sm font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            التفاصيل
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
              <Pagination page={page} setPage={setPage} total={documents.data?.total ?? 0} pageSize={PAGE_SIZE} />
            </>
          )}
        </SectionCard>
      )}

      {formOpen && (
        <DocumentFormModal
          open
          onClose={() => setFormOpen(false)}
          initial={emptyDraft(kind ?? "quote")}
          onSaved={(id) => void navigate({ to: "/mehla-admin/sales/$id", params: { id } } as never)}
        />
      )}
    </AdminShell>
  );
}
