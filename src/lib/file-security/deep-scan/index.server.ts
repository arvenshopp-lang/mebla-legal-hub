/**
 * محرك الفحص العميق الموحّد (داخلي بالكامل — لا تُخرج أي بايتات من المنصة).
 *
 * يُستدعى مرة واحدة عند إدخال أي ملف، من رفع المكتب أو من رابط العميل المؤقت،
 * قبل ربط الكائن بأي سجل مستند. القرار: `clean` أو `malicious` أو `unscannable`.
 */
import { scanImage } from "./image";
import { scanOoxml } from "./ooxml";
import { scanPdf } from "./pdf";
import type { ScanFinding } from "./rules";
import { blocking, SCAN_ENGINE_VERSION } from "./rules";

/** سقف حجم الفحص العميق داخل الطلب. ما يتجاوزه يُعامل كغير قابل للفحص. */
export const DEEP_SCAN_MAX_BYTES = 20 * 1024 * 1024;

export type ScanVerdict = "clean" | "malicious" | "unscannable";

export type DeepScanResult = {
  verdict: ScanVerdict;
  findings: ScanFinding[];
  engineVersion: string;
};

/** بصمات ملفات تنفيذية أو أرشيفية لا يجوز قبولها تحت أي امتداد. */
const EXECUTABLE_SIGNATURES: { bytes: number[]; label: string }[] = [
  { bytes: [0x4d, 0x5a], label: "pe" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: "elf" },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: "macho" },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "ole-compound" },
  { bytes: [0x52, 0x61, 0x72, 0x21], label: "rar" },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf], label: "7z" },
];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

const SCRIPT_HEAD = /^\s*(#!|<\?php|<%|<script|@echo\b|powershell\b|MZ)/i;

/** قواعد عامة تُطبَّق على كل الصيغ قبل الفحص الخاص بالصيغة. */
function scanCommon(ext: string, bytes: Uint8Array): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const signature of EXECUTABLE_SIGNATURES) {
    if (startsWith(bytes, signature.bytes)) {
      findings.push({
        rule: "EXECUTABLE_CONTENT",
        severity: "block",
        locator: signature.label,
      });
    }
  }
  if (ext === "txt" || ext === "csv") {
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024));
    if (SCRIPT_HEAD.test(head)) findings.push({ rule: "SCRIPT_CONTENT", severity: "block" });
    // صيغة CSV القابلة للتنفيذ في جداول المكتب (CSV Injection).
    if (/(^|[\r\n])\s*[=+\-@]\s*(cmd|DDE|HYPERLINK|IMPORT)/i.test(head)) {
      findings.push({ rule: "SCRIPT_CONTENT", severity: "block", locator: "csv_formula" });
    }
  }
  return findings;
}

/** الفحص العميق الكامل لبايتات ملف تم التحقق من بصمته البنيوية مسبقاً. */
export async function deepScanBytes(ext: string, bytes: Uint8Array): Promise<DeepScanResult> {
  const engineVersion = SCAN_ENGINE_VERSION;
  if (bytes.byteLength > DEEP_SCAN_MAX_BYTES) {
    return {
      verdict: "unscannable",
      findings: [{ rule: "SCAN_SIZE_EXCEEDED", severity: "block" }],
      engineVersion,
    };
  }

  try {
    const findings = scanCommon(ext, bytes);
    let unscannable = false;

    if (ext === "pdf") {
      const result = scanPdf(bytes);
      findings.push(...result.findings);
      unscannable = unscannable || result.unscannable;
    } else if (ext === "docx") {
      const result = await scanOoxml(bytes);
      findings.push(...result.findings);
      unscannable = unscannable || result.unscannable;
    } else if (["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(ext)) {
      findings.push(...scanImage(ext, bytes));
    }

    if (blocking(findings).length > 0) return { verdict: "malicious", findings, engineVersion };
    if (unscannable) return { verdict: "unscannable", findings, engineVersion };
    return { verdict: "clean", findings, engineVersion };
  } catch {
    // فشل المحرك = لا قرار = لا قبول (Fail-Closed).
    return {
      verdict: "unscannable",
      findings: [{ rule: "SCAN_ENGINE_ERROR", severity: "block" }],
      engineVersion,
    };
  }
}