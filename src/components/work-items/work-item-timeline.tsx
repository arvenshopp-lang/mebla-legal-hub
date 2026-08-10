import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { getWorkItemTimelineFn } from "@/lib/work-items/timeline.functions";
import { WORK_EVENT_LABELS, type WorkItemTimelineEvent } from "@/lib/work-items/timeline.shared";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { Badge } from "@/lib/list-utils";

const TONES: Record<string, "green" | "red" | "warn" | "muted"> = {
  completed: "green",
  reopened: "warn",
  due_changed: "warn",
  assigned: "warn",
  cancelled: "red",
  deleted: "red",
};

function detail(e: WorkItemTimelineEvent): string | null {
  switch (e.event) {
    case "assigned":
      return `من ${e.fromUserName ?? "بدون مسؤول"} إلى ${e.toUserName ?? "بدون مسؤول"}`;
    case "due_changed":
      return `من ${fmtDate(e.fromDueDate) || "بدون تاريخ"} إلى ${fmtDate(e.toDueDate) || "بدون تاريخ"}`;
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

  return (
    <section aria-labelledby={`timeline-${itemId}`} className="mt-6 border-t border-border pt-4">
      <h3
        id={`timeline-${itemId}`}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        سجل الأحداث
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
        <ol className="space-y-3">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-2 text-sm">
              <Badge tone={TONES[e.event] ?? "muted"}>{WORK_EVENT_LABELS[e.event]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-foreground">{detail(e) ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(e.occurredAt)}
                  {e.actorName ? ` • بواسطة ${e.actorName}` : " • تلقائي"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}