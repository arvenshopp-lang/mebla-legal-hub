import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { failureHint, trackFailure } from "@/lib/observability/report-failure";
import { ArrowRight, LifeBuoy, Plus, Send, Star } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/enums";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/admin-permissions";
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

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "الدعم الفني · مِهلة" },
      { name: "description", content: "افتح تذكرة دعم لفريق مِهلة وتابع المحادثة وقيّم الخدمة بعد إغلاقها." },
      { property: "og:title", content: "الدعم الفني · مِهلة" },
      { property: "og:description", content: "تذاكر الدعم والمحادثات المباشرة مع فريق مِهلة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportPage,
});

type Ticket = {
  id: string;
  reference: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  created_at: string;
  last_reply_at: string;
  closed_at: string | null;
  rating: number | null;
  rating_comment: string | null;
  rated_at: string | null;
  rated_staff_name: string | null;
};

type Message = {
  id: string;
  body: string;
  is_staff: boolean;
  author_name: string;
  created_at: string;
};

const TICKET_COLS =
  "id, reference, subject, category, priority, status, description, created_at, last_reply_at, closed_at, rating, rating_comment, rated_at, rated_staff_name";

const statusTone = (s: string): "muted" | "info" | "gold" | "warn" =>
  s === "closed" ? "muted" : s === "new" ? "info" : s === "in_progress" ? "gold" : "warn";

