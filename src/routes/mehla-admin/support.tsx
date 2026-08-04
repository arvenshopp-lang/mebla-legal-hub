import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Star } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import { replyToTicket } from "@/lib/admin.functions";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/admin-permissions";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  FormField,
  LoadingBlock,
  Modal,
  PageToolbar,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { buildCsv } from "@/lib/csv";

export const Route = createFileRoute("/mehla-admin/support")({
  head: () => ({ meta: [{ title: "مركز الدعم · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SupportPage,
});

const statusTone = (s: string): "muted" | "info" | "gold" | "warn" =>
  s === "closed" ? "muted" : s === "new" ? "info" : s === "in_progress" ? "gold" : "warn";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`التقييم ${value} من 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "fill-warning text-warning" : "text-border-strong"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

function downloadCsv(rows: Record<string, string | number>[], filename: string) {
  const headers = Object.keys(rows[0] ?? {});
  const csv = buildCsv(
    headers,
    rows.map((r) => headers.map((h) => r[h] ?? "")),
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SupportPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [activeId, setActiveId] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const { data: tickets, isLoading, isFetching } = useQuery({
    queryKey: ["admin-tickets", debounced, statusFilter],
    queryFn: async () => {
      let q = supabase.from("support_tickets").select("*").order("last_reply_at", { ascending: false }).limit(200);
      if (statusFilter === "open") q = q.neq("status", "closed");
      else if (statusFilter === "rated") q = q.not("rated_at", "is", null);
      else if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
      const term = debounced.trim().replace(/[,()]/g, "");
      if (term) q = q.or(`subject.ilike.%${term}%,reference.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: requesters } = useQuery({
    queryKey: ["admin-ticket-requesters", (tickets ?? []).map((t) => t.user_id ?? "").join(",")],
    enabled: (tickets ?? []).length > 0,
    queryFn: async () => {
      const ids = Array.from(
        new Set((tickets ?? []).map((t) => t.user_id).filter((id): id is string => !!id)),
      );
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  const rated = useMemo(() => (tickets ?? []).filter((t) => t.rated_at), [tickets]);
  const avgRating = rated.length
    ? (rated.reduce((s, t) => s + Number(t.rating ?? 0), 0) / rated.length).toFixed(1)
    : null;

  return (
    <AdminShell title="مركز الدعم" description="تذاكر الدعم الواردة من مكاتب المحاماة المشتركة.">
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث بالعنوان أو الرقم المرجعي…"
        searching={isFetching && !isLoading}
        filters={
          <>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="حالة التذكرة"
            className={`${inputCls} w-auto min-w-[150px]`}
          >
            <option value="open">التذاكر المفتوحة</option>
            <option value="all">كل التذاكر</option>
            <option value="rated">التذاكر المُقيَّمة</option>
            {Object.entries(TICKET_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Btn
            variant="ghost"
            disabled={rated.length === 0}
            onClick={() =>
              downloadCsv(
                rated.map((t) => ({
                  المرجع: t.reference,
                  الموضوع: t.subject,
                  "بريد المشترك": (t.user_id ? requesters?.[t.user_id]?.email : t.requester_email) ?? "",
                  التقييم: t.rating ?? "",
                  الملاحظة: t.rating_comment ?? "",
                  الموظف: t.rated_staff_name ?? "",
                  "تاريخ التقييم": fmtDateTime(t.rated_at),
                })),
                `mehla-support-ratings-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
          >
            <Download className="h-4 w-4" aria-hidden /> تصدير التقييمات
          </Btn>
          </>
        }
      />

      {avgRating && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] border border-border bg-surface px-4 py-3">
          <span className="text-[13px] font-semibold">متوسط تقييم الخدمة</span>
          <span className="text-[18px] font-bold tabular-nums">{avgRating}</span>
          <Stars value={Math.round(Number(avgRating))} />
          <span className="text-caption">({rated.length} تقييماً)</span>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : (tickets ?? []).length === 0 ? (
        <EmptyState title="لا توجد تذاكر" hint="لم يصل أي طلب دعم مطابق لهذا الفلتر." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[760px] text-right">
            <thead>
              <tr>
                <Th>المرجع</Th>
                <Th>الموضوع</Th>
                <Th>مُقدّم الطلب</Th>
                <Th>التصنيف</Th>
                <Th>الأولوية</Th>
                <Th>الحالة</Th>
                <Th>التقييم</Th>
                <Th>آخر نشاط</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets!.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className="cursor-pointer hover:bg-surface-muted/60"
                >
                  <Td className="tabular-nums text-muted-foreground">{t.reference}</Td>
                  <Td className="font-medium">{t.subject}</Td>
                  <Td className="text-left text-[12px]">
                    {(t.user_id ? requesters?.[t.user_id]?.email : t.requester_email) ?? "—"}
                  </Td>
                  <Td>{TICKET_CATEGORY_LABELS[t.category] ?? t.category}</Td>
                  <Td>
                    <Badge tone={t.priority === "urgent" || t.priority === "high" ? "red" : "muted"}>
                      {TICKET_PRIORITY_LABELS[t.priority] ?? t.priority}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(t.status)}>{TICKET_STATUS_LABELS[t.status] ?? t.status}</Badge>
                  </Td>
                  <Td>{t.rated_at ? <Stars value={Number(t.rating ?? 0)} /> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="text-[12px] text-muted-foreground">{fmtDateTime(t.last_reply_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <TicketDrawer ticketId={activeId} onClose={() => setActiveId(null)} />
    </AdminShell>
  );
}

function TicketDrawer({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const replyFn = useServerFn(replyToTicket);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("in_progress");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ticket", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const [ticket, messages] = await Promise.all([
        supabase.from("support_tickets").select("*").eq("id", ticketId!).single(),
        supabase
          .from("support_ticket_messages")
          .select("*")
          .eq("ticket_id", ticketId!)
          .order("created_at", { ascending: true }),
      ]);
      if (ticket.error) throw ticket.error;
      if (messages.error) throw messages.error;
      const { data: requester } = ticket.data.user_id
        ? await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", ticket.data.user_id)
            .maybeSingle()
        : { data: null };
      return { ticket: ticket.data, messages: messages.data ?? [], requester };
    },
  });

  const reply = useMutation({
    mutationFn: async () => replyFn({ data: { ticketId: ticketId!, body: body.trim(), status } }),
    onSuccess: () => {
      toast.success("تم إرسال الرد");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error("تعذّر إرسال الرد", { description: e.message }),
  });

  return (
    <Modal
      open={!!ticketId}
      onClose={onClose}
      size="lg"
      title={data?.ticket ? `${data.ticket.reference} — ${data.ticket.subject}` : "تفاصيل التذكرة"}
      description={data?.requester?.email ?? undefined}
    >
      {isLoading || !data ? (
        <LoadingBlock rows={3} cols={1} />
      ) : (
        <div className="space-y-5">
          {data.ticket.rated_at && (
            <div className="rounded-[var(--radius-m)] border border-warning/30 bg-warning-soft/50 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-semibold">تقييم المشترك</span>
                <Stars value={Number(data.ticket.rating ?? 0)} />
                <span className="text-muted-foreground">
                  {data.ticket.rated_staff_name ? `· الموظف: ${data.ticket.rated_staff_name}` : ""} ·{" "}
                  {fmtDateTime(data.ticket.rated_at)}
                </span>
              </div>
              {data.ticket.rating_comment && (
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6">{data.ticket.rating_comment}</p>
              )}
            </div>
          )}

          <div className="max-h-[320px] space-y-3 overflow-y-auto pl-1">
            <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted px-3.5 py-3 text-[13px] leading-6">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{data.requester?.full_name ?? "المشترك"}</span>
                <span>{fmtDateTime(data.ticket.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{data.ticket.description}</p>
            </div>
            {data.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-[var(--radius-m)] border px-3.5 py-3 text-[13px] leading-6 ${
                  m.is_staff ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-surface-muted"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {m.is_staff ? m.author_name || "فريق مِهلة" : data.requester?.full_name ?? "المشترك"}
                  </span>
                  <span>{fmtDateTime(m.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>

          <FormField label="الرد" required>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={inputCls}
              placeholder="اكتب رداً واضحاً ومهنياً…"
            />
          </FormField>

          <FormField label="حالة التذكرة بعد الرد">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="in_progress">قيد المعالجة</option>
              <option value="awaiting_reply">بانتظار رد المشترك</option>
              <option value="closed">إغلاق التذكرة</option>
            </select>
          </FormField>

          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>
              إغلاق
            </Btn>
            <Btn loading={reply.isPending} disabled={!body.trim()} onClick={() => reply.mutate()}>
              إرسال الرد
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}