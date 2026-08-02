/**
 * Domain model for document text extraction, OCR and full-text search.
 * Shared by the browser pipeline, the server functions and the UI.
 */

export type DocumentJobStatus =
  | "queued"
  | "extracting"
  | "ocr_processing"
  | "indexing"
  | "completed"
  | "failed";

export const JOB_STATUS_LABELS: Record<DocumentJobStatus, string> = {
  queued: "بانتظار المعالجة",
  extracting: "جارٍ استخراج النص",
  ocr_processing: "جارٍ قراءة الصفحات المصوّرة",
  indexing: "جارٍ فهرسة المستند",
  completed: "جاهز للبحث",
  failed: "فشلت المعالجة",
};

export const JOB_STATUS_TONE: Record<DocumentJobStatus, "green" | "red" | "warn" | "muted"> = {
  queued: "muted",
  extracting: "warn",
  ocr_processing: "warn",
  indexing: "warn",
  completed: "green",
  failed: "red",
};

/** رموز أخطاء تقنية للسجلات، مع رسالة عربية مفهومة للمستخدم. */
export const PROCESSING_ERRORS: Record<string, string> = {
  UNSUPPORTED_TYPE: "نوع الملف غير مدعوم لاستخراج النص.",
  FILE_TOO_LARGE: "حجم الملف أكبر من الحد المسموح للمعالجة.",
  CORRUPT_FILE: "تعذّر قراءة الملف، قد يكون تالفاً أو محمياً بكلمة مرور.",
  NO_TEXT_FOUND: "لم يُعثر على نص قابل للاستخراج في هذا الملف.",
  OCR_FAILED: "تعذّر إكمال القراءة الضوئية للصفحات المصوّرة.",
  OCR_QUOTA_EXCEEDED: "استهلكت باقتك كامل صفحات القراءة الضوئية لهذا الشهر.",
  OCR_NOT_IN_PLAN: "القراءة الضوئية غير مشمولة في باقتك الحالية.",
  SEARCH_NOT_IN_PLAN: "البحث داخل المستندات غير مشمول في باقتك الحالية.",
  DOWNLOAD_FAILED: "تعذّر تنزيل الملف من مساحة التخزين لإعادة المعالجة.",
  UNKNOWN: "حدث خطأ غير متوقع أثناء المعالجة.",
};

export function describeProcessingError(code?: string | null, fallback?: string | null): string {
  if (code && PROCESSING_ERRORS[code]) return PROCESSING_ERRORS[code];
  return fallback?.trim() || PROCESSING_ERRORS['UNKNOWN']!;
}

/** أنواع الملفات التي يمكن استخراج نصها. */
export const TEXT_EXTRACTABLE_EXTENSIONS = ["pdf", "docx", "txt", "jpg", "jpeg", "png"] as const;

export type ExtractableKind = "pdf" | "docx" | "txt" | "image";

export function extractableKind(fileName: string, mime?: string | null): ExtractableKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = (mime ?? "").toLowerCase();
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "docx" || type.includes("wordprocessingml")) return "docx";
  if (ext === "txt" || type.startsWith("text/")) return "txt";
  if (["jpg", "jpeg", "png"].includes(ext) || type.startsWith("image/")) return "image";
  return null;
}

/** أقل عدد أحرف يعتبر معه النص الرقمي كافياً قبل اللجوء إلى OCR. */
export const MIN_DIGITAL_CHARS_PER_PAGE = 40;

/** حد أقصى لعدد صفحات القراءة الضوئية في العملية الواحدة. */
export const MAX_OCR_PAGES_PER_RUN = 30;

/** الحد الأقصى لعدد المحاولات لكل مستند. */
export const MAX_JOB_ATTEMPTS = 3;

export type PageText = {
  page_number: number;
  extracted_text: string;
  ocr_used: boolean;
  ocr_confidence: number | null;
  language: string | null;
  is_blank: boolean;
};

/** تطبيع عربي مطابق لدالة قاعدة البيانات، لاستخدامه في التمييز داخل الواجهة. */
export function normalizeArabic(input: string): string {
  return input
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}
