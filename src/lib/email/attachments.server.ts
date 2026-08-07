import type { Db as SupabaseDb } from "@/lib/supabase-db.shared";
/**
 * محرك مرفقات البريد — خادمي فقط.
 *
 * كل مرفق يمر بأربع مراحل قبل أن يُقبل:
 *  1) سياسة الاسم والامتداد والحجم (قائمة سماح مغلقة).
 *  2) قراءة البايتات والتحقق من التوقيع الفعلي (Magic Bytes) ومطابقته للامتداد.
 *  3) فحص محتوى نشط داخل الملفات النصية (HTML/سكربت) ورفضه.
 *  4) تخزين في مستودع خاص غير عام بمسار مُولَّد خادمياً (لا يُشتق من اسم المستخدم).
 *
 * لا يوجد فحص فيروسات في البنية الحالية: الحالة تُسجَّل «not_scanned» بصدق،
 * ولا يُدّعى فحص غير موجود. عند ربط موصل فحص لاحقاً تُحدّث الحالة إلى clean/rejected.
 */
import {
  ATTACHMENT_LINK_TTL_SECONDS,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_FILE_BYTES,
  ATTACHMENT_MAX_TOTAL_BYTES,
  ALLOWED_ATTACHMENTS,
  checkAttachmentPolicy,
  extensionOf,
  safeFileName,
} from "@/lib/email/attachments.shared";

type Db = SupabaseDb;

export const ATTACHMENT_BUCKET = "email-attachments";

/* ------------------------------------------------------- التوقيع الفعلي */

type Signature = { ext: string[]; test: (b: Uint8Array) => boolean };

function starts(bytes: Uint8Array, hex: number[], offset = 0): boolean {
  if (bytes.length < offset + hex.length) return false;
  return hex.every((v, i) => bytes[offset + i] === v);
}

const SIGNATURES: Signature[] = [
  { ext: ["pdf"], test: (b) => starts(b, [0x25, 0x50, 0x44, 0x46]) }, // %PDF
  {
    ext: ["docx", "xlsx", "pptx"],
    test: (b) => starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06]),
  },
  { ext: ["doc", "xls"], test: (b) => starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  { ext: ["jpg"], test: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  { ext: ["png"], test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { ext: ["gif"], test: (b) => starts(b, [0x47, 0x49, 0x46, 0x38]) },
  {
    ext: ["webp"],
    test: (b) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
];

const TEXT_EXTS = new Set(["txt", "csv"]);
const ACTIVE_CONTENT =
  /<\s*(script|iframe|object|embed|meta|link|svg)\b|javascript:|vbscript:|data:text\/html|<\?php|<%|on(?:load|error|click)\s*=/i;

export type ValidationOutcome =
  | { ok: true; ext: string; mime: string; inlineSafe: boolean; sha256: string; safeName: string }
  | { ok: false; reason: string };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** التحقق الكامل من ملف واحد. لا يثق باسم الملف ولا بنوع المحتوى المُعلن. */
export async function validateAttachmentBytes(
  fileName: string,
  bytes: Uint8Array,
): Promise<ValidationOutcome> {
  const safeName = safeFileName(fileName);
  const policy = checkAttachmentPolicy(safeName, bytes.byteLength);
  if (!policy.ok) return { ok: false, reason: policy.reason };
  const ext = extensionOf(safeName);

  if (TEXT_EXTS.has(ext)) {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, reason: "الملف النصي غير مقروء بترميز UTF-8." };
    }
    if (decoded.includes("\u0000"))
      return { ok: false, reason: "الملف النصي يحتوي بايتات ثنائية." };
    if (ACTIVE_CONTENT.test(decoded)) {
      return { ok: false, reason: "الملف النصي يحتوي محتوى نشطاً (HTML أو سكربت) وهو غير مسموح." };
    }
  } else {
    const signature = SIGNATURES.find((s) => s.ext.includes(ext));
    if (!signature) return { ok: false, reason: "لا يمكن التحقق من توقيع هذا النوع." };
    if (!signature.test(bytes)) {
      return { ok: false, reason: "توقيع الملف الفعلي لا يطابق امتداده — رُفض الملف." };
    }
    // ملف صورة يبدأ بمحتوى HTML مموّه
    if (ext === "jpg" || ext === "png" || ext === "gif" || ext === "webp") {
      const head = new TextDecoder("latin1").decode(bytes.slice(0, 512));
      if (/<\s*(script|html|svg)\b/i.test(head)) {
        return { ok: false, reason: "الصورة تحتوي رأساً مموّهاً بمحتوى HTML." };
      }
    }
  }

  const kind = ALLOWED_ATTACHMENTS.find((a) => a.ext === ext)!;
  return {
    ok: true,
    ext,
    mime: kind.mime,
    inlineSafe: kind.inlineSafe,
    sha256: await sha256Hex(bytes),
    safeName,
  };
}

/* ------------------------------------------------------- الحدود الإجمالية */

export async function assertMessageAttachmentBudget(
  db: Db,
  messageId: string,
  incomingBytes: number,
): Promise<void> {
  const { data } = await db
    .from("email_attachments")
    .select("size_bytes")
    .eq("message_id", messageId);
  const rows = (data ?? []) as { size_bytes: number }[];
  if (rows.length >= ATTACHMENT_MAX_COUNT) {
    throw new Error(`لا يمكن إضافة أكثر من ${ATTACHMENT_MAX_COUNT} مرفقات للرسالة.`);
  }
  const total = rows.reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0);
  if (total + incomingBytes > ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new Error("تجاوز الحجم الإجمالي للمرفقات 25 م.بايت.");
  }
  if (incomingBytes > ATTACHMENT_MAX_FILE_BYTES) throw new Error("حجم الملف يتجاوز 10 م.بايت.");
}

