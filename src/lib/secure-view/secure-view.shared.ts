/**
 * Shared vocabulary for the secure document pipeline.
 *
 * Nothing sensitive ever reaches the paper: the watermark carries only the
 * office and viewer identity. Network and device details remain in the audit log.
 */

export type DocumentAccessAction = "VIEW" | "PREVIEW" | "DOWNLOAD" | "SHARE" | "PRINT" | "EXPORT";

export const ACCESS_ACTION_LABELS: Record<DocumentAccessAction, string> = {
  VIEW: "عرض",
  PREVIEW: "معاينة",
  DOWNLOAD: "تنزيل",
  SHARE: "مشاركة",
  PRINT: "طباعة",
  EXPORT: "تصدير",
};

export type SecureTokenKind =
  | "view"
  | "preview"
  | "download"
  | "print"
  | "export"
  | "share"
  | "process";

export type DocumentClassification =
  | "internal"
  | "confidential"
  | "secret"
  | "highly_confidential";

/** العبارة الصغيرة التي تُضاف للمستندات المصنّفة فقط. */
export const CLASSIFICATION_NOTES: Record<DocumentClassification, string | null> = {
  internal: "للاستخدام الداخلي",
  confidential: "سرّي — للاستخدام الداخلي",
  secret: "سرّي للغاية — للاستخدام الداخلي",
  highly_confidential: "بالغ السرية — للاستخدام الداخلي",
};

/** مدة صلاحية التذاكر بالثواني حسب نوع العملية. */
export const TOKEN_TTL_SECONDS: Record<SecureTokenKind, number> = {
  view: 120,
  preview: 120,
  print: 120,
  download: 120,
  export: 120,
  process: 300,
  share: 7 * 24 * 60 * 60,
};

export const TOKEN_MAX_USES: Record<SecureTokenKind, number> = {
  // المتصفحات قد تُعيد الطلب (Range / إعادة محاولة) لذلك نمنح هامشاً محدوداً
  // داخل نافذة الصلاحية القصيرة نفسها بدل إفشال العرض من أول إعادة طلب.
  view: 8,
  preview: 8,
  print: 8,
  download: 4,
  export: 4,
  process: 2,
  share: 50,
};

/** سطرا العلامة المائية: اسم المكتب ثم من فتح الملف. */
export function watermarkLinesFor(
  officeName: string,
  userName: string,
  kind: SecureTokenKind,
  detail: { email?: string; sessionId?: string; openedAt?: Date } = {},
): [string, string] {
  const office = officeName.trim() || "مِهلة للمحاماة";
  const user = userName.trim() || "مستخدم غير معروف";
  const prefix = kind === "share" ? "تمت المشاركة بواسطة" : "فتح بواسطة";
  const email = detail.email?.trim() ? ` | ${detail.email.trim()}` : "";
  const openedAt = (detail.openedAt ?? new Date()).toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const session = detail.sessionId?.trim() ? ` | Session: ${detail.sessionId.trim().slice(0, 36)}` : "";
  return [office, `${prefix}: ${user}${email} | ${openedAt}${session}`];
}

export function classificationOf(
  isConfidential: boolean | null | undefined,
  category?: string | null,
): DocumentClassification {
  const value = (category ?? "").toLowerCase();
  if (/highly|بالغ/.test(value)) return "highly_confidential";
  if (/secret|سرّي للغاية|سري للغاية/.test(value)) return "secret";
  return isConfidential ? "confidential" : "internal";
}

/** الصيغ التي يمكن ختمها وعرضها كنسخة PDF مائية. */
export function viewableKind(
  fileName: string,
  fileType: string | null | undefined,
): "pdf" | "image" | "text" {
  const type = (fileType ?? "").toLowerCase();
  if (type.includes("pdf") || /\.pdf$/i.test(fileName)) return "pdf";
  if (/^image\/(png|jpe?g)$/.test(type) || /\.(png|jpe?g)$/i.test(fileName)) return "image";
  return "text";
}

export function safePdfName(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80);
  return `${base || "document"}-watermarked.pdf`;
}
