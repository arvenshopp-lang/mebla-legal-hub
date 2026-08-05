/**
 * قوائم عمل مركز الدعم — عرض وفلترة فقط.
 * كل قراءة تمر من `listSupportTickets` وكل كتابة من دوال الدعم الخادمية،
 * والصلاحيات تُفرض على الخادم لا هنا.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import {
  createSupportTicket,
  exportSupportTickets,
  listSupportTickets,
} from "@/lib/support/support.functions";
import type { TicketFiltersInput } from "@/lib/support/support.schemas";
import {
  TICKET_CHANNELS,
  TICKET_CHANNEL_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_AR,
  type TicketListRow,
} from "@/lib/support/support.shared";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  FormField,
  LoadingBlock,
  Modal,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { buildCsv } from "@/lib/csv";
import { DueCell, PriorityBadge, SlaBadge, StatusBadge, channelLabel } from "./shared";
import type { SupportWorkspace } from "./types";

export type QueueKey =
  | "all"
  | "mine"
  | "unassigned"
  | "new"
  | "open"
  | "awaiting_reply"
  | "pending_internal"
  | "escalated"
  | "at_risk"
  | "breached"
  | "resolved"
  | "closed"
  | "needs_review";

export const QUEUES: { key: QueueKey; label: string; filters: TicketFiltersInput }[] = [
  { key: "all", label: "جميع التذاكر", filters: {} },
  { key: "mine", label: "تذاكري", filters: { assignedTo: "me", status: "open" } },
  { key: "unassigned", label: "غير المسندة", filters: { onlyUnassigned: true, status: "open" } },
  { key: "new", label: "الجديدة", filters: { status: "new" } },
  { key: "open", label: "المفتوحة", filters: { status: "open" } },
  { key: "awaiting_reply", label: "بانتظار العميل", filters: { status: "awaiting_reply" } },
  { key: "pending_internal", label: "بانتظار داخلي", filters: { status: "pending_internal" } },
  { key: "escalated", label: "المصعّدة", filters: { status: "escalated" } },
  {
    key: "at_risk",
    label: "المهدَّدة بخرق المهلة",
    filters: { slaState: "at_risk", status: "open" },
  },
  { key: "breached", label: "المتجاوزة للمهلة", filters: { onlyBreached: true } },
  { key: "resolved", label: "المحلولة", filters: { status: "resolved" } },
  { key: "closed", label: "المغلقة", filters: { status: "closed" } },
  { key: "needs_review", label: "بحاجة لمراجعة هوية", filters: { needsReview: true } },
];

const PAGE_SIZE = 25;

export function QueuesPanel({
  queue,
  onQueueChange,
  counts,
  workspace,
}: {
  queue: QueueKey;
  onQueueChange: (key: QueueKey) => void;
  counts: Partial<Record<QueueKey, number>> | undefined;
  workspace: SupportWorkspace;
}) {
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [channel, setChannel] = useState("all");
  const [teamId, setTeamId] = useState("all");
  const [assignedTo, setAssignedTo] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounced(search);

  const queueFilters = useMemo(() => QUEUES.find((q) => q.key === queue)?.filters ?? {}, [queue]);

  const filters: TicketFiltersInput = useMemo(
    () => ({
      ...queueFilters,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
      ...(priority !== "all" ? { priority } : {}),
      ...(category !== "all" ? { category } : {}),
      ...(channel !== "all" ? { channel } : {}),
      ...(teamId !== "all" ? { teamId } : {}),
      ...(assignedTo !== "all" ? { assignedTo } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [queueFilters, debounced, priority, category, channel, teamId, assignedTo, page],
  );

  const listFn = useServerFn(listSupportTickets);
  const exportFn = useServerFn(exportSupportTickets);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["support-tickets", filters],
    queryFn: () => listFn({ data: filters }),
  });

  const exporting = useMutation({
    mutationFn: async () => exportFn({ data: { ...filters, limit: 200, offset: 0 } }),
    onSuccess: (result) => {
      const rows = result.rows as TicketListRow[];
      if (rows.length === 0) {
        toast.info("لا توجد تذاكر للتصدير في هذا الفلتر");
        return;
      }
      const headers = [
        "المرجع",
        "الموضوع",
        "الحالة",
        "الأولوية",
        "التصنيف",
        "القناة",
        "المكتب",
        "الفريق",
        "الموظف",
        "حالة المهلة",
        "مهلة الحل",
        "تاريخ الإنشاء",
      ];
      const csv = buildCsv(
        headers,
        rows.map((r) => [
          r.ticket_number ?? r.reference,
          r.subject,
          r.status,
          r.priority,
          r.category,
          channelLabel(r.channel),
          r.organization_name ?? "",
          r.team_name ?? "",
          r.assignee_name ?? "",
          r.sla_state,
          r.due_resolution_at ? fmtDateTime(r.due_resolution_at) : "",
          fmtDateTime(r.created_at),
        ]),
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mehla-support-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${rows.length} تذكرة`);
    },
    onError: (error: Error) => toast.error("تعذّر التصدير", { description: error.message }),
  });

  const rows = (data?.rows ?? []) as TicketListRow[];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <nav aria-label="قوائم العمل" className="-mx-1 overflow-x-auto pb-1">
        <ul className="flex min-w-max items-center gap-1.5 px-1">
          {QUEUES.map((q) => {
            const active = q.key === queue;
            const count = counts?.[q.key];
            return (
              <li key={q.key}>
                <button
                  type="button"
                  onClick={() => {
                    onQueueChange(q.key);
                    setPage(1);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  <span>{q.label}</span>
                  {typeof count === "number" && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                        active ? "bg-primary-foreground/20" : "bg-surface-muted"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="support-search">
          بحث في التذاكر
        </label>
        <input
          id="support-search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="بحث بالموضوع أو الرقم أو بريد المُرسل…"
          className={`${inputCls} w-full sm:w-[280px]`}
        />
        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          aria-label="الأولوية"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل الأولويات</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABELS_AR[p]}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          aria-label="التصنيف"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل التصنيفات</option>
          {workspace.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
          aria-label="القناة"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل القنوات</option>
          {TICKET_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {TICKET_CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setPage(1);
          }}
          aria-label="الفريق"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل الفرق</option>
          {workspace.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={assignedTo}
          onChange={(e) => {
            setAssignedTo(e.target.value);
            setPage(1);
          }}
          aria-label="الموظف المسؤول"
          className={`${inputCls} w-auto`}
        >
          <option value="all">كل الموظفين</option>
          <option value="me">المُسندة إليّ</option>
          {workspace.staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="ms-auto flex items-center gap-2">
          {isFetching && !isLoading && <span className="text-caption">تحديث…</span>}
          {workspace.permissions.export && (
            <Btn variant="ghost" loading={exporting.isPending} onClick={() => exporting.mutate()}>
              <Download className="h-4 w-4" aria-hidden /> تصدير
            </Btn>
          )}
          {workspace.permissions.create && (
            <Btn onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> تذكرة جديدة
            </Btn>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock rows={8} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد تذاكر" hint="لا تذاكر مطابقة لهذه القائمة أو الفلاتر الحالية." />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[900px] text-right">
              <thead>
                <tr>
                  <Th>المرجع</Th>
                  <Th>الموضوع</Th>
                  <Th>المكتب</Th>
                  <Th>الحالة</Th>
                  <Th>الأولوية</Th>
                  <Th>المهلة</Th>
                  <Th>مهلة الحل</Th>
                  <Th>الفريق / الموظف</Th>
                  <Th>آخر نشاط</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-muted/60">
                    <Td className="tabular-nums text-muted-foreground">
                      <Link
                        to="/mehla-admin/support/$ticketId"
                        params={{ ticketId: t.id }}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {t.ticket_number ?? t.reference}
                      </Link>
                    </Td>
                    <Td>
                      <Link
                        to="/mehla-admin/support/$ticketId"
                        params={{ ticketId: t.id }}
                        className="block max-w-[320px] truncate font-medium underline-offset-4 hover:underline"
                        title={t.subject}
                      >
                        {t.subject}
                      </Link>
                      <span className="text-caption">
                        {channelLabel(t.channel)}
                        {t.needs_identity_review ? " · بحاجة لمراجعة هوية" : ""}
                        {t.merged_into_id ? " · مدموجة" : ""}
                      </span>
                    </Td>
                    <Td className="text-[12.5px]">
                      {t.organization_name ?? t.requester_email ?? "—"}
                    </Td>
                    <Td>
                      <StatusBadge status={t.status} />
                      {t.escalation_level > 0 && (
                        <span className="ms-1 inline-block">
                          <Badge tone="red">تصعيد {t.escalation_level}</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <PriorityBadge priority={t.priority} />
                    </Td>
                    <Td>
                      <SlaBadge state={t.sla_state} />
                    </Td>
                    <Td>
                      <DueCell dueAt={t.due_resolution_at} done={t.resolved_at} />
                    </Td>
                    <Td className="text-[12.5px]">
                      <span className="block">{t.team_name ?? "بلا فريق"}</span>
                      <span className="text-caption">{t.assignee_name ?? "غير مسندة"}</span>
                    </Td>
                    <Td className="text-[12px] text-muted-foreground">
                      {fmtDateTime(t.last_activity_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} />
        </>
      )}

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspace={workspace}
      />
    </div>
  );
}

function CreateTicketModal({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: SupportWorkspace;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createSupportTicket);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(workspace.categories[0]?.code ?? "");
  const [priority, setPriority] = useState<(typeof TICKET_PRIORITIES)[number]>("medium");
  const [channel, setChannel] = useState<(typeof TICKET_CHANNELS)[number]>("internal");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [teamId, setTeamId] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          subject: subject.trim(),
          description: description.trim(),
          category,
          priority,
          channel,
          requesterEmail: requesterEmail.trim() ? requesterEmail.trim() : null,
          requesterName: requesterName.trim() ? requesterName.trim() : null,
          teamId: teamId ? teamId : null,
        },
      }),
    onSuccess: (created) => {
      toast.success(`تم فتح التذكرة ${created.ticketNumber ?? ""}`.trim());
      setSubject("");
      setDescription("");
      setRequesterEmail("");
      setRequesterName("");
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-queue-counts"] });
      onClose();
    },
    onError: (error: Error) => toast.error("تعذّر فتح التذكرة", { description: error.message }),
  });

  const valid = subject.trim().length > 0 && description.trim().length > 0 && category.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="تذكرة دعم جديدة"
      description="تُفتح التذكرة بالمهل والفريق الافتراضي للتصنيف."
    >
      <div className="space-y-4">
        <FormField label="الموضوع" required>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputCls}
            maxLength={300}
          />
        </FormField>
        <FormField label="الوصف" required>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            maxLength={20000}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="التصنيف" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {workspace.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الأولوية">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as (typeof TICKET_PRIORITIES)[number])}
              className={inputCls}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_AR[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="القناة">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as (typeof TICKET_CHANNELS)[number])}
              className={inputCls}
            >
              {TICKET_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الفريق" hint="اتركه فارغاً ليُحدَّد من التصنيف.">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
              <option value="">تحديد تلقائي</option>
              {workspace.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="بريد مُقدّم الطلب">
            <input
              type="email"
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </FormField>
          <FormField label="اسم مُقدّم الطلب">
            <input
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
            فتح التذكرة
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
