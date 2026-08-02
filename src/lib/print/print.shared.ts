/**
 * Centralised print/export domain model for مِهلة.
 *
 * Every printable surface (cases, contracts, memos, invoices, quotes,
 * reports, minutes, OCR text, search results, correspondence, forms…) goes
 * through this module so that watermarking, footers and the immutable audit
 * trail are applied once, in one place, and can never be forgotten by a new
 * feature: the print engine is the only supported way to produce output.
 */

export type PrintAction = "print" | "export_pdf" | "download";

export const PRINT_ACTION_LABELS: Record<PrintAction, string> = {
  print: "طباعة",
  export_pdf: "تصدير PDF",
  download: "تنزيل",
};

/** أنواع المستندات القابلة للطباعة داخل المنصة. */
export type PrintDocumentType =
  | "contract"
  | "case"
  | "case_file"
  | "memo"
  | "document"
  | "report"
  | "invoice"
  | "quote"
  | "correspondence"
  | "meeting_minutes"
  | "form"
  | "ocr_text"
  | "search_results"
  | "other";

export const DOCUMENT_TYPE_LABELS: Record<PrintDocumentType, string> = {
  contract: "عقد",
  case: "قضية",
  case_file: "ملف قضية",
  memo: "مذكرة",
  document: "مستند",
  report: "تقرير",
  invoice: "فاتورة",
  quote: "عرض سعر",
  correspondence: "مراسلة",
  meeting_minutes: "محضر اجتماع",
  form: "نموذج",
  ocr_text: "نص مستخرج",
  search_results: "نتائج بحث",
  other: "مستند",
};

/** تصنيف السرية — يحدد الختم الإضافي أعلى العلامة المائية. */
export type Classification = "internal" | "confidential" | "secret" | "highly_confidential";

export const CLASSIFICATION_STAMPS: Record<Classification, string | null> = {
  internal: "INTERNAL USE ONLY",
  confidential: "CONFIDENTIAL",
  secret: "TOP SECRET",
  highly_confidential: "HIGHLY CONFIDENTIAL",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  internal: "للاستخدام الداخلي",
  confidential: "سرّي",
  secret: "سرّي للغاية",
  highly_confidential: "بالغ السرية",
};

export function isRestricted(classification: Classification): boolean {
  return classification !== "internal";
}

/** وصف المستند المطلوب طباعته أو تصديره. */
export type PrintTarget = {
  documentType: PrintDocumentType;
  /** معرّف الصف في قاعدة البيانات إن وُجد. */
  documentId?: string | null;
  /** رقم المستند الظاهر للمستخدم، يُولّد تلقائياً إن لم يُمرّر. */
  documentRef?: string | null;
  title: string;
  version?: string;
  classification?: Classification;
  /** اسم الملف الناتج عند التصدير. */
  fileName?: string;
};

/** بصمة الجهاز والجلسة — تُجمع في المتصفح ولا تحتوي أي بيانات قانونية. */
export type ClientEnvironment = {
  browser: string;
  os: string;
  device: string;
  sessionId: string;
  userAgent: string;
  timeZone: string;
};

const SESSION_KEY = "mehla_print_session";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function detectEnvironment(): ClientEnvironment {
  if (typeof navigator === "undefined") {
    return {
      browser: "غير معروف",
      os: "غير معروف",
      device: "غير معروف",
      sessionId: "server",
      userAgent: "",
      timeZone: "Asia/Riyadh",
    };
  }
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome|CriOS/.test(ua)
        ? "Chrome"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : "أخرى";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "غير معروف";
  const device = /iPad|Tablet/.test(ua) ? "تابلت" : /Mobile|iPhone|Android/.test(ua) ? "جوال" : "حاسب";

  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) ?? "";
    if (!sessionId) {
      sessionId = randomId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    sessionId = randomId();
  }

  let timeZone = "Asia/Riyadh";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
  } catch {
    /* المتصفحات القديمة */
  }

  return { browser, os, device, sessionId, userAgent: ua.slice(0, 400), timeZone };
}

/** التاريخ والوقت بالتقويم الميلادي وبأرقام لاتينية لتتبّع موحّد. */
export function formatStampDate(date: Date, timeZone = "Asia/Riyadh"): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${pick("hour")}:${pick("minute")}:${pick("second")}`,
  };
}

export function documentRefFor(target: PrintTarget): string {
  if (target.documentRef) return target.documentRef;
  const seed = (target.documentId ?? target.title).replace(/[^a-zA-Z0-9]/g, "");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_000;
  return `DOC-${String(hash).padStart(6, "0")}`;
}

/** ملفات PDF وصور PNG/JPEG فقط يمكن ختمها وتصديرها كـ PDF مختوم. */
export function isStampableForExport(fileName: string, fileType: string | null | undefined): boolean {
  const type = (fileType ?? "").toLowerCase();
  if (type.includes("pdf") || type === "image/png" || type === "image/jpeg" || type === "image/jpg") return true;
  return /\.(pdf|png|jpe?g)$/i.test(fileName);
}

/** كل ما يُطبع على الورق: هوية المنفّذ + بصمة الجهاز + هوية المستند. */
export type PrintStamp = {
  printRef: string;
  action: PrintAction;
  userName: string;
  userEmail: string;
  userRoleLabel: string;
  userId: string;
  officeName: string;
  documentRef: string;
  documentId: string | null;
  documentTitle: string;
  documentTypeLabel: string;
  documentVersion: string;
  classification: Classification;
  copyNumber: number;
  date: string;
  time: string;
  ip: string;
  country: string | null;
  browser: string;
  os: string;
  device: string;
  sessionId: string;
};

/** أسطر العلامة المائية القطرية (تظهر مكررة على كامل الصفحة). */
export function watermarkLines(stamp: PrintStamp): string[] {
  return [
    `Printed by: ${stamp.userName}`,
    `${stamp.userRoleLabel} · ${stamp.officeName}`,
    stamp.userEmail,
    `${stamp.date}  ${stamp.time}`,
    `${stamp.documentRef} · ${stamp.documentVersion} · Copy ${stamp.copyNumber}`,
    `IP: ${stamp.ip || "—"} · ${stamp.device} · ${stamp.browser}`,
    `Print ID: ${stamp.printRef}`,
  ];
}

/** سطر التذييل الثابت أسفل كل صفحة. */
export function footerLine(stamp: PrintStamp, page?: number, total?: number): string {
  const pageText = page && total ? `صفحة ${page} من ${total}` : page ? `صفحة ${page}` : "";
  return [
    stamp.userName,
    `${stamp.date} ${stamp.time}`,
    pageText,
    `${stamp.documentRef} · ${stamp.documentVersion} · نسخة ${stamp.copyNumber}`,
    `Print ID: ${stamp.printRef}`,
  ]
    .filter(Boolean)
    .join("  |  ");
}

export const ROLE_PRINT_LABELS: Record<string, string> = {
  owner: "مالك المكتب",
  admin: "مدير",
  lawyer: "محام",
  legal_assistant: "مساعد قانوني",
  viewer: "مطالع",
};