import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, ShieldAlert, X } from "lucide-react";
import { Btn, FormField, Modal, inputCls } from "@/lib/list-utils";
import { isValidAddress, parseAddressList, type Mailbox } from "@/lib/email/email.shared";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  checkAttachmentPolicy,
  formatAttachmentLimits,
  type AttachmentMeta,
} from "@/lib/email/attachments.shared";
import { formatBytes } from "@/lib/email/email.shared";

export type ComposeSeed = {
  mailboxId: string;
  threadId?: string | null;
  draftId?: string | null;
  to?: string;
  cc?: string;
  subject?: string;
  html?: string;
  inReplyTo?: string | null;
  title: string;
};

export type ComposePayload = {
  mailboxId: string;
  threadId: string | null;
  draftId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  scheduledAt: string | null;
  inReplyTo: string | null;
};

export type RecipientBlockProps = {
  /** عناوين محجوبة عن الاستقبال لدى خدمة البريد المُدارة. */
  blockedRecipients: string[];
  checkingRecipients: boolean;
  onCheckRecipients: (mailboxId: string, addresses: string[]) => void;
  canManageSuppression: boolean;
  onLiftBlock: (address: string, reason: string) => void;
  liftingAddress: string | null;
};

/** نافذة إنشاء/رد/تحويل — تتحقق من العناوين قبل أي استدعاء خادمي. */
export function ComposeModal({
  seed,
  mailboxes,
  onClose,
  onSend,
  onSaveDraft,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  uploading,
  sending,
  savingDraft,
  blockedRecipients,
  checkingRecipients,
  onCheckRecipients,
  canManageSuppression,
  onLiftBlock,
  liftingAddress,
}: {
  seed: ComposeSeed | null;
  mailboxes: Mailbox[];
  onClose: () => void;
  onSend: (payload: ComposePayload) => void;
  onSaveDraft: (payload: ComposePayload) => void;
  attachments: AttachmentMeta[];
  onAttachFiles: (files: File[], payload: ComposePayload) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  uploading: boolean;
  sending: boolean;
  savingDraft: boolean;
} & RecipientBlockProps) {
  const sendable = useMemo(
    () => mailboxes.filter((m) => m.type === "human" && m.is_active),
    [mailboxes],
  );
  const [mailboxId, setMailboxId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [schedule, setSchedule] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [liftReason, setLiftReason] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!seed) return;
    setMailboxId(seed.mailboxId);
    setTo(seed.to ?? "");
    setCc(seed.cc ?? "");
    setBcc("");
    setSubject(seed.subject ?? "");
    setBody(seed.html ?? "");
    setSchedule("");
    setShowCc(Boolean(seed.cc));
    setLiftReason("");
  }, [seed]);

  /** كل العناوين الصحيحة في الحقول — تُفحص حالة استقبالها قبل الإرسال. */
  const recipientList = useMemo(() => {
    const parts = [to, cc, bcc]
      .join(",")
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && isValidAddress(p))
      .map((p) => p.toLowerCase());
    return [...new Set(parts)];
  }, [to, cc, bcc]);
  const recipientKey = recipientList.join(",");

  useEffect(() => {
    if (!seed || !mailboxId || recipientList.length === 0) return;
    const timer = setTimeout(() => onCheckRecipients(mailboxId, recipientKey.split(",")), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, mailboxId, recipientKey]);

  const blocked = useMemo(
    () => blockedRecipients.filter((address) => recipientList.includes(address.toLowerCase())),
    [blockedRecipients, recipientList],
  );

  function build(): ComposePayload | null {
    try {
      const toList = parseAddressList(to, "إلى");
      if (toList.length === 0) throw new Error("أضف مستلماً واحداً على الأقل.");
      const scheduledAt = schedule ? new Date(schedule).toISOString() : null;
      if (schedule && Number.isNaN(new Date(schedule).getTime()))
        throw new Error("موعد الجدولة غير صحيح.");
      return {
        mailboxId,
        threadId: seed?.threadId ?? null,
        draftId: seed?.draftId ?? null,
        to: toList,
        cc: parseAddressList(cc, "نسخة"),
        bcc: parseAddressList(bcc, "نسخة مخفية"),
        subject: subject.trim(),
        html: toHtml(body),
        scheduledAt,
        inReplyTo: seed?.inReplyTo ?? null,
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تحقق من بيانات الرسالة.");
      return null;
    }
  }

  const toInvalid =
    to.trim().length > 0 && !to.split(/[,;\n]/).every((p) => !p.trim() || isValidAddress(p));

  function pickFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    if (files.length === 0) return;
    if (attachments.length + files.length > ATTACHMENT_MAX_COUNT) {
      toast.error(`الحد الأقصى ${ATTACHMENT_MAX_COUNT} مرفقات للرسالة.`);
      return;
    }
    const accepted: File[] = [];
    for (const file of files) {
      const verdict = checkAttachmentPolicy(file.name, file.size);
      if (!verdict.ok) toast.error(`${file.name}: ${verdict.reason}`);
      else accepted.push(file);
    }
    if (accepted.length === 0) return;
    const payload = build();
    if (!payload) return;
    onAttachFiles(accepted, payload);
  }

  return (
    <Modal open={Boolean(seed)} onClose={onClose} title={seed?.title ?? "رسالة جديدة"} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const payload = build();
          if (payload) onSend(payload);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="الإرسال من" required>
            <select
              className={inputCls}
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              required
            >
              {sendable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} — {m.address}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="جدولة الإرسال" hint="اترك الحقل فارغاً للإرسال الفوري.">
            <input
              type="datetime-local"
              className={inputCls}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
          </FormField>
        </div>

        <FormField
          label="إلى"
          required
          hint="يمكن فصل عدة عناوين بفاصلة."
          error={toInvalid ? "أحد العناوين غير صحيح." : undefined}
        >
          <input
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            dir="ltr"
            required
          />
        </FormField>

        {showCc ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="نسخة (CC)">
              <input
                className={inputCls}
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="نسخة مخفية (BCC)">
              <input
                className={inputCls}
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </div>
        ) : (
          <button
            type="button"
            className="text-body-sm text-primary underline"
            onClick={() => setShowCc(true)}
          >
            إضافة نسخة أو نسخة مخفية
          </button>
        )}

        <FormField label="الموضوع" required>
          <input
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={300}
          />
        </FormField>

        {blocked.length > 0 && (
          <section
            aria-label="مستلمون محجوبون"
            className="rounded-[var(--radius-m)] border border-danger/30 bg-danger/5 p-3"
          >
            <p className="flex items-start gap-2 text-body-sm text-danger">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                لا يمكن الإرسال إلى {blocked.join("، ")} — العنوان محجوب عن استقبال رسائل المنصة
                (إلغاء اشتراك أو ارتداد أو شكوى سابقة). أزل العنوان من الحقول أو ارفع الحجب بعد
                تجديد موافقة صاحبه.
              </span>
            </p>
            {canManageSuppression && (
              <div className="mt-3 space-y-2">
                <FormField
                  label="سبب رفع الحجب"
                  hint="يُسجَّل في سجل تدقيق البريد. يجب أن يكون المستلم قد جدّد موافقته فعلاً."
                >
                  <input
                    className={inputCls}
                    value={liftReason}
                    onChange={(e) => setLiftReason(e.target.value)}
                    maxLength={300}
                  />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  {blocked.map((address) => (
                    <Btn
                      key={address}
                      size="sm"
                      variant="outline"
                      loading={liftingAddress === address}
                      disabled={liftReason.trim().length < 10}
                      onClick={() => onLiftBlock(address, liftReason.trim())}
                    >
                      رفع الحجب عن {address}
                    </Btn>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <FormField
          label="نص الرسالة"
          required
          hint="نص عادي — تُحوَّل الأسطر تلقائياً إلى تنسيق بريد صحيح."
        >
          <textarea
            className={`${inputCls} min-h-56`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </FormField>

        <section
          aria-label="مرفقات الرسالة"
          className="rounded-[var(--radius-m)] border border-border p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-medium">المرفقات</p>
            <Btn
              size="sm"
              variant="outline"
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="h-4 w-4" aria-hidden /> إرفاق ملف
            </Btn>
          </div>
          <p className="text-caption mt-1">
            {formatAttachmentLimits()} تُرسل كروابط تنزيل آمنة مؤقتة.
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            onChange={(e) => pickFiles(e.target.files)}
          />
          {attachments.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex max-w-full items-center gap-2 rounded-[var(--radius-s)] border border-border px-2.5 py-1.5 text-[12px]"
                >
                  <span className="truncate">{a.file_name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatBytes(a.size_bytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`إزالة المرفق ${a.file_name}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Btn variant="outline" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            variant="outline"
            loading={savingDraft}
            onClick={() => {
              const payload = build();
              if (payload) onSaveDraft(payload);
            }}
          >
            حفظ كمسوّدة
          </Btn>
          <Btn type="submit" loading={sending} disabled={blocked.length > 0 || checkingRecipients}>
            {schedule ? "جدولة الإرسال" : "إرسال"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/** تحويل النص العادي إلى HTML آمن (بلا وسوم من المستخدم). */
function toHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div dir="rtl" style="font-family:'Tajawal',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#1A1A1A;text-align:right">${paragraphs}</div>`;
}
