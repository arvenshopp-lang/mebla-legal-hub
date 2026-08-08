/**
 * تفاصيل تذكرة الدعم: بيانات المكتب، المهل، الخط الزمني، والإجراءات.
 * كل إجراء يمر من دوال `support.functions.ts` فقط — لا كتابة مباشرة على الجداول.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Paperclip, Star } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  addSupportNote,
  assignSupportTicket,
  escalateSupportTicket,
  getSupportTicket,
  getSupportWorkspace,
  listSupportTickets,
  mergeSupportTickets,
  replySupportTicket,
  requestSupportCsat,
  reviewSupportIdentity,
  setSupportTicketTags,
  splitSupportTicket,
  transitionSupportTicket,
  updateSupportTicket,
} from "@/lib/support/support.functions";
import {
  IDENTITY_SOURCE_LABELS,
  SLA_EVENT_LABELS,
  TICKET_EVENT_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUS_LABELS_AR,
  dueLabel,
  humanDuration,
  ingestMatchReasonLabel,
  ingestSourceLabel,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/support.shared";
import {
  Badge,
  Btn,
  EmptyState,
  FormField,
  LoadingBlock,
  Modal,
  SectionCard,
  inputCls,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  PriorityBadge,
  SlaBadge,
  StatusBadge,
  Stars,
  channelLabel,
} from "@/components/admin/support/shared";

export const Route = createFileRoute("/mehla-admin/support/$ticketId")({
  head: () => ({
    meta: [
      { title: "تفاصيل تذكرة الدعم · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TicketDetailPage,
});

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const ticketFn = useServerFn(getSupportTicket);
  const workspaceFn = useServerFn(getSupportWorkspace);

  const { data, isLoading, error } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => ticketFn({ data: { ticketId } }),
  });
  const { data: workspace } = useQuery({
    queryKey: ["support-workspace"],
    queryFn: () => workspaceFn({}),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
    qc.invalidateQueries({ queryKey: ["support-queue-counts"] });
  };

  /* ------------------------------------------------------------ الإجراءات */
  const replyFn = useServerFn(replySupportTicket);
  const noteFn = useServerFn(addSupportNote);
  const transitionFn = useServerFn(transitionSupportTicket);
  const assignFn = useServerFn(assignSupportTicket);
  const escalateFn = useServerFn(escalateSupportTicket);
  const tagsFn = useServerFn(setSupportTicketTags);
  const updateFn = useServerFn(updateSupportTicket);
  const identityFn = useServerFn(reviewSupportIdentity);
  const csatFn = useServerFn(requestSupportCsat);
  const mergeFn = useServerFn(mergeSupportTickets);
  const splitFn = useServerFn(splitSupportTicket);

  const [replyBody, setReplyBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [ccRaw, setCcRaw] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [transitionReason, setTransitionReason] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  const reply = useMutation({
    mutationFn: async () => {
      const cc = ccRaw
        .split(/[,;\s]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      return replyFn({
        data: {
          ticketId,
          body: replyBody.trim(),
          replyAll,
          ...(cc.length ? { cc } : {}),
          ...(nextStatus ? { nextStatus: nextStatus as TicketStatus } : {}),
          clientRequestId: newRequestId(),
        },
      });
    },
    onSuccess: (result) => {
      if ("duplicate" in result && result.duplicate) toast.info("تم تسجيل هذا الرد مسبقاً");
      else toast.success("تم إرسال الرد للمكتب");
      setReplyBody("");
      setCcRaw("");
      setNextStatus("");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر إرسال الرد", { description: e.message }),
  });

  const note = useMutation({
    mutationFn: async () =>
      noteFn({ data: { ticketId, body: noteBody.trim(), clientRequestId: newRequestId() } }),
    onSuccess: () => {
      toast.success("تم حفظ الملاحظة الداخلية");
      setNoteBody("");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر حفظ الملاحظة", { description: e.message }),
  });

  const transition = useMutation({
    mutationFn: async (to: TicketStatus) =>
      transitionFn({ data: { ticketId, to, reason: transitionReason.trim() || null } }),
    onSuccess: () => {
      toast.success("تم تحديث حالة التذكرة");
      setTransitionReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر تحديث الحالة", { description: e.message }),
  });

  const assign = useMutation({
    mutationFn: async (input: { assignedTo?: string | null; teamId?: string | null }) =>
      assignFn({ data: { ticketId, ...input } }),
    onSuccess: () => {
      toast.success("تم تحديث الإسناد");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر تنفيذ الإسناد", { description: e.message }),
  });

  const escalate = useMutation({
    mutationFn: async () => escalateFn({ data: { ticketId, reason: escalateReason.trim() } }),
    onSuccess: () => {
      toast.success("تم تصعيد التذكرة");
      setEscalateReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر التصعيد", { description: e.message }),
  });

  const setTags = useMutation({
    mutationFn: async (tagIds: string[]) => tagsFn({ data: { ticketId, tagIds } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("تعذّر تحديث الوسوم", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async (input: { priority?: TicketPriority; category?: string }) =>
      updateFn({ data: { ticketId, ...input } }),
    onSuccess: () => {
      toast.success("تم تحديث بيانات التذكرة");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر التحديث", { description: e.message }),
  });

  const reviewIdentity = useMutation({
    mutationFn: async (organizationId: string | null) =>
      identityFn({ data: { ticketId, organizationId } }),
    onSuccess: () => {
      toast.success("تم تأكيد هوية مُقدّم الطلب");
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر تحديث الهوية", { description: e.message }),
  });

  const requestCsat = useMutation({
    mutationFn: async () => csatFn({ data: { ticketId } }),
    onSuccess: (result) => {
      if (result.sent) toast.success("تم إرسال رابط التقييم للمكتب");
      else
        toast.info(
          result.skipped === "already_rated"
            ? "التذكرة مُقيَّمة مسبقاً"
            : result.skipped === "invite_active"
              ? "هناك دعوة تقييم سارية"
              : "لا يوجد بريد لمُقدّم الطلب",
        );
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر إرسال طلب التقييم", { description: e.message }),
  });

  const merge = useMutation({
    mutationFn: async (input: { targetId: string; reason: string }) =>
      mergeFn({ data: { sourceId: ticketId, targetId: input.targetId, reason: input.reason } }),
    onSuccess: () => {
      toast.success("تم دمج التذكرة");
      setMergeOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error("تعذّر الدمج", { description: e.message }),
  });

  const split = useMutation({
    mutationFn: async (input: {
      subject: string;
      description: string;
      category: string | null;
      reason: string;
    }) => splitFn({ data: { ticketId, ...input } }),
    onSuccess: (created) => {
      toast.success(`تم إنشاء التذكرة ${created.ticketNumber ?? ""}`.trim());
      setSplitOpen(false);
      invalidate();
      void navigate({ to: "/mehla-admin/support/$ticketId", params: { ticketId: created.id } });
    },
    onError: (e: Error) => toast.error("تعذّر التقسيم", { description: e.message }),
  });

  const timeline = useMemo(() => {
    if (!data) return [];
    type Entry = {
      id: string;
      at: string;
      kind: "event" | "sla";
      title: string;
      body?: string | null;
      actor?: string | null;
    };
    const entries: Entry[] = [
      ...data.events.map((e) => ({
        id: `e-${e.id}`,
        at: e.created_at,
        kind: "event" as const,
        title: TICKET_EVENT_LABELS[e.event_type] ?? e.event_type,
        body: e.reason,
        actor: e.actor_name,
      })),
      ...data.slaEvents.map((e) => ({
        id: `s-${e.id}`,
        at: e.occurred_at,
        kind: "sla" as const,
        title: `${SLA_EVENT_LABELS[e.event_type] ?? e.event_type} — ${e.metric === "first_response" ? "أول رد" : "الحل"}`,
        body: e.reason,
        actor: "النظام",
      })),
    ];
    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data]);

  if (isLoading || !workspace) {
    return (
      <AdminShell title="تفاصيل التذكرة" description="جاري تحميل بيانات التذكرة.">
        <LoadingBlock rows={6} cols={3} />
      </AdminShell>
    );
  }

  if (error || !data) {
    return (
      <AdminShell title="تفاصيل التذكرة">
        <EmptyState
          title="التذكرة غير متاحة"
          hint="قد تكون محذوفة أو خارج نطاق صلاحياتك."
          action={
            <Link to="/mehla-admin/support">
              <Btn variant="outline">العودة لمركز الدعم</Btn>
            </Link>
          }
        />
      </AdminShell>
    );
  }

  const t = data.ticket;
  const perms = workspace.permissions;
  const ref = t.ticket_number ?? t.reference;

  return (
    <AdminShell
      title={`${ref} — ${t.subject}`}
      description={`قناة الوصول: ${channelLabel(t.channel)}`}
      breadcrumb={ref}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/mehla-admin/support">
          <Btn variant="ghost" size="sm">
            <ArrowRight className="h-4 w-4" aria-hidden /> مركز الدعم
          </Btn>
        </Link>
        <StatusBadge status={t.status} />
        <PriorityBadge priority={t.priority} />
        <SlaBadge state={t.sla_state} />
        {t.escalation_level > 0 && <Badge tone="red">مستوى تصعيد {t.escalation_level}</Badge>}
        {t.merged_into_id && <Badge tone="muted">مدموجة في تذكرة أخرى</Badge>}
        {t.reopened_count > 0 && <Badge tone="warn">أُعيد فتحها {t.reopened_count} مرة</Badge>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard title="المحادثة مع المكتب">
            <div className="space-y-3">
              <article className="rounded-[var(--radius-m)] border border-border bg-surface-muted px-3.5 py-3 text-[13px] leading-6">
                <header className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t.requester_name ?? t.requester_email ?? "مُقدّم الطلب"}
                  </span>
                  <span>{fmtDateTime(t.created_at)}</span>
                </header>
                <p className="whitespace-pre-wrap">{t.description}</p>
              </article>
              {data.messages.map((m) => (
                <article
                  key={m.id}
                  className={`rounded-[var(--radius-m)] border px-3.5 py-3 text-[13px] leading-6 ${
                    m.is_staff
                      ? "border-primary/25 bg-primary/[0.06]"
                      : "border-border bg-surface-muted"
                  }`}
                >
                  <header className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{m.author_name}</span>
                    <span>{fmtDateTime(m.created_at)}</span>
                  </header>
                  {(ingestSourceLabel(m.ingest_source) ??
                    ingestMatchReasonLabel(m.ingest_match_reason) ??
                    m.email_thread_id) && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {ingestSourceLabel(m.ingest_source) && (
                        <Badge tone="muted">المصدر: {ingestSourceLabel(m.ingest_source)}</Badge>
                      )}
                      {ingestMatchReasonLabel(m.ingest_match_reason) && (
                        <Badge tone="muted">{ingestMatchReasonLabel(m.ingest_match_reason)}</Badge>
                      )}
                      {m.email_thread_id && perms.viewMail ? (
                        <Link
                          to="/mehla-admin/mail"
                          search={{ thread: m.email_thread_id }}
                          className="text-[11.5px] font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          فتح خيط الرسائل
                        </Link>
                      ) : m.email_thread_id ? (
                        <span
                          className="text-[11.5px] text-muted-foreground"
                          title="لا تملك صلاحية عرض مركز البريد."
                        >
                          فتح خيط الرسائل — يتطلب صلاحية عرض البريد
                        </span>
                      ) : null}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {m.attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden />
                          <span>{a.file_name}</span>
                          <span className="tabular-nums">
                            ({Math.max(1, Math.round(a.size_bytes / 1024))} ك.ب)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </SectionCard>

          {perms.reply && !t.merged_into_id && (
            <SectionCard
              title="الرد على المكتب"
              description="يُرسل الرد من صندوق فريق الدعم ويُسجَّل في الخط الزمني."
            >
              <div className="space-y-3.5">
                <FormField label="نص الرد" required>
                  <textarea
                    rows={5}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className={inputCls}
                    placeholder="اكتب رداً واضحاً ومهنياً…"
                    maxLength={20000}
                  />
                </FormField>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <FormField label="نسخة إلى (CC)" hint="بريد واحد أو أكثر مفصولة بفاصلة">
                    <input
                      value={ccRaw}
                      onChange={(e) => setCcRaw(e.target.value)}
                      className={inputCls}
                      dir="ltr"
                    />
                  </FormField>
                  <FormField label="الحالة بعد الرد">
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">دون تغيير</option>
                      {data.allowedTransitions.map((s) => (
                        <option key={s} value={s}>
                          {TICKET_STATUS_LABELS_AR[s]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={replyAll}
                    onChange={(e) => setReplyAll(e.target.checked)}
                  />
                  الرد على الجميع (تضمين مستلمي المحادثة)
                </label>
                <div className="flex justify-end">
                  <Btn
                    loading={reply.isPending}
                    disabled={!replyBody.trim()}
                    onClick={() => reply.mutate()}
                  >
                    إرسال الرد
                  </Btn>
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="الملاحظات الداخلية"
            description="لا تُرسل للمكتب ولا تظهر في أي بريد."
          >
            <div className="space-y-3">
              {data.notes.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">لا ملاحظات داخلية بعد.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-[var(--radius-m)] border border-warning/25 bg-warning-soft/40 px-3.5 py-2.5"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{n.author_name}</span>
                        <span>{fmtDateTime(n.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-6">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {perms.reply && (
                <>
                  <FormField label="ملاحظة جديدة">
                    <textarea
                      rows={3}
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      className={inputCls}
                      maxLength={10000}
                    />
                  </FormField>
                  <div className="flex justify-end">
                    <Btn
                      variant="outline"
                      loading={note.isPending}
                      disabled={!noteBody.trim()}
                      onClick={() => note.mutate()}
                    >
                      حفظ الملاحظة
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="الخط الزمني وسجل التدقيق">
            {timeline.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">لا أحداث مسجلة.</p>
            ) : (
              <ol className="relative space-y-3 border-e border-border pe-4">
                {timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -end-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${
                        entry.kind === "sla" ? "bg-warning" : "bg-primary"
                      }`}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">{entry.title}</span>
                      <span className="text-[11.5px] text-muted-foreground">
                        {fmtDateTime(entry.at)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {entry.actor ?? "—"}
                      {entry.body ? ` · ${entry.body}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <SectionCard title="المكتب ومُقدّم الطلب">
            <dl className="space-y-2.5 text-[13px]">
              <Row label="المكتب" value={t.organization_name ?? "غير مرتبط"} />
              <Row label="الباقة" value={t.subscription_plan ?? "—"} />
              <Row label="البريد" value={t.requester_email ?? "—"} ltr />
              <Row label="الاسم" value={t.requester_name ?? "—"} />
              <Row
                label="مصدر الهوية"
                value={IDENTITY_SOURCE_LABELS[t.identity_source ?? "unknown"] ?? "—"}
              />
              <Row label="القناة" value={channelLabel(t.channel)} />
            </dl>
            {t.needs_identity_review && perms.reply && (
              <div className="mt-3 rounded-[var(--radius-m)] border border-warning/30 bg-warning-soft/50 p-3">
                <p className="mb-2 text-[12.5px]">
                  هوية مُقدّم الطلب غير مؤكدة. أكّد الربط بعد التحقق.
                </p>
                <Btn
                  size="sm"
                  variant="outline"
                  loading={reviewIdentity.isPending}
                  onClick={() => reviewIdentity.mutate(t.organization_id ?? null)}
                >
                  تأكيد الهوية الحالية
                </Btn>
              </div>
            )}
          </SectionCard>

          <SectionCard title="المهل (SLA)">
            <dl className="space-y-2.5 text-[13px]">
              <Row label="السياسة" value={t.sla_policy_name ?? "—"} />
              <Row
                label="أول رد"
                value={
                  t.first_response_at
                    ? `تم بعد ${humanDuration(t.created_at, t.first_response_at)}`
                    : dueLabel(t.due_first_response_at)
                }
              />
              <Row
                label="الحل"
                value={
                  t.resolved_at
                    ? `تم بعد ${humanDuration(t.created_at, t.resolved_at)}`
                    : dueLabel(t.due_resolution_at)
                }
              />
              <Row label="حالة المهلة" value={<SlaBadge state={t.sla_state} />} />
              {t.paused_at && <Row label="العدّاد" value="موقوف بانتظار طرف آخر" />}
            </dl>
          </SectionCard>

          <SectionCard title="الإسناد والتصنيف">
            <div className="space-y-3.5">
              <FormField label="الفريق">
                <select
                  value={t.team_id ?? ""}
                  disabled={!perms.assign}
                  onChange={(e) => assign.mutate({ teamId: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">بلا فريق</option>
                  {workspace.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="الموظف المسؤول">
                <select
                  value={t.assigned_to ?? ""}
                  disabled={!perms.assign}
                  onChange={(e) => assign.mutate({ assignedTo: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">غير مسندة</option>
                  {workspace.staff.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>
              {perms.assign && t.assigned_to !== workspace.me.userId && (
                <Btn
                  variant="outline"
                  size="sm"
                  loading={assign.isPending}
                  onClick={() => assign.mutate({ assignedTo: workspace.me.userId })}
                >
                  إسنادها إليّ
                </Btn>
              )}
              <FormField label="الأولوية">
                <select
                  value={t.priority}
                  disabled={!perms.reply}
                  onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })}
                  className={inputCls}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TICKET_PRIORITY_LABELS_AR[p]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="التصنيف">
                <select
                  value={t.category}
                  disabled={!perms.reply}
                  onChange={(e) => update.mutate({ category: e.target.value })}
                  className={inputCls}
                >
                  {workspace.categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </SectionCard>

          <SectionCard title="الوسوم">
            {workspace.tags.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">لا وسوم معرّفة.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {workspace.tags.map((tag) => {
                  const active = data.tags.some((x) => x.id === tag.id);
                  return (
                    <li key={tag.id}>
                      <button
                        type="button"
                        disabled={!perms.reply || setTags.isPending}
                        aria-pressed={active}
                        onClick={() =>
                          setTags.mutate(
                            active
                              ? data.tags.filter((x) => x.id !== tag.id).map((x) => x.id)
                              : [...data.tags.map((x) => x.id), tag.id],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tag.name_ar}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="الإجراءات">
            <div className="space-y-3.5">
              <FormField label="سبب الإجراء" hint="يُسجَّل في الخط الزمني وسجل التدقيق.">
                <input
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className={inputCls}
                  maxLength={500}
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                {data.allowedTransitions.map((to) => {
                  const blocked =
                    ((to === "closed" || to === "resolved") && !perms.close) ||
                    (t.status === "closed" && !perms.reopen);
                  if (blocked) return null;
                  return (
                    <Btn
                      key={to}
                      variant={to === "closed" ? "outline" : "secondary"}
                      size="sm"
                      loading={transition.isPending}
                      onClick={() => transition.mutate(to)}
                    >
                      {TICKET_STATUS_LABELS_AR[to]}
                    </Btn>
                  );
                })}
              </div>

              {perms.escalate && (
                <div className="rounded-[var(--radius-m)] border border-border p-3">
                  <FormField label="سبب التصعيد" required>
                    <input
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      className={inputCls}
                      maxLength={500}
                    />
                  </FormField>
                  <div className="mt-2 flex justify-end">
                    <Btn
                      variant="outline"
                      size="sm"
                      loading={escalate.isPending}
                      disabled={!escalateReason.trim()}
                      onClick={() => escalate.mutate()}
                    >
                      تصعيد التذكرة
                    </Btn>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {perms.merge && !t.merged_into_id && (
                  <>
                    <Btn variant="ghost" size="sm" onClick={() => setMergeOpen(true)}>
                      دمج مع تذكرة
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setSplitOpen(true)}>
                      تقسيم إلى تذكرة
                    </Btn>
                  </>
                )}
                {perms.reply && !t.rated_at && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    loading={requestCsat.isPending}
                    onClick={() => requestCsat.mutate()}
                  >
                    <Star className="h-4 w-4" aria-hidden /> طلب تقييم
                  </Btn>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="تقييم المكتب (CSAT)">
            {t.rated_at ? (
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <Stars value={Number(t.rating ?? 0)} />
                  <span className="tabular-nums font-semibold">{t.rating ?? "—"}/5</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {t.rated_staff_name ? `الموظف: ${t.rated_staff_name} · ` : ""}
                  {fmtDateTime(t.rated_at)}
                </p>
                {t.rating_comment && (
                  <p className="whitespace-pre-wrap leading-6">{t.rating_comment}</p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                لم يُقيَّم المكتب هذه التذكرة بعد.
              </p>
            )}
          </SectionCard>
        </aside>
      </div>

      <MergeModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        currentId={ticketId}
        pending={merge.isPending}
        onSubmit={(targetId, reason) => merge.mutate({ targetId, reason })}
      />
      <SplitModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        categories={workspace.categories}
        pending={split.isPending}
        onSubmit={(input) => split.mutate(input)}
      />
    </AdminShell>
  );
}

function Row({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 break-words text-end font-medium ${ltr ? "dir-ltr" : ""}`}
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function MergeModal({
  open,
  onClose,
  currentId,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  pending: boolean;
  onSubmit: (targetId: string, reason: string) => void;
}) {
  const listFn = useServerFn(listSupportTickets);
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const { data } = useQuery({
    queryKey: ["support-merge-candidates", search],
    enabled: open,
    queryFn: () =>
      listFn({
        data: { ...(search.trim() ? { search: search.trim() } : {}), status: "open", limit: 20 },
      }),
  });
  const candidates = (data?.rows ?? []).filter((r) => r.id !== currentId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="دمج التذكرة"
      description="تُغلق التذكرة الحالية وتُنقل رسائلها إلى التذكرة الهدف."
    >
      <div className="space-y-4">
        <FormField label="بحث عن التذكرة الهدف">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
            placeholder="الموضوع أو الرقم…"
          />
        </FormField>
        <FormField label="التذكرة الهدف" required>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={inputCls}
          >
            <option value="">اختر تذكرة…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.ticket_number ?? c.reference) + " — " + c.subject}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="سبب الدمج" required>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls}
            maxLength={500}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            loading={pending}
            disabled={!targetId || !reason.trim()}
            onClick={() => onSubmit(targetId, reason.trim())}
          >
            دمج
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function SplitModal({
  open,
  onClose,
  categories,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  categories: { code: string; name: string }[];
  pending: boolean;
  onSubmit: (input: {
    subject: string;
    description: string;
    category: string | null;
    reason: string;
  }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تقسيم التذكرة"
      description="تُفتح تذكرة جديدة مرتبطة بالتذكرة الحالية."
    >
      <div className="space-y-4">
        <FormField label="موضوع التذكرة الجديدة" required>
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
          />
        </FormField>
        <FormField label="التصنيف" hint="اتركه فارغاً لاستخدام تصنيف التذكرة الأصلية.">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            <option value="">كما هو</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="سبب التقسيم" required>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls}
            maxLength={500}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            loading={pending}
            disabled={!subject.trim() || !description.trim() || !reason.trim()}
            onClick={() =>
              onSubmit({
                subject: subject.trim(),
                description: description.trim(),
                category: category ? category : null,
                reason: reason.trim(),
              })
            }
          >
            تقسيم
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