/* ------------------------------------------------------- التخزين */

function storagePath(
  direction: "inbound" | "outbound",
  messageId: string,
  ext: string,
  quarantined: boolean,
): string {
  const folder =
    direction === "inbound" ? (quarantined ? "inbound/quarantine" : "inbound") : "outbound";
  return `${folder}/${messageId}/${crypto.randomUUID()}.${ext}`;
}

export type StoredAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_path: string;
  is_inline_safe: boolean;
};

/**
 * تحقق + تخزين + تسجيل مرفق واحد. يرمي رسالة عربية واضحة عند الرفض،
 * ولا يترك أي ملف في المستودع إذا فشل تسجيله في القاعدة.
 */
export async function storeAttachment(
  db: Db,
  input: {
    messageId: string;
    direction: "inbound" | "outbound";
    fileName: string;
    bytes: Uint8Array;
    uploadedBy?: string | null;
    uploadedByEmail?: string | null;
  },
): Promise<StoredAttachment> {
  await assertMessageAttachmentBudget(db, input.messageId, input.bytes.byteLength);
  const verdict = await validateAttachmentBytes(input.fileName, input.bytes);
  if (!verdict.ok) throw new Error(verdict.reason);

  const { data: dup } = await db
    .from("email_attachments")
    .select("id")
    .eq("message_id", input.messageId)
    .eq("sha256", verdict.sha256)
    .maybeSingle();
  if (dup) throw new Error("هذا الملف مرفق بالرسالة مسبقاً.");

  const path = storagePath(input.direction, input.messageId, verdict.ext, false);
  const upload = await db.storage.from(ATTACHMENT_BUCKET).upload(path, input.bytes, {
    contentType: verdict.mime,
    upsert: false,
  });
  if (upload.error) throw new Error("تعذّر تخزين المرفق.");

  const { data, error } = await db
    .from("email_attachments")
    .insert({
      message_id: input.messageId,
      direction: input.direction,
      file_name: verdict.safeName,
      original_name: safeFileName(input.fileName),
      extension: verdict.ext,
      mime_type: verdict.mime,
      size_bytes: input.bytes.byteLength,
      storage_path: path,
      sha256: verdict.sha256,
      scan_status: "not_scanned",
      scan_detail: "لا يوجد موصل فحص فيروسات مُفعّل — تم التحقق البنيوي والتوقيع الفعلي فقط.",
      is_quarantined: false,
      is_inline_safe: verdict.inlineSafe,
      uploaded_by: input.uploadedBy ?? null,
      uploaded_by_email: input.uploadedByEmail ?? null,
    })
    .select("id, file_name, mime_type, size_bytes, sha256, storage_path, is_inline_safe")
    .single();

  if (error) {
    await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error("تعذّر تسجيل المرفق.");
  }
  return data as StoredAttachment;
}

/** حجر مرفق وارد لم يستوفِ الفحص: يُحفظ للفحص اليدوي ولا يُعرض إطلاقاً. */
export async function quarantineInboundAttachment(
  db: Db,
  input: { messageId: string; fileName: string; bytes: Uint8Array; reason: string },
): Promise<void> {
  const name = safeFileName(input.fileName);
  const path = storagePath("inbound", input.messageId, "bin", true);
  const upload = await db.storage.from(ATTACHMENT_BUCKET).upload(path, input.bytes, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (upload.error) return;
  await db.from("email_attachments").insert({
    message_id: input.messageId,
    direction: "inbound",
    file_name: name,
    original_name: name,
    extension: extensionOf(name) || null,
    mime_type: "application/octet-stream",
    size_bytes: input.bytes.byteLength,
    storage_path: path,
    sha256: await sha256Hex(input.bytes),
    scan_status: "quarantined",
    scan_detail: input.reason.slice(0, 400),
    is_quarantined: true,
    is_inline_safe: false,
  });
}

export async function listAttachments(db: Db, messageId: string): Promise<StoredAttachment[]> {
  const { data } = await db
    .from("email_attachments")
    .select("id, file_name, mime_type, size_bytes, sha256, storage_path, is_inline_safe")
    .eq("message_id", messageId)
    .eq("is_quarantined", false)
    .order("created_at", { ascending: true });
  return (data ?? []) as StoredAttachment[];
}

/** رابط موقّع قصير الأجل. يُسجَّل كل إصدار رابط في سجل التدقيق من طبقة الدوال. */
export async function signedAttachmentUrl(
  db: Db,
  attachmentId: string,
  opts: { download?: boolean } = {},
): Promise<{ url: string; fileName: string; messageId: string | null; quarantined: boolean }> {
  const { data } = await db
    .from("email_attachments")
    .select("id, message_id, file_name, storage_path, is_quarantined")
    .eq("id", attachmentId)
    .maybeSingle();
  const row = data as {
    id: string;
    message_id: string | null;
    file_name: string;
    storage_path: string;
    is_quarantined: boolean;
  } | null;
  if (!row) throw new Error("المرفق غير موجود.");
  if (row.is_quarantined) throw new Error("هذا المرفق محجور ولا يمكن تنزيله.");

  const signed = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path, ATTACHMENT_LINK_TTL_SECONDS, {
      download: opts.download === false ? false : row.file_name,
    });
  if (signed.error || !signed.data?.signedUrl) throw new Error("تعذّر إصدار رابط التنزيل.");

  return {
    url: signed.data.signedUrl,
    fileName: row.file_name,
    messageId: row.message_id,
    quarantined: row.is_quarantined,
  };
}

