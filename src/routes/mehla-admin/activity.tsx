import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  SectionCard,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { buildCsv } from "@/lib/csv";
import { getActivityFeed } from "@/lib/admin-observability.functions";
import {
  ACTIVITY_SOURCE_LABELS,
  type ActivityEvent,
  type ActivitySource,
} from "@/lib/admin-observability.shared";

const SOURCES: ActivitySource[] = ["admin", "tenant", "failure"];
const PAGE_SIZES = [25, 50, 100];

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  src: fallback(z.string(), "admin,tenant,failure").default("admin,tenant,failure"),
  size: fallback(z.number().int(), 50).default(50),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/mehla-admin/activity")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "سجل النشاط الموحّد · إدارة مِهلة" },
      { name: "description", content: "سجل موحّد لعمليات الإدارة ونشاط المكاتب والأعطال المسجّلة في منصة مِهلة." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivityPage,
});

const toneOf = (source: ActivitySource) =>
  source === "failure" ? ("red" as const) : source === "admin" ? ("info" as const) : ("green" as const);

function ActivityPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { q, src, size, page } = Route.useSearch();
  const load = useServerFn(getActivityFeed);
  const [detail, setDetail] = useState<ActivityEvent | null>(null);
  const debouncedQuery = useDebounced(q, 350);

  const sources = useMemo<ActivitySource[]>(() => {
    const parsed = src.split(",").filter((s): s is ActivitySource => SOURCES.includes(s as ActivitySource));
    return parsed.length > 0 ? parsed : SOURCES;
  }, [src]);

  const pageSize = PAGE_SIZES.includes(size) ? size : 50;
  const safePage = Math.max(1, page);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-activity", debouncedQuery, sources.join(","), pageSize, safePage],
    queryFn: () =>
      load({
        data: {
          sources,
          search: debouncedQuery,
          from: null,
          to: null,
          limit: pageSize,
          offset: (safePage - 1) * pageSize,
        },
      }),
    staleTime: 15_000,
  });

  const setSearch = (patch: Partial<{ q: string; src: string; size: number; page: number }>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const toggleSource = (source: ActivitySource) => {
    const next = sources.includes(source) ? sources.filter((s) => s !== source) : [...sources, source];
    setSearch({ src: (next.length > 0 ? next : SOURCES).join(","), page: 1 });
  };

  const exportCsv = () => {
    const events = data?.events ?? [];
    if (events.length === 0) {
      toast.error("لا توجد أحداث لتصديرها.");
      return;
    }
    const csv = buildCsv(
      ["التاريخ", "النوع", "العملية", "المنفّذ", "الكيان", "الوصف", "IP"],
      events.map((e) => [
        fmtDateTime(e.createdAt),
        ACTIVITY_SOURCE_LABELS[e.source],
        e.action,
        e.actor,
        e.entityType,
        e.description,
        e.ip ?? "",
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mehla-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير الأحداث المعروضة.");
  };

  const events = data?.events ?? [];

  return (
    <AdminShell
      title="سجل النشاط الموحّد"
      description="عمليات الإدارة ونشاط المكاتب والأعطال المسجّلة في تدفّق واحد مرتّب زمنياً."
      actions={
        <>
          <Btn variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            تصدير CSV
          </Btn>
          <Btn variant="outline" size="sm" loading={isFetching} onClick={() => void refetch()}>
            تحديث
          </Btn>
        </>
      }
    >
      <SectionCard title="الفلاتر" description="الفلاتر محفوظة في رابط الصفحة، ويمكنك مشاركتها مع فريقك كما هي.">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-caption">بحث في العملية أو المنفّذ أو الوصف</span>
            <input
              className={inputCls}
              value={q}
              onChange={(e) => setSearch({ q: e.target.value, page: 1 })}
              placeholder="مثال: subscription_update أو مرجع عطل"
              aria-label="بحث في سجل النشاط"
            />
          </label>
          <label className="block sm:w-40">
            <span className="mb-1.5 block text-caption">عدد الصفوف</span>
            <select
              className={inputCls}
              value={pageSize}
              onChange={(e) => setSearch({ size: Number(e.target.value), page: 1 })}
              aria-label="عدد الصفوف في الصفحة"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} صفاً
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {SOURCES.map((source) => (
            <button
              key={source}
              onClick={() => toggleSource(source)}
              aria-pressed={sources.includes(source)}
              className={`h-9 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
                sources.includes(source)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-surface-muted"
              }`}
            >
              {ACTIVITY_SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock rows={8} cols={5} />
        ) : isError ? (
          <ErrorBlock message="تعذّر قراءة سجل النشاط. تأكد من صلاحية «قراءة سجل التدقيق» ثم أعد المحاولة." />
        ) : events.length === 0 ? (
          <EmptyState
            title="لا توجد أحداث مطابقة"
            hint="جرّب توسيع نطاق الفلاتر أو حذف نص البحث."
            action={
              <Btn variant="outline" size="sm" onClick={() => setSearch({ q: "", src: SOURCES.join(","), page: 1 })}>
                إعادة ضبط الفلاتر
              </Btn>
            }
          />
        ) : (
          <>
            <DataCard>
              <table className="w-full text-right">
                <thead className="sticky top-16 z-10 bg-surface">
                  <tr>
                    <Th>التاريخ</Th>
                    <Th>النوع</Th>
                    <Th>العملية</Th>
                    <Th className="hidden md:table-cell">المنفّذ</Th>
                    <Th className="hidden lg:table-cell">الوصف</Th>
                    <Th>تفاصيل</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <Td>{fmtDateTime(event.createdAt)}</Td>
                      <Td>
                        <Badge tone={toneOf(event.source)}>{ACTIVITY_SOURCE_LABELS[event.source]}</Badge>
                      </Td>
                      <Td>
                        <span className="font-semibold">{event.action}</span>
                        <span className="text-caption block">{event.entityType}</span>
                      </Td>
                      <Td className="hidden md:table-cell">{event.actor}</Td>
                      <Td className="hidden lg:table-cell">
                        <span className="block max-w-[320px] truncate">{event.description || "—"}</span>
                      </Td>
                      <Td>
                        <Btn size="sm" variant="outline" onClick={() => setDetail(event)}>
                          عرض
                        </Btn>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-caption">
                صفحة {safePage} · {events.length} حدثاً معروضاً
              </p>
              <div className="flex items-center gap-2">
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setSearch({ page: safePage - 1 })}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  السابق
                </Btn>
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={!data?.hasMore}
                  onClick={() => setSearch({ page: safePage + 1 })}
                >
                  التالي
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="تفاصيل الحدث">
        {detail && (
          <dl className="space-y-3 text-body-sm">
            <Detail label="التاريخ" value={fmtDateTime(detail.createdAt)} />
            <Detail label="النوع" value={ACTIVITY_SOURCE_LABELS[detail.source]} />
            <Detail label="العملية" value={detail.action} />
            <Detail label="المنفّذ" value={detail.actor} />
            <Detail label="الكيان" value={`${detail.entityType}${detail.entityId ? ` · ${detail.entityId}` : ""}`} />
            <Detail label="الوصف" value={detail.description || "—"} />
            <Detail label="عنوان الشبكة" value={detail.ip ?? "—"} />
            <Detail label="الجهاز" value={detail.device ?? "—"} />
            {Object.entries(detail.metadata).length > 0 && (
              <div>
                <dt className="text-caption">بيانات إضافية</dt>
                <dd className="mt-1 space-y-1">
                  {Object.entries(detail.metadata).map(([key, value]) => (
                    <p key={key} className="text-[12.5px]">
                      <span className="text-muted-foreground">{key}:</span> {String(value ?? "—")}
                    </p>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </AdminShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}
