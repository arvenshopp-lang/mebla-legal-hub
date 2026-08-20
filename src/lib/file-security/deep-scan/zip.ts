/**
 * قارئ أرشيف ZIP آمن (بلا مكتبات خارجية).
 *
 * يُستخدم لفحص مستندات OOXML. القراءة محدودة بسقوف صريحة لمنع قنابل الضغط،
 * وتُرفض المدخلات المشفّرة والمسارات الخارجة عن الأرشيف.
 */
import type { ScanFinding } from "./rules";

export const ZIP_LIMITS = {
  maxEntries: 512,
  maxTotalUncompressed: 80 * 1024 * 1024,
  maxEntryUncompressed: 20 * 1024 * 1024,
  maxRatio: 200,
  /** أقصى عدد مدخلات يُفكّ ضغطها فعلياً لفحص نصها. */
  maxInflatedEntries: 64,
  maxInflatedEntryBytes: 4 * 1024 * 1024,
} as const;

export type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  encrypted: boolean;
  localHeaderOffset: number;
};

export type ZipIndex = { entries: ZipEntry[]; findings: ScanFinding[]; malformed: boolean };

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** يقرأ فهرس الأرشيف من الدليل المركزي، ويرصد مخالفات السقوف والمسارات. */
export function indexZip(bytes: Uint8Array): ZipIndex {
  const findings: ScanFinding[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.byteLength - 66_000);
  for (let i = bytes.byteLength - 22; i >= floor; i -= 1) {
    if (u32(view, i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries: [], findings, malformed: true };

  const count = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  if (count > ZIP_LIMITS.maxEntries) {
    findings.push({ rule: "ZIP_ENTRY_LIMIT", severity: "block" });
    return { entries: [], findings, malformed: false };
  }

  const entries: ZipEntry[] = [];
  let totalUncompressed = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.byteLength || u32(view, offset) !== CENTRAL_SIGNATURE) {
      return { entries, findings, malformed: true };
    }
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localHeaderOffset = u32(view, offset + 42);
    const name = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );

    const encrypted = (flags & 0x0001) !== 0;
    if (encrypted) {
      findings.push({ rule: "ZIP_ENCRYPTED_ENTRY", severity: "block", locator: name });
    }
    if (name.startsWith("/") || name.includes("..") || /^[a-z]:/i.test(name)) {
      findings.push({ rule: "ZIP_PATH_TRAVERSAL", severity: "block", locator: name });
    }
    if (/\.(zip|rar|7z|gz|tar|xz|bz2|cab|iso)$/i.test(name)) {
      findings.push({ rule: "ZIP_NESTED_ARCHIVE", severity: "block", locator: name });
    }
    if (uncompressedSize > ZIP_LIMITS.maxEntryUncompressed) {
      findings.push({ rule: "ZIP_EXPANSION_LIMIT", severity: "block", locator: name });
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > ZIP_LIMITS.maxRatio) {
      findings.push({ rule: "ZIP_RATIO_LIMIT", severity: "block", locator: name });
    }
    totalUncompressed += uncompressedSize;

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      encrypted,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (totalUncompressed > ZIP_LIMITS.maxTotalUncompressed) {
    findings.push({ rule: "ZIP_EXPANSION_LIMIT", severity: "block" });
  }
  return { entries, findings, malformed: false };
}

async function inflateRaw(chunk: Uint8Array, limit: number): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([chunk as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
      out.set(part, cursor);
      cursor += part.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * يقرأ محتوى مدخل نصي من الأرشيف. يعيد `null` عند التشفير أو تجاوز الحد أو فشل
 * فك الضغط (يُعامل كملف غير قابل للفحص من طرف المستدعي).
 */
export async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<Uint8Array | null> {
  if (entry.encrypted) return null;
  if (entry.uncompressedSize > ZIP_LIMITS.maxInflatedEntryBytes) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = entry.localHeaderOffset;
  if (start + 30 > bytes.byteLength || u32(view, start) !== LOCAL_SIGNATURE) return null;
  const nameLength = u16(view, start + 26);
  const extraLength = u16(view, start + 28);
  const dataStart = start + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) return null;
  const raw = bytes.subarray(dataStart, dataEnd);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) return null;
  return inflateRaw(raw, ZIP_LIMITS.maxInflatedEntryBytes);
}