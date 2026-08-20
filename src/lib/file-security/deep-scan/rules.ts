/**
 * معرّفات قواعد الفحص العميق ورسائل المستخدم.
 *
 * معرّف القاعدة داخلي ويُسجَّل في السجل الأمني فقط؛ المستخدم يرى رسالة عربية
 * عامة بلا أي تفاصيل تكشف منطق الفحص.
 */

export type ScanRuleId =
  /* PDF */
  | "PDF_JS_ACTION"
  | "PDF_OPEN_ACTION"
  | "PDF_ANNOTATION_ACTION"
  | "PDF_LAUNCH_ACTION"
  | "PDF_EMBEDDED_FILE"
  | "PDF_RICH_MEDIA"
  | "PDF_XFA_FORM"
  | "PDF_REMOTE_GOTO"
  | "PDF_SUBMIT_FORM"
  | "PDF_OBFUSCATED_NAME"
  | "PDF_ENCRYPTED"
  | "PDF_MALFORMED"
  /* OOXML */
  | "OOXML_MACRO"
  | "OOXML_OLE_OBJECT"
  | "OOXML_EXTERNAL_TEMPLATE"
  | "OOXML_EXTERNAL_RELATIONSHIP"
  | "OOXML_DDE_FIELD"
  | "OOXML_ACTIVEX"
  | "OOXML_MALFORMED"
  /* ZIP */
  | "ZIP_ENTRY_LIMIT"
  | "ZIP_EXPANSION_LIMIT"
  | "ZIP_RATIO_LIMIT"
  | "ZIP_ENCRYPTED_ENTRY"
  | "ZIP_PATH_TRAVERSAL"
  | "ZIP_NESTED_ARCHIVE"
  /* صور */
  | "IMAGE_MALFORMED"
  | "IMAGE_SCRIPT_IN_METADATA"
  /* عام */
  | "POLYGLOT_CONTENT"
  | "EXECUTABLE_CONTENT"
  | "SCRIPT_CONTENT"
  | "SCAN_SIZE_EXCEEDED"
  | "SCAN_ENGINE_ERROR";

/** خطورة القاعدة: `block` يمنع الملف نهائياً، `notice` يُسجَّل فقط. */
export type ScanSeverity = "block" | "notice";

export type ScanFinding = {
  rule: ScanRuleId;
  severity: ScanSeverity;
  /** موضع الاكتشاف داخل الملف (اسم مدخل الأرشيف أو القسم) — للتدقيق فقط. */
  locator?: string;
};

/** إصدار المحرك: يُسجَّل مع كل قرار حتى يبقى القرار قابلاً للتفسير لاحقاً. */
export const SCAN_ENGINE_VERSION = "mehla-deep-scan-1";

/** رسالة الرفض الموحّدة للمستخدم. */
export const SCAN_REJECTED_MESSAGE =
  "تم رفض هذا الملف لأسباب أمنية: يحتوي على محتوى نشط أو بنية غير مطابقة لسياسة أمن المستندات.";

/** رسالة الملف الذي تعذّر فحصه (مشفّر أو تالف أو أكبر من حدود الفحص). */
export const SCAN_UNSCANNABLE_MESSAGE =
  "تعذّر فحص هذا الملف أمنياً (ملف محمي أو تالف أو أكبر من الحد المسموح)، ولم يُقبل.";

export function blocking(findings: readonly ScanFinding[]): ScanFinding[] {
  return findings.filter((finding) => finding.severity === "block");
}