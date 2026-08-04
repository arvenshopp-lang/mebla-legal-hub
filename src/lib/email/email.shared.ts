/**
 * أنواع وثوابت مركز البريد المؤسسي — مشتركة بين الخادم والواجهة.
 * لا تضع هنا أي منطق خادمي أو أسراراً.
 */

export const EMAIL_FOLDERS = [
  { id: "inbox", label: "الوارد" },
  { id: "outbox", label: "قائمة الإرسال" },
  { id: "sent", label: "الصادر" },
  { id: "drafts", label: "المسوّدات" },
  { id: "archive", label: "الأرشيف" },
  { id: "spam", label: "المزعج" },
  { id: "trash", label: "المهملات" },
] as const;

export type EmailFolder = (typeof EMAIL_FOLDERS)[number]["id"];

export const FOLDER_LABELS: Record<EmailFolder, string> = Object.fromEntries(
  EMAIL_FOLDERS.map((f) => [f.id, f.label]),
) as Record<EmailFolder, string>;

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  draft: "مسوّدة",
  scheduled: "مجدولة",
  queued: "في قائمة الإرسال",
  sending: "جارٍ الإرسال",
  sent: "أُرسلت",
  failed: "فشل الإرسال",
  bounced: "مرتجعة",
  received: "واردة",
};

export const LABEL_COLORS = ["green", "gold", "amber", "red", "blue", "muted"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  type: "human" | "system";
  is_shared: boolean;
  is_active: boolean;
  inbound_enabled: boolean;
  signature_html: string | null;
  sort_order: number;
  unread: number;
};

export type ThreadSummary = {
  id: string;
  mailbox_id: string;
  subject: string;
  folder: EmailFolder;
  is_unread: boolean;
  is_starred: boolean;
  assigned_to: string | null;
  assigned_to_email: string | null;
  participants: string[];
  message_count: number;
  last_activity_at: string;
  ticket_id: string | null;
  organization_id: string | null;
  preview: string;
  labels: { id: string; name_ar: string; color: string }[];
};

export type EmailMessage = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  status: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  html: string | null;
  body_text: string | null;
  received_at: string | null;
  sent_at: string | null;
  scheduled_at: string | null;
  failure_ref: string | null;
  created_by_email: string | null;
  created_at: string;
  attachments: {
    id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    direction?: "inbound" | "outbound";
    scan_status?: string;
    is_quarantined?: boolean;
    is_inline_safe?: boolean;
  }[];
};

export type ThreadDetail = {
  thread: ThreadSummary;
  messages: EmailMessage[];
  notes: { id: string; author_email: string; body: string; created_at: string }[];
};

/** الصناديق النظامية لا تُستخدم للمراسلة اليدوية إطلاقاً. */
export function isSystemMailbox(mailbox: Pick<Mailbox, "type">): boolean {
  return mailbox.type === "system";
}

const EMAIL_RE = /^[^\s@]+@[^\s@,]+\.[^\s@,]{2,}$/;

/** تفكيك حقل مستلمين نصي إلى عناوين صحيحة فريدة (مع رمي رسالة عربية عند الخطأ). */
export function parseAddressList(raw: string, fieldLabel: string): string[] {
  const parts = raw
    .split(/[,;\n]/)
    .map((p) => p.trim().replace(/^.*<([^>]+)>$/, "$1").toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) throw new Error(`عنوان غير صحيح في «${fieldLabel}»: ${p}`);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function isValidAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

/** نص مختصر للعرض في قائمة المحادثات. */
export function previewOf(text: string | null, html: string | null, max = 140): string {
  const source = text?.trim() || stripHtml(html ?? "");
  return source.replace(/\s+/g, " ").slice(0, max);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** بناء موضوع رد أو تحويل دون تكرار البادئة. */
export function replySubject(subject: string): string {
  return /^(re|رد)\s*:/i.test(subject.trim()) ? subject.trim() : `رد: ${subject.trim()}`;
}

export function forwardSubject(subject: string): string {
  return /^(fwd|تحويل)\s*:/i.test(subject.trim()) ? subject.trim() : `تحويل: ${subject.trim()}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.بايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.بايت`;
}