/**
 * سياسة مرفقات البريد — مشتركة بين الخادم والواجهة.
 * القاعدة: قائمة سماح مغلقة (Allow-list) لا قائمة منع، والتحقق النهائي خادمي دائماً.
 */

export const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 م.بايت لكل ملف
export const ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 م.بايت لكل رسالة
export const ATTACHMENT_MAX_COUNT = 10;
export const ATTACHMENT_LINK_TTL_SECONDS = 300; // رابط موقّع قصير الأجل (5 دقائق)

export type AttachmentKind = {
  /** الامتداد المعياري (بدون نقطة). */
  ext: string;
  /** نوع المحتوى المعتمد — يُفرض خادمياً ولا يُصدَّق ما يرسله العميل. */
  mime: string;
  label: string;
  /** هل يُسمح بعرضه داخل الواجهة مباشرة (صور فقط). */
  inlineSafe: boolean;
};

/** قائمة السماح الوحيدة. أي امتداد أو نوع خارجها يُرفض. */
export const ALLOWED_ATTACHMENTS: AttachmentKind[] = [
  { ext: "pdf", mime: "application/pdf", label: "PDF", inlineSafe: false },
  {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    inlineSafe: false,
  },
  {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
    inlineSafe: false,
  },
  {
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
    inlineSafe: false,
  },
  { ext: "doc", mime: "application/msword", label: "Word (قديم)", inlineSafe: false },
  { ext: "xls", mime: "application/vnd.ms-excel", label: "Excel (قديم)", inlineSafe: false },
  { ext: "jpg", mime: "image/jpeg", label: "صورة JPEG", inlineSafe: true },
  { ext: "png", mime: "image/png", label: "صورة PNG", inlineSafe: true },
  { ext: "webp", mime: "image/webp", label: "صورة WebP", inlineSafe: true },
  { ext: "gif", mime: "image/gif", label: "صورة GIF", inlineSafe: true },
  { ext: "txt", mime: "text/plain", label: "نص", inlineSafe: false },
  { ext: "csv", mime: "text/csv", label: "CSV", inlineSafe: false },
];

/** امتدادات ممنوعة نهائياً حتى لو تنكّرت في اسم مركّب (file.pdf.exe). */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "com", "pif", "scr", "msi", "msp", "cpl", "cab",
  "bat", "cmd", "sh", "bash", "zsh", "ps1", "psm1", "vb", "vbs", "vbe", "wsf", "wsh",
  "js", "mjs", "cjs", "jse", "jar", "class", "apk", "app", "deb", "rpm",
  "html", "htm", "xhtml", "shtml", "svg", "mhtml", "xml", "xsl", "xslt",
  "php", "phtml", "asp", "aspx", "jsp", "py", "pyc", "rb", "pl", "cgi",
  "lnk", "url", "reg", "inf", "iso", "img", "dmg", "vhd", "chm", "hta",
  "zip", "rar", "7z", "gz", "tar", "bz2", "xz", "ace", "arj",
]);

export const ALLOWED_EXTENSIONS = new Set(ALLOWED_ATTACHMENTS.map((a) => a.ext));

export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENTS.map((a) => `.${a.ext}`).join(",");

export type AttachmentMeta = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  direction?: "inbound" | "outbound";
  scan_status?: string;
  is_quarantined?: boolean;
  is_inline_safe?: boolean;
};

/** استخراج الامتداد الأخير بحروف صغيرة. */
export function extensionOf(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  const idx = clean.lastIndexOf(".");
  return idx > 0 && idx < clean.length - 1 ? clean.slice(idx + 1) : "";
}

/**
 * تنقية اسم الملف: إزالة المسارات ومحارف التحكم و«..» لمنع Path Traversal،
 * وتقييد الطول. الاسم الناتج للعرض والتنزيل فقط — مسار التخزين يُولَّد خادمياً.
 */
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/[<>:"|?*\\/]/g, "_")
    .replace(/^[.\s]+/, "")
    .trim();
  const limited = cleaned.slice(0, 180);
  return limited || "attachment";
}

export type PolicyResult =
  | { ok: true; kind: AttachmentKind }
  | { ok: false; reason: string };

/** فحص الاسم والحجم قبل قراءة البايتات (يُستخدم في الواجهة وعلى الخادم). */
export function checkAttachmentPolicy(fileName: string, sizeBytes: number): PolicyResult {
  const name = safeFileName(fileName);
  const parts = name.toLowerCase().split(".").slice(1);
  for (const part of parts) {
    if (BLOCKED_EXTENSIONS.has(part)) {
      return { ok: false, reason: `نوع الملف «${part}» غير مسموح لأسباب أمنية.` };
    }
  }
  const ext = extensionOf(name);
  if (!ext) return { ok: false, reason: "الملف بدون امتداد واضح." };
  const kind = ALLOWED_ATTACHMENTS.find((a) => a.ext === ext);
  if (!kind) return { ok: false, reason: `الامتداد «${ext}» غير مدرج في الأنواع المسموحة.` };
  if (sizeBytes <= 0) return { ok: false, reason: "الملف فارغ." };
  if (sizeBytes > ATTACHMENT_MAX_FILE_BYTES) {
    return { ok: false, reason: "حجم الملف يتجاوز 10 م.بايت." };
  }
  return { ok: true, kind };
}

export function formatAttachmentLimits(): string {
  return `حتى ${ATTACHMENT_MAX_COUNT} ملفات، 10 م.بايت للملف و25 م.بايت للرسالة.`;
}
