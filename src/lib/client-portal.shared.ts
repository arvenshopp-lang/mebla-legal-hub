export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_FILES_PER_REQUEST = 15;

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "txt",
  "csv",
] as const;

export const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/csv",
];

export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

/** Client + server share the same validation rules. */
export function validateClientFile(file: { name: string; size: number; type: string }) {
  const ext = fileExtension(file.name);
  if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return "نوع الملف غير مسموح به. يُسمح بملفات PDF والصور ومستندات Office فقط.";
  }
  if (file.size <= 0) return "الملف فارغ.";
  if (file.size > MAX_UPLOAD_SIZE) return "حجم الملف يتجاوز 20 ميجابايت.";
  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return "نوع الملف (MIME) غير مسموح به.";
  }
  return null;
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-180);
}

export const DOC_REQUEST_STATUS: Record<string, string> = {
  active: "نشط",
  completed: "مكتمل",
  revoked: "ملغى",
  expired: "منتهي",
};