function SupportPage() {
  const { user, profile, activeOrgId } = useAuth();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["my-tickets", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(TICKET_COLS)
        .order("last_reply_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const active = (tickets.data ?? []).find((t) => t.id === activeId) ?? null;

  return (
    <DashboardShell
      title="الدعم الفني"
      description="تذاكرك مع فريق مِهلة، محادثة مباشرة وتقييم للخدمة."
      actions={
        active ? (
          <Btn variant="ghost" onClick={() => setActiveId(null)}>
            <ArrowRight className="h-4 w-4" aria-hidden /> عودة للتذاكر
          </Btn>
        ) : (
          <Btn onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" aria-hidden /> تذكرة جديدة
          </Btn>
        )
      }
    >
      {active ? (
        <TicketConversation ticket={active} onRated={() => tickets.refetch()} />
      ) : tickets.isLoading ? (
        <LoadingBlock rows={4} cols={2} />
      ) : (tickets.data ?? []).length === 0 ? (
        <EmptyState
          title="لا توجد تذاكر بعد"
          hint="افتح تذكرة وسيتواصل معك فريق الدعم داخل المنصة."
          action={
            <Btn onClick={() => setOpenNew(true)}>
              <LifeBuoy className="h-4 w-4" aria-hidden /> افتح تذكرة
            </Btn>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {tickets.data!.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className="surface-card block w-full p-4 text-right transition hover:border-border-strong sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14.5px] font-semibold">{t.subject}</p>
                  <div className="flex items-center gap-2">
                    {t.rating && (
                      <Badge tone="gold">
                        {t.rating}/5 تقييمك
                      </Badge>
                    )}
                    <Badge tone={statusTone(t.status)}>{TICKET_STATUS_LABELS[t.status] ?? t.status}</Badge>
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">{t.description}</p>
                <p className="text-caption mt-2 tabular-nums">
                  {t.reference} · {TICKET_CATEGORY_LABELS[t.category] ?? t.category} ·{" "}
                  {TICKET_PRIORITY_LABELS[t.priority] ?? t.priority} · آخر نشاط {fmtDateTime(t.last_reply_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewTicketModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        userId={user?.id ?? null}
        organizationId={activeOrgId}
        requesterName={profile?.full_name ?? ""}
        requesterEmail={user?.email ?? ""}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["my-tickets", user?.id] });
          setActiveId(id);
        }}
      />
    </DashboardShell>
  );
}

function NewTicketModal({
  open,
  onClose,
  userId,
  organizationId,
  requesterName,
  requesterEmail,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  organizationId: string | null;
  requesterName: string;
  requesterEmail: string;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setSubject("");
      setCategory("general");
      setPriority("medium");
      setDescription("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("جلستك منتهية، أعد تسجيل الدخول.");
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: userId,
          organization_id: organizationId,
          reference: "",
          subject: subject.trim(),
          category,
          priority: priority as "low" | "medium" | "high" | "urgent",
          description: description.trim(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("تم إرسال التذكرة", { description: "سيصلك رد فريق الدعم داخل المنصة." });
      onClose();
      onCreated(id);
    },
    onError: async (error: Error) => {
      const ref = await trackFailure({
        surface: "support_ticket",
        action: "ticket.create",
        error,
        organizationId,
      });
      toast.error("تعذّر إرسال التذكرة", {
        description: failureHint(ref, "تحقّق من البيانات ثم أعد المحاولة."),
      });
    },
  });

  return (
    <Modal open={open} onClose={onClose} size="lg" title="تذكرة دعم جديدة" description="سيتم إرفاق بياناتك تلقائياً مع الطلب.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted px-3.5 py-3 text-[12.5px] text-muted-foreground">
          مُقدّم الطلب: <span className="font-semibold text-foreground">{requesterName || "—"}</span> ·{" "}
          <span className="tabular-nums">{requesterEmail}</span>
        </div>

        <FormField label="عنوان التذكرة" required>
          <input
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            required
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="التصنيف" required>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(TICKET_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الأولوية" required>
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="نص التذكرة" required hint="اشرح المشكلة أو الطلب بوضوح، وأرفق أرقام المراجع إن وُجدت.">
          <textarea
            className={`${inputCls} min-h-32`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            required
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Btn type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn type="submit" loading={create.isPending} disabled={subject.trim().length < 3 || description.trim().length < 10}>
            <Send className="h-4 w-4" aria-hidden /> إرسال التذكرة
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function TicketConversation({ ticket, onRated }: { ticket: Ticket; onRated: () => void }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const closed = ticket.status === "closed";

  const messagesKey = useMemo(() => ["ticket-messages", ticket.id], [ticket.id]);

  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, body, is_staff, author_name, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        () => {
          qc.invalidateQueries({ queryKey: messagesKey });
          qc.invalidateQueries({ queryKey: ["my-tickets", user?.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticket.id, qc, messagesKey, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("جلستك منتهية، أعد تسجيل الدخول.");
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticket.id,
        author_id: user.id,
        author_name: profile?.full_name ?? user.email ?? "المشترك",
        is_staff: false,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: messagesKey });
      qc.invalidateQueries({ queryKey: ["my-tickets", user?.id] });
    },
    onError: async (error: Error) => {
      const ref = await trackFailure({
        surface: "support_message",
        action: "ticket.message.send",
        error,
        ticketId: ticket.id,
      });
      toast.error("تعذّر إرسال الرسالة", { description: failureHint(ref, "أعد المحاولة بعد لحظات.") });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <SectionCard
        title={`${ticket.reference} — ${ticket.subject}`}
        description={`${TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category} · ${
          TICKET_STATUS_LABELS[ticket.status] ?? ticket.status
        }`}
      >
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pl-1">
          <Bubble
            author={profile?.full_name ?? "أنت"}
            at={ticket.created_at}
            body={ticket.description}
            mine
          />
          {messages.isLoading ? (
            <LoadingBlock rows={3} cols={1} />
          ) : (
            messages.data!.map((m) => (
              <Bubble
                key={m.id}
                author={m.is_staff ? m.author_name || "فريق مِهلة" : profile?.full_name ?? "أنت"}
                at={m.created_at}
                body={m.body}
                mine={!m.is_staff}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {closed ? (
          <p className="mt-4 rounded-[var(--radius-m)] border border-border bg-surface-muted px-3.5 py-3 text-[13px] text-muted-foreground">
            أُغلقت هذه التذكرة. يمكنك تقييم الخدمة من الجانب، أو فتح تذكرة جديدة عند الحاجة.
          </p>
        ) : (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <textarea
              className={`${inputCls} min-h-[64px] flex-1`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              placeholder="اكتب رسالتك لفريق الدعم…"
              aria-label="نص الرسالة"
            />
            <Btn type="submit" loading={send.isPending} disabled={body.trim().length < 2}>
              <Send className="h-4 w-4" aria-hidden /> إرسال
            </Btn>
          </form>
        )}
      </SectionCard>

      <RatingPanel ticket={ticket} onRated={onRated} />
    </div>
  );
}

function Bubble({ author, at, body, mine }: { author: string; at: string; body: string; mine: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-m)] border px-3.5 py-3 text-[13px] leading-6",
        mine ? "border-border bg-surface-muted" : "border-primary/25 bg-primary/[0.06]",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{author}</span>
        <span className="tabular-nums">{fmtDateTime(at)}</span>
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function RatingPanel({ ticket, onRated }: { ticket: Ticket; onRated: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const closed = ticket.status === "closed";
  const rated = !!ticket.rated_at;

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ rating, rating_comment: comment.trim() || null })
        .eq("id", ticket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("شكراً لك", { description: "تم تسجيل تقييمك لفريق الدعم." });
      onRated();
    },
    onError: async (error: Error) => {
      const ref = await trackFailure({
        surface: "support_rating",
        action: "ticket.rate",
        error,
        ticketId: ticket.id,
      });
      toast.error("تعذّر تسجيل التقييم", {
        description: failureHint(ref, "يمكن التقييم مرة واحدة بعد إغلاق التذكرة."),
      });
    },
  });

  if (!closed) {
    return (
      <SectionCard title="تقييم الخدمة">
        <p className="text-[13px] text-muted-foreground">
          سيتاح تقييم فريق الدعم بعد إغلاق التذكرة من قِبل الفريق.
        </p>
      </SectionCard>
    );
  }

  if (rated) {
    return (
      <SectionCard title="تقييمك للخدمة">
        <div className="flex items-center gap-1" aria-label={`التقييم ${ticket.rating} من 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn("h-5 w-5", n <= (ticket.rating ?? 0) ? "fill-primary text-primary" : "text-border-strong")}
              aria-hidden
            />
          ))}
        </div>
        {ticket.rating_comment && (
          <p className="mt-3 whitespace-pre-wrap text-[13px] text-muted-foreground">{ticket.rating_comment}</p>
        )}
        <p className="text-caption mt-3">
          {ticket.rated_staff_name ? `الموظف: ${ticket.rated_staff_name} · ` : ""}
          {fmtDateTime(ticket.rated_at)}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="قيّم فريق الدعم" description="تقييمك يساعدنا على تحسين جودة الخدمة.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="درجة التقييم">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} من 5`}
              onClick={() => setRating(n)}
              className="rounded-[var(--radius-s)] p-1 transition hover:bg-surface-muted"
            >
              <Star
                className={cn("h-6 w-6", n <= rating ? "fill-primary text-primary" : "text-border-strong")}
                aria-hidden
              />
            </button>
          ))}
        </div>

        <FormField label="ملاحظتك (اختياري)">
          <textarea
            className={`${inputCls} min-h-24`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
        </FormField>

        <Btn type="submit" className="w-full" loading={submit.isPending} disabled={rating === 0}>
          إرسال التقييم
        </Btn>
      </form>
    </SectionCard>
  );
}
