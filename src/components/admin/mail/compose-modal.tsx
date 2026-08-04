import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, FormField, Modal, inputCls } from "@/lib/list-utils";
import { isValidAddress, parseAddressList, type Mailbox } from "@/lib/email/email.shared";

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

/** نافذة إنشاء/رد/تحويل — تتحقق من العناوين قبل أي استدعاء خادمي. */
export function ComposeModal({
  seed,
  mailboxes,
  onClose,
  onSend,
  onSaveDraft,
  sending,
  savingDraft,
}: {
  seed: ComposeSeed | null;
  mailboxes: Mailbox[];
  onClose: () => void;
  onSend: (payload: ComposePayload) => void;
  onSaveDraft: (payload: ComposePayload) => void;
  sending: boolean;
  savingDraft: boolean;
}) {
  const sendable = useMemo(() => mailboxes.filter((m) => m.type === "human" && m.is_active), [mailboxes]);
  const [mailboxId, setMailboxId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [schedule, setSchedule] = useState("");
  const [showCc, setShowCc] = useState(false);

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
  }, [seed]);

  function build(): ComposePayload | null {
    try {
      const toList = parseAddressList(to, "إلى");
      if (toList.length === 0) throw new Error("أضف مستلماً واحداً على الأقل.");
      const scheduledAt = schedule ? new Date(schedule).toISOString() : null;
      if (schedule && Number.isNaN(new Date(schedule).getTime())) throw new Error("موعد الجدولة غير صحيح.");
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

  const toInvalid = to.trim().length > 0 && !to.split(/[,;\n]/).every((p) => !p.trim() || isValidAddress(p));

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
            <select className={inputCls} value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} required>
              {sendable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} — {m.address}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="جدولة الإرسال" hint="اترك الحقل فارغاً للإرسال الفوري.">
            <input type="datetime-local" className={inputCls} value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </FormField>
        </div>

        <FormField label="إلى" required hint="يمكن فصل عدة عناوين بفاصلة." error={toInvalid ? "أحد العناوين غير صحيح." : undefined}>
          <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" required />
        </FormField>

        {showCc ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="نسخة (CC)">
              <input className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="نسخة مخفية (BCC)">
              <input className={inputCls} value={bcc} onChange={(e) => setBcc(e.target.value)} dir="ltr" />
            </FormField>
          </div>
        ) : (
          <button type="button" className="text-body-sm text-primary underline" onClick={() => setShowCc(true)}>
            إضافة نسخة أو نسخة مخفية
          </button>
        )}

        <FormField label="الموضوع" required>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={300} />
        </FormField>

        <FormField label="نص الرسالة" required hint="نص عادي — تُحوَّل الأسطر تلقائياً إلى تنسيق بريد صحيح.">
          <textarea
            className={`${inputCls} min-h-56`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </FormField>

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
          <Btn type="submit" loading={sending}>
            {schedule ? "جدولة الإرسال" : "إرسال"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/** تحويل النص العادي إلى HTML آمن (بلا وسوم من المستخدم). */
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div dir="rtl" style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#1A1A1A;text-align:right">${paragraphs}</div>`;
}