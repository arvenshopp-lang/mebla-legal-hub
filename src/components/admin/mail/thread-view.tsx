import { useState } from "react";
import {
  CornerUpLeft,
  CornerUpRight,
  Download,
  Forward,
  Lock,
  Paperclip,
  RefreshCw,
  Star,
  Trash2,
  Undo2,
  Archive,
  ShieldAlert,
} from "lucide-react";
import { Badge, Btn, IconBtn, inputCls } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  MESSAGE_STATUS_LABELS,
  forwardSubject,
  formatBytes,
  replySubject,
  stripHtml,
  type EmailMessage,
  type ThreadDetail,
} from "@/lib/email/email.shared";
import type { ComposeSeed } from "@/components/admin/mail/compose-modal";

type StaffOption = { user_id: string; email: string; full_name: string };

export function ThreadView({
  detail,
  staff,
  labels,
  canSend,
  canAssign,
  onCompose,
  onUpdate,
  onAddNote,
  onRetry,
  onDownloadAttachment,
  savingNote,
  retrying,
  downloadingAttachmentId,
  blockedRecipients,
}: {
  detail: ThreadDetail;
  staff: StaffOption[];
  labels: { id: string; name_ar: string; color: string }[];
  canSend: boolean;
  canAssign: boolean;
  onCompose: (seed: ComposeSeed) => void;
  onUpdate: (patch: {
    is_starred?: boolean;
    is_unread?: boolean;
    folder?: "inbox" | "archive" | "spam" | "trash";
    restore?: boolean;
    labelIds?: string[];
    assignTo?: string | null;
  }) => void;
  onAddNote: (body: string) => void;
  onRetry: (messageId: string) => void;
  onDownloadAttachment: (attachmentId: string) => void;
  savingNote: boolean;
  retrying: boolean;
  downloadingAttachmentId: string | null;
  /** عناوين محجوبة عن الاستقبال — تُبرَّر بها الرسائل الفاشلة بدل «فشل» مجرّد. */
  blockedRecipients: string[];
}) {
  const { thread, messages, notes } = detail;
  const [note, setNote] = useState("");
  const last = messages.at(-1);
  const activeLabelIds = thread.labels.map((l) => l.id);

  function replySeed(all: boolean): ComposeSeed {
    const target = [...messages].reverse().find((m) => m.direction === "inbound") ?? last;
    const to =
      target?.direction === "inbound" ? target.from_address : (target?.to_addresses[0] ?? "");
    const cc = all ? (target?.cc_addresses ?? []).join(", ") : "";
    return {
      mailboxId: thread.mailbox_id,
      threadId: thread.id,
      to,
      cc,
      subject: replySubject(thread.subject),
      html: quote(target),
      inReplyTo: null,
      title: all ? "الرد على الكل" : "الرد",
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h4 truncate font-semibold">{thread.subject || "(بدون موضوع)"}</h2>
            <p className="text-caption mt-1 truncate" dir="ltr">
              {thread.participants.join(" ، ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <IconBtn
              aria-label={thread.is_starred ? "إزالة النجمة" : "إضافة نجمة"}
              aria-pressed={thread.is_starred}
              onClick={() => onUpdate({ is_starred: !thread.is_starred })}
            >
              <Star
                className={thread.is_starred ? "h-4 w-4 fill-gold text-gold" : "h-4 w-4"}
                aria-hidden
              />
            </IconBtn>
            {thread.folder === "trash" ||
            thread.folder === "spam" ||
            thread.folder === "archive" ? (
              <IconBtn aria-label="استرجاع إلى الوارد" onClick={() => onUpdate({ restore: true })}>
                <Undo2 className="h-4 w-4" aria-hidden />
              </IconBtn>
            ) : (
              <>
                <IconBtn aria-label="أرشفة" onClick={() => onUpdate({ folder: "archive" })}>
                  <Archive className="h-4 w-4" aria-hidden />
                </IconBtn>
                <IconBtn aria-label="تصنيف كمزعج" onClick={() => onUpdate({ folder: "spam" })}>
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                </IconBtn>
                <IconBtn
                  aria-label="نقل إلى المهملات"
                  tone="danger"
                  onClick={() => onUpdate({ folder: "trash" })}
                >
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                </IconBtn>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canAssign && (
            <label className="flex items-center gap-2 text-body-sm">
              <span className="text-muted-foreground">المسؤول</span>
              <select
                className={`${inputCls} h-9 w-48`}
                value={thread.assigned_to ?? ""}
                onChange={(e) => onUpdate({ assignTo: e.target.value || null })}
              >
                <option value="">غير مُسنَد</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {labels.map((l) => {
              const active = activeLabelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onUpdate({
                      labelIds: active
                        ? activeLabelIds.filter((id) => id !== l.id)
                        : [...activeLabelIds, l.id],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  {l.name_ar}
                </button>
              );
            })}
          </div>
        </div>

        {canSend && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn size="sm" onClick={() => onCompose(replySeed(false))}>
              <CornerUpLeft className="h-4 w-4" aria-hidden /> رد
            </Btn>
            <Btn size="sm" variant="outline" onClick={() => onCompose(replySeed(true))}>
              <CornerUpRight className="h-4 w-4" aria-hidden /> رد على الكل
            </Btn>
            <Btn
              size="sm"
              variant="outline"
              onClick={() =>
                onCompose({
                  mailboxId: thread.mailbox_id,
                  subject: forwardSubject(thread.subject),
                  html: quote(last),
                  title: "تحويل الرسالة",
                })
              }
            >
              <Forward className="h-4 w-4" aria-hidden /> تحويل
            </Btn>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ul className="space-y-4">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded-[var(--radius-m)] border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold" dir="ltr">
                    {m.from_name ? `${m.from_name} · ` : ""}
                    {m.from_address}
                  </p>
                  <p className="text-caption truncate" dir="ltr">
                    إلى {m.to_addresses.join(" ، ")}
                    {m.cc_addresses.length > 0 ? ` · نسخة ${m.cc_addresses.join(" ، ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={statusTone(m.status)}>
                    {MESSAGE_STATUS_LABELS[m.status] ?? m.status}
                  </Badge>
                  <span className="text-caption">
                    {fmtDateTime(m.sent_at ?? m.received_at ?? m.created_at)}
                  </span>
                </div>
              </div>

              <div className="mt-3 whitespace-pre-wrap text-body-sm leading-relaxed">
                {m.body_text?.trim() || stripHtml(m.html ?? "")}
              </div>

              {m.attachments.length > 0 && (
                <div className="mt-3">
                  <p className="text-caption flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    {m.attachments.length} مرفق
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => {
                      const blocked = a.is_quarantined === true;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            disabled={blocked || downloadingAttachmentId === a.id}
                            onClick={() => onDownloadAttachment(a.id)}
                            aria-label={
                              blocked ? `مرفق محجور: ${a.file_name}` : `تنزيل المرفق ${a.file_name}`
                            }
                            title={blocked ? "المرفق محجور لعدم اجتيازه التحقق الأمني." : undefined}
                            className={`flex max-w-full items-center gap-2 rounded-[var(--radius-s)] border px-2.5 py-1.5 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                              blocked
                                ? "cursor-not-allowed border-danger/40 bg-danger/5 text-danger"
                                : "border-border hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                            }`}
                          >
                            {blocked ? (
                              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            ) : (
                              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="truncate">{a.file_name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatBytes(a.size_bytes)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {(m.status === "failed" || m.status === "bounced") && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-s)] border border-danger/30 bg-danger/5 p-3">
                  <p className="text-body-sm text-danger">
                    تعذّر إرسال هذه الرسالة{m.failure_ref ? ` — مرجع العطل ${m.failure_ref}` : ""}.
                  </p>
                  {canSend && (
                    <Btn
                      size="sm"
                      variant="outline"
                      loading={retrying}
                      onClick={() => onRetry(m.id)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden /> إعادة المحاولة
                    </Btn>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        <section className="mt-6 rounded-[var(--radius-m)] border border-border bg-surface-muted/40 p-4">
          <h3 className="font-semibold">ملاحظات داخلية</h3>
          <p className="text-caption mt-1">تظهر لفريق المنصة فقط ولا تُرسل للمستلم إطلاقاً.</p>
          {notes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-[var(--radius-s)] border border-border bg-surface p-3"
                >
                  <p className="text-body-sm whitespace-pre-wrap">{n.body}</p>
                  <p className="text-caption mt-1">
                    {n.author_email} · {fmtDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              onAddNote(note.trim());
              setNote("");
            }}
          >
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="أضف ملاحظة للفريق…"
              maxLength={4000}
              aria-label="ملاحظة داخلية"
            />
            <Btn type="submit" loading={savingNote} disabled={!note.trim()}>
              إضافة
            </Btn>
          </form>
        </section>
      </div>
    </div>
  );
}

function statusTone(status: string): "green" | "red" | "warn" | "muted" | "info" {
  if (status === "sent") return "green";
  if (status === "failed" || status === "bounced") return "red";
  if (status === "queued" || status === "sending" || status === "scheduled") return "warn";
  if (status === "received") return "info";
  return "muted";
}

function quote(message: EmailMessage | undefined): string {
  if (!message) return "";
  const body = message.body_text?.trim() || stripHtml(message.html ?? "");
  return `\n\n———\nفي ${fmtDateTime(message.sent_at ?? message.received_at ?? message.created_at)} كتب ${message.from_address}:\n${body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}`;
}
