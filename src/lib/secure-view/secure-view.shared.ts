/**
 * Shared vocabulary for the secure document pipeline.
 *
 * Nothing sensitive ever reaches the paper: the watermark carries only the
 * office name and the person who opened the file. Every technical detail (IP,
 * browser, session, document id, timestamps) stays in the internal audit log.
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
  view: 3,
  preview: 3,
  print: 3,
  download: 2,
  export: 2,
  process: 1,
  share: 50,
};

/** سطرا العلامة المائية: اسم المكتب ثم من فتح الملف. */
export function watermarkLinesFor(
  officeName: string,
  userName: string,
  kind: SecureTokenKind,
): [string, string] {
  const office = officeName.trim() || "مِهلة للمحاماة";
  const user = userName.trim() || "مستخدم غير معروف";
  const prefix = kind === "share" ? "تمت المشاركة بواسطة" : "فتح بواسطة";
  return [office, `${prefix}: ${user}`];
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
