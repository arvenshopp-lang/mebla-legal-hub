import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileDown, FileText, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canDo } from "@/lib/doc-permissions";
import { usePrintEngine } from "@/lib/print/print-engine";
import {
  exportWorkItemTimelineFn,
  getWorkItemTimelineFn,
} from "@/lib/work-items/timeline.functions";
import {
  TIMELINE_PAGE_SIZE,
  WORK_EVENTS,
  WORK_EVENT_LABELS,
  type WorkEventName,
  type WorkItemTimelineCursor,
  type WorkItemTimelineEvent,
} from "@/lib/work-items/timeline.shared";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { Badge } from "@/lib/list-utils";
import { cn } from "@/lib/utils";

const DOT_TONES: Record<string, string> = {
  completed: "bg-success",
  reopened: "bg-warning",
  due_changed: "bg-warning",
  assigned: "bg-warning",
  cancelled: "bg-danger",
  deleted: "bg-danger",
};

const TONES: Record<string, "green" | "red" | "warn" | "muted"> = {
  completed: "green",
  reopened: "warn",
  due_changed: "warn",
  assigned: "warn",
  cancelled: "red",
  deleted: "red",
};

const dueLabel = (v: string | null) => (v ? fmtDate(v) : "بدون تاريخ");

function downloadCsv(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** تصدير السجل: CSV مباشر، وPDF عبر محرك الطباعة المعتمد (علامة مائية + سجل تدقيق). */
function TimelineExport({
  organizationId,
  itemType,
  itemId,
}: {
  organizationId: string;
  itemType: "task" | "deadline";
  itemId: string;
}) {
  const { activeRole } = useAuth();
  const runExport = useServerFn(exportWorkItemTimelineFn);
  const { printHtml, can, busy: printBusy } = usePrintEngine();
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const allowed = canDo(activeRole, "print.export_pdf");
  if (!allowed) return null;

  const handle = async (format: "csv" | "pdf") => {
    setBusy(format);
    try {
      const result = await runExport({ data: { organizationId, itemType, itemId, format } });
      if (result.format === "csv") {
        downloadCsv(result.content, result.fileName);
        toast.success("تم تصدير السجل", { description: `${result.count} حدث بصيغة CSV` });
        return;
      }
      await printHtml({
        documentType: "report",
        title: result.title,
        fileName: result.fileName,
        classification: "internal",
        html: result.html,
      });
    } catch (error) {
      toast.error("تعذّر تصدير السجل", { description: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void handle("csv")}
        disabled={busy !== null}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {busy === "csv" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden="true" />
        )}
        تصدير CSV
      </button>
      {can("print.print") ? (
        <button
          type="button"
          onClick={() => void handle("pdf")}
          disabled={busy !== null || printBusy !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {busy === "pdf" || printBusy === "print" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          تصدير PDF
        </button>
      ) : null}
    </div>
  );
}

function detail(e: WorkItemTimelineEvent): string | null {
  switch (e.event) {
    case "assigned":
      return `من ${e.fromUserName ?? "بدون مسؤول"} إلى ${e.toUserName ?? "بدون مسؤول"}`;
    case "due_changed":
      return `من ${dueLabel(e.fromDueDate)} إلى ${dueLabel(e.toDueDate)}`;
    case "created":
    case "baseline":
      return e.toUserName ? `المسؤول: ${e.toUserName}` : "بدون مسؤول";
    default:
      return e.toUserName ? `المسؤول: ${e.toUserName}` : null;
  }
}

/** سجل أحداث المهمة/المهلة: إنشاء، إعادة إسناد، تغيير استحقاق، إنجاز، إعادة فتح. */
export function WorkItemTimeline({
  organizationId,
  itemType,
  itemId,
  enabled = true,
}: {
  organizationId: string;
  itemType: "task" | "deadline";
  itemId: string;
  enabled?: boolean;
}) {
  const fetchTimeline = useServerFn(getWorkItemTimelineFn);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["work-item-timeline", organizationId, itemType, itemId],
      enabled: enabled && !!organizationId && !!itemId,
      initialPageParam: null as WorkItemTimelineCursor | null,
      queryFn: ({ pageParam }) =>
        fetchTimeline({
          data: {
            organizationId,
            itemType,
            itemId,
            limit: TIMELINE_PAGE_SIZE,
            cursor: pageParam,
          },
        }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

  // إزالة أي تكرار محتمل بين الصفحات (نفس معرّف الحدث)
  const events = useMemo<WorkItemTimelineEvent[]>(() => {
    const seen = new Set<string>();
    const out: WorkItemTimelineEvent[] = [];
    for (const page of data?.pages ?? []) {
      for (const e of page.events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
      }
    }
    return out;
  }, [data]);

  const [selected, setSelected] = useState<WorkEventName[]>([]);

  const counts = useMemo(() => {
    const map = new Map<WorkEventName, number>();
    for (const e of events) map.set(e.event, (map.get(e.event) ?? 0) + 1);
    return map;
  }, [events]);

  const available = useMemo(() => WORK_EVENTS.filter((name) => counts.has(name)), [counts]);

  const visible = useMemo(
    () => events.filter((e) => selected.length === 0 || selected.includes(e.event)),
    [events, selected],
  );

  const toggle = (name: WorkEventName) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  return (
    <section aria-labelledby={`timeline-${itemId}`} className="mt-6 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3
          id={`timeline-${itemId}`}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          سجل الأحداث
          {events.length ? (
            <span className="text-xs font-normal text-muted-foreground">
              ({events.length}
              {hasNextPage ? "+" : ""} حدث)
            </span>
          ) : null}
        </h3>
        {events.length ? (
          <TimelineExport organizationId={organizationId} itemType={itemType} itemId={itemId} />
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل السجل…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          تعذّر عرض سجل الأحداث. حدّث الصفحة وأعد المحاولة.
        </p>
      ) : !events.length ? (
        <p className="text-sm text-muted-foreground">لا توجد أحداث مسجّلة بعد.</p>
      ) : (
        <>
          {available.length > 1 ? (
            <div
              role="group"
              aria-label="تصفية السجل حسب نوع الحدث"
              className="mb-4 flex flex-wrap gap-2"
            >
              <button
                type="button"
                onClick={() => setSelected([])}
                aria-pressed={selected.length === 0}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected.length === 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                الكل ({events.length}
                {hasNextPage ? "+" : ""})
              </button>
              {available.map((name) => {
                const active = selected.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(name)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {WORK_EVENT_LABELS[name]} ({counts.get(name)})
                  </button>
                );
              })}
            </div>
          ) : null}
          {!visible.length ? (
            <p className="text-sm text-muted-foreground">لا توجد أحداث مطابقة للتصفية المختارة.</p>
          ) : (
            <ol className="relative space-y-4 pe-6">
              <span
                aria-hidden="true"
                className="absolute end-[7px] top-2 bottom-2 w-px bg-border"
              />
              {visible.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -end-6 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-card",
                      DOT_TONES[e.event] ?? "bg-muted-foreground",
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONES[e.event] ?? "muted"}>{WORK_EVENT_LABELS[e.event]}</Badge>
                    <time
                      dateTime={e.occurredAt}
                      className="text-xs text-muted-foreground tabular-nums"
                    >
                      {fmtDateTime(e.occurredAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-foreground">{detail(e) ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.actorName ? `بواسطة ${e.actorName}` : "تلقائي"}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {hasNextPage ? (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              {isFetchingNextPage ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isFetchingNextPage ? "جاري التحميل…" : "تحميل المزيد من الأحداث"}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
