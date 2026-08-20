/**
 * فحص الصور: التحقق من صحة البنية ورفض المحتوى النشط أو المزروع بعد نهاية الصورة.
 */
import type { ScanFinding } from "./rules";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.byteLength; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

const SCRIPT_PATTERN = /<script|javascript:|<\?php|<svg\b|onerror\s*=/i;

/** يبحث عن سكربتات مزروعة داخل بيانات وصفية أو تعليقات. */
function hasScriptPayload(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder("latin1", { fatal: false });
  const text = decoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 512 * 1024)));
  return SCRIPT_PATTERN.test(text);
}

function scanJpeg(bytes: Uint8Array): ScanFinding[] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return [{ rule: "IMAGE_MALFORMED", severity: "block" }];
  }
  let offset = 2;
  let sawEnd = false;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xd9) {
      sawEnd = true;
      break;
    }
    if (marker === 0xda) {
      // بداية المسح: باقي الملف بيانات مضغوطة حتى EOI في آخر الملف.
      sawEnd = bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9;
      break;
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (length < 2) return [{ rule: "IMAGE_MALFORMED", severity: "block" }];
    offset += 2 + length;
  }
  return sawEnd ? [] : [{ rule: "IMAGE_MALFORMED", severity: "block" }];
}

function scanPng(bytes: Uint8Array): ScanFinding[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let end = -1;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "IEND") {
      end = offset + 12;
      break;
    }
    if (length > bytes.byteLength) return [{ rule: "IMAGE_MALFORMED", severity: "block" }];
    offset += 12 + length;
  }
  if (end < 0) return [{ rule: "IMAGE_MALFORMED", severity: "block" }];
  // بايتات بعد IEND = محتوى مزروع (Polyglot).
  if (end < bytes.byteLength - 4) return [{ rule: "POLYGLOT_CONTENT", severity: "block" }];
  return [];
}

export function scanImage(ext: string, bytes: Uint8Array): ScanFinding[] {
  const findings: ScanFinding[] =
    ext === "png" ? scanPng(bytes) : ext === "jpg" || ext === "jpeg" ? scanJpeg(bytes) : [];
  if (hasScriptPayload(bytes)) {
    findings.push({ rule: "IMAGE_SCRIPT_IN_METADATA", severity: "block" });
  }
  return findings;
}