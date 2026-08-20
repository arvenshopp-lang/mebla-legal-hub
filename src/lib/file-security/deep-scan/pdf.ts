/**
 * فحص PDF عميق (تحليل ثابت على البايتات).
 *
 * لا يُنفَّذ أي محتوى ولا يُفسَّر أي سكربت. القراءة نصية على مستوى الرموز
 * لاكتشاف الطبقات النشطة، مع فك تمويه الأسماء المكتوبة بترميز سداسي.
 */
import type { ScanFinding } from "./rules";

/** يفك تمويه أسماء PDF من نمط `/J#61vaScript` إلى `/JavaScript`. */
function deobfuscateNames(text: string): string {
  return text.replace(/#([0-9a-fA-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

const RULES: { pattern: RegExp; rule: ScanFinding["rule"] }[] = [
  { pattern: /\/JavaScript\b|\/JS\b/, rule: "PDF_JS_ACTION" },
  { pattern: /\/OpenAction\b/, rule: "PDF_OPEN_ACTION" },
  { pattern: /\/AA\b/, rule: "PDF_ANNOTATION_ACTION" },
  { pattern: /\/Launch\b/, rule: "PDF_LAUNCH_ACTION" },
  { pattern: /\/EmbeddedFile\b/, rule: "PDF_EMBEDDED_FILE" },
  { pattern: /\/RichMedia\b|\/Movie\b|\/Sound\b/, rule: "PDF_RICH_MEDIA" },
  { pattern: /\/XFA\b/, rule: "PDF_XFA_FORM" },
  { pattern: /\/GoToR\b|\/GoToE\b/, rule: "PDF_REMOTE_GOTO" },
  { pattern: /\/SubmitForm\b|\/ImportData\b/, rule: "PDF_SUBMIT_FORM" },
];

export type PdfScanResult = {
  findings: ScanFinding[];
  /** مشفّر أو تالف: يُعامل كغير قابل للفحص. */
  unscannable: boolean;
};

export function scanPdf(bytes: Uint8Array): PdfScanResult {
  const findings: ScanFinding[] = [];
  const decoder = new TextDecoder("latin1", { fatal: false });
  const rawText = decoder.decode(bytes);
  const text = deobfuscateNames(rawText);

  if (!rawText.startsWith("%PDF-")) {
    return { findings: [{ rule: "PDF_MALFORMED", severity: "block" }], unscannable: false };
  }
  if (!/\bstartxref\b/.test(rawText) || !/%%EOF/.test(rawText)) {
    findings.push({ rule: "PDF_MALFORMED", severity: "block" });
  }
  if (/\/Encrypt\b/.test(text)) {
    return { findings, unscannable: true };
  }
  if (text !== rawText && /\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile)\b/.test(text)) {
    findings.push({ rule: "PDF_OBFUSCATED_NAME", severity: "block" });
  }

  for (const { pattern, rule } of RULES) {
    if (pattern.test(text)) findings.push({ rule, severity: "block" });
  }
  return { findings, unscannable: false };
}