export async function bumpDownloadCount(db: Db, attachmentId: string): Promise<void> {
  const { data } = await db
    .from("email_attachments")
    .select("download_count")
    .eq("id", attachmentId)
    .maybeSingle();
  const current = Number((data as { download_count: number } | null)?.download_count ?? 0);
  await db
    .from("email_attachments")
    .update({ download_count: current + 1, last_downloaded_at: new Date().toISOString() })
    .eq("id", attachmentId);
}

/** حذف مرفق مسوّدة (قبل الإرسال فقط). */
export async function deleteAttachment(
  db: Db,
  attachmentId: string,
): Promise<{ messageId: string | null }> {
  const { data } = await db
    .from("email_attachments")
    .select("id, message_id, storage_path, direction")
    .eq("id", attachmentId)
    .maybeSingle();
  const row = data as { message_id: string | null; storage_path: string; direction: string } | null;
  if (!row) throw new Error("المرفق غير موجود.");
  if (row.direction !== "outbound") throw new Error("لا يمكن حذف مرفق وارد.");
  if (row.message_id) {
    const { data: msg } = await db
      .from("email_messages")
      .select("status")
      .eq("id", row.message_id)
      .maybeSingle();
    const status = (msg as { status: string } | null)?.status ?? "draft";
    if (!["draft", "scheduled", "failed"].includes(status)) {
      throw new Error("لا يمكن حذف مرفق رسالة أُرسلت أو في قائمة الإرسال.");
    }
  }
  await db.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
  await db.from("email_attachments").delete().eq("id", attachmentId);
  return { messageId: row.message_id };
}

/**
 * روابط تنزيل موقّعة تُضاف إلى نص الرسالة الصادرة.
 *
 * خدمة البريد المُدارة الحالية لا تدعم رفع مرفقات MIME في مسار الإرسال،
 * لذا تُسلَّم المرفقات كروابط موقّعة قصيرة الأجل — وهذا مُعلَن للمستخدم في الواجهة
 * ولا يُقدَّم على أنه إرفاق MIME حقيقي.
 */
export async function buildAttachmentSection(
  db: Db,
  messageId: string,
  ttlSeconds: number,
): Promise<{ html: string; text: string; count: number }> {
  const rows = await listAttachments(db, messageId);
  if (rows.length === 0) return { html: "", text: "", count: 0 };

  const links: { name: string; url: string }[] = [];
  for (const row of rows) {
    const signed = await db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(row.storage_path, ttlSeconds, { download: row.file_name });
    if (signed.error || !signed.data?.signedUrl) continue;
    links.push({ name: row.file_name, url: signed.data.signedUrl });
  }
  if (links.length === 0) return { html: "", text: "", count: 0 };

  const items = links
    .map(
      (l) =>
        `<li style="margin:0 0 6px"><a href="${l.url}" style="color:#123C32">${escapeHtml(l.name)}</a></li>`,
    )
    .join("");
  return {
    count: links.length,
    html: `<div dir="rtl" style="margin-top:20px;padding-top:12px;border-top:1px solid #E4E0D6;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;font-size:14px;color:#1A1A1A"><p style="margin:0 0 8px;font-weight:600">المرفقات (${links.length})</p><ul style="margin:0;padding-inline-start:18px">${items}</ul><p style="margin:8px 0 0;font-size:12px;color:#6B6B6B">روابط التنزيل مؤمّنة وتنتهي صلاحيتها تلقائياً.</p></div>`,
    text: `\n\nالمرفقات (${links.length}):\n${links.map((l) => `- ${l.name}: ${l.url}`).join("\n")}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ATTACHMENT_LINK_TTL = ATTACHMENT_LINK_TTL_SECONDS;
