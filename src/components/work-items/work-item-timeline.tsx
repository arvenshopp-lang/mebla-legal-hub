import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { getWorkItemTimelineFn } from "@/lib/work-items/timeline.functions";
import {
  WORK_EVENTS,
  WORK_EVENT_LABELS,
  type WorkEventName,
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["work-item-timeline", organizationId, itemType, itemId],
    enabled: enabled && !!organizationId && !!itemId,
    queryFn: () => fetchTimeline({ data: { organizationId, itemType, itemId } }),
  });

  const [selected, setSelected] = useState<WorkEventName[]>([]);

  const counts = useMemo(() => {
    const map = new Map<WorkEventName, number>();
    for (const e of data ?? []) map.set(e.event, (map.get(e.event) ?? 0) + 1);
    return map;
  }, [data]);

  const available = useMemo(
    () => WORK_EVENTS.filter((name) => counts.has(name)),
    [counts],
  );

  const visible = useMemo(
    () => (data ?? []).filter((e) => selected.length === 0 || selected.includes(e.event)),
    [data, selected],
  );

  const toggle = (name: WorkEventName) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  return (
    <section aria-labelledby={`timeline-${itemId}`} className="mt-6 border-t border-border pt-4">
      <h3
        id={`timeline-${itemId}`}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        سجل الأحداث
        {data?.length ? (
          <span className="text-xs font-normal text-muted-foreground">({data.length} حدث)</span>
        ) : null}
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل السجل…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          تعذّر عرض سجل الأحداث. حدّث الصفحة وأعد المحاولة.
        </p>
      ) : !data?.length ? (
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
                الكل ({data.length})
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
            <p className="text-sm text-muted-foreground">
              لا توجد أحداث مطابقة للتصفية المختارة.
            </p>
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
        </>
      )}
    </section>
  );
}
