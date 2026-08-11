export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_FILES_PER_REQUEST = 15;

/**
 * الحد الأدنى/الأقصى لطول توكن الروابط العامة (رفع المستندات ومشاركتها).
 * تُستخدم في العميل والخادم معاً حتى يُعرض التوكن المشوّه كـ«رابط غير صالح»
 * بدل خطأ تقني غير مفهوم.
 */
export const PORTAL_TOKEN_MIN = 20;
export const PORTAL_TOKEN_MAX = 200;

export function isPortalTokenShape(token: string | undefined | null): boolean {
  const value = (token ?? "").trim();
  return value.length >= PORTAL_TOKEN_MIN && value.length <= PORTAL_TOKEN_MAX;
}

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "txt",
  "csv",
] as const;

export const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/csv",
];

/**
 * الصيغ المدعومة فعلياً من الرفع حتى العرض الآمن: لكل صيغة في هذه القائمة
 * مسار عرض مائي (PDF أو صورة مباشرة) أو استخراج نصي يُنتج نسخة PDF مائية.
 * لا تُوسّع هذه القائمة قبل توفير معالجة وعرض حقيقيين للصيغة الجديدة.
 */
export const SUPPORTED_FORMATS_LABEL =
  "PDF أو Word (docx) أو صور (JPG / PNG / WebP) أو نصوص (TXT / CSV)";

export const UNSUPPORTED_FORMAT_MESSAGE = `نوع الملف غير مسموح به. يُسمح بملفات ${SUPPORTED_FORMATS_LABEL} فقط.`;

export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

/** Client + server share the same validation rules. */
export function validateClientFile(file: { name: string; size: number; type: string }) {
  const ext = fileExtension(file.name);
  if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return UNSUPPORTED_FORMAT_MESSAGE;
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
  // نطاق أحرف التحكم مقصود: تنقية أسماء الملفات من محارف التحكم.
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-180);
}

export const DOC_REQUEST_STATUS: Record<string, string> = {
  active: "نشط",
  completed: "مكتمل",
  revoked: "ملغى",
  expired: "منتهي",
};
