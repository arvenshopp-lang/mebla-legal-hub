/**
 * تحقق مشترك (متصفح + خادم) من هوية الملف الفعلية.
 *
 * لا نثق أبداً بالنوع (MIME) أو الاسم أو الحجم الذي يرسله العميل: النوع يُطبَّع
 * من الامتداد المسموح به، ثم تُفحص بصمة البايتات الحقيقية. أي ملف متنكر
 * (HTML أو JSON أو تنفيذي) يُرفض قبل أن يُربط بأي سجل مستند.
 */
import {
  ALLOWED_EXTENSIONS,
  fileExtension,
  MAX_UPLOAD_SIZE,
  UNSUPPORTED_FORMAT_MESSAGE,
} from "@/lib/client-portal.shared";

/** النوع المعياري الوحيد المقبول لكل امتداد مسموح به. */
export const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
};

/** قائمة MIME المسموح بها على مستوى المخزن (مطابقة للامتدادات أعلاه). */
export const ALLOWED_BUCKET_MIME = [...new Set(Object.values(EXTENSION_MIME))].sort();

/** الأنواع التي يفتحها محرك الختم مباشرة (PDF أو صورة قابلة للإدراج). */
export const VIEWER_NATIVE_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

/** هل يمكن ختم هذا النوع مباشرة كصفحة PDF أو صورة؟ */
export function isViewerNativeMime(mime: string | null | undefined): boolean {
  return /^(application\/pdf|image\/(png|jpeg))(?:\s*;|$)/.test((mime ?? "").trim().toLowerCase());
}

/**
 * هل النوع داخل عقد الصيغ المسموح بها؟ الصيغ المسموح بها وغير القابلة للختم
 * المباشر تُعرض عبر تمثيل نصي مائي، ولا تُعد ملفاً غير صالح.
 */
export function isAllowedDocumentMime(mime: string | null | undefined): boolean {
  const value = (mime ?? "").trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (!value) return false;
  return ALLOWED_BUCKET_MIME.includes(value) || value === "application/csv";
}

/**
 * النوع المعياري من الامتداد. بعض المتصفحات (خاصة على iOS) ترسل MIME فارغاً أو
 * خاطئاً، فنُطبّع بدل توسيع قائمة المخزن بشكل خطير.
 */
export function normalizedMime(fileName: string): string | null {
  const ext = fileExtension(fileName);
  if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return null;
  return EXTENSION_MIME[ext] ?? null;
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder("latin1").decode(bytes.slice(start, start + length));
}

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis", "avif"];

/* ------------------------------ OOXML (ZIP) ------------------------------ *
 * أول أربعة بايتات PK تعني «أرشيف ZIP» فقط، وليست إثباتاً على مستند Office.
 * لذلك نقرأ فهرس الأرشيف ونطلب الأجزاء الداخلية المطابقة للامتداد المُعلن،
 * فيُرفض أي ZIP عشوائي أو متنكر (مثل ملف مضغوط يحوي تنفيذياً).
 * ------------------------------------------------------------------------ */

/** الجزء الداخلي الإلزامي لكل عائلة OOXML. */
const OOXML_REQUIRED_PART: Record<string, string> = {
  docx: "word/document.xml",
};

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) |
      ((bytes[at + 1] ?? 0) << 8) |
      ((bytes[at + 2] ?? 0) << 16) |
      ((bytes[at + 3] ?? 0) << 24)) >>>
    0
  );
}

/**
 * أسماء المدخلات داخل أرشيف ZIP، من الفهرس المركزي (Central Directory) عند
 * توفره، وإلا من ترويسات المدخلات المحلية. دالة قراءة فقط بلا فك ضغط.
 */
export function zipEntryNames(bytes: Uint8Array, limit = 400): string[] {
  const names: string[] = [];
  // البحث عن ترويسة نهاية الفهرس المركزي من آخر الملف (التعليق ≤ 65535).
  const min = Math.max(0, bytes.byteLength - (22 + 65535));
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= min; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd >= 0) {
    const count = u16(bytes, eocd + 10);
    let at = u32(bytes, eocd + 16);
    for (let n = 0; n < Math.min(count, limit); n += 1) {
      if (at + 46 > bytes.byteLength || u32(bytes, at) !== 0x02014b50) break;
      const nameLen = u16(bytes, at + 28);
      names.push(ascii(bytes, at + 46, nameLen));
      at += 46 + nameLen + u16(bytes, at + 30) + u16(bytes, at + 32);
    }
    if (names.length) return names;
  }
  // احتياط: مسح ترويسات المدخلات المحلية عند تلف/غياب الفهرس المركزي.
  for (let at = 0; at + 30 <= bytes.byteLength && names.length < limit; ) {
    if (u32(bytes, at) !== 0x04034b50) break;
    const nameLen = u16(bytes, at + 26);
    names.push(ascii(bytes, at + 30, nameLen));
    const compressed = u32(bytes, at + 18);
    if (compressed === 0 || compressed === 0xffffffff) break; // Data Descriptor / ZIP64
    at += 30 + nameLen + u16(bytes, at + 28) + compressed;
  }
  return names;
}

function isZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

/** بنية OOXML الداخلية تطابق الامتداد المُعلن؟ (يعمل في المتصفح والخادم معاً) */
export function isOoxmlForExtension(bytes: Uint8Array, ext: string): boolean {
  const required = OOXML_REQUIRED_PART[ext];
  if (!required || !isZip(bytes)) return false;
  const names = zipEntryNames(bytes).map((n) => n.replace(/^\/+/, "").toLowerCase());
  if (!names.includes("[content_types].xml")) return false;
  return names.includes(required);
}

/** يرفض الصفحات والبيانات النصية المتنكرة في هيئة مستند. */
export function looksLikeMarkupOrJson(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<?xml") ||
    head.startsWith("<svg") ||
    head.startsWith("{") ||
    head.startsWith("[")
  );
}

/** بصمة البايتات تطابق الامتداد المُعلن؟ */
export function signatureMatchesExtension(bytes: Uint8Array, ext: string): boolean {
  switch (ext) {
    case "pdf":
      return ascii(bytes, 0, 5) === "%PDF-";
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "heic":
    case "heif":
      return (
        ascii(bytes, 4, 4) === "ftyp" && HEIF_BRANDS.includes(ascii(bytes, 8, 4).toLowerCase())
      );
    case "docx":
      return isOoxmlForExtension(bytes, ext);
    case "txt":
    case "csv":
      // لا بصمة للنص: يُشترط ألا يكون ثنائياً ولا صفحة/بيانات متنكرة.
      return !bytes.slice(0, 512).includes(0x00) && !looksLikeMarkupOrJson(bytes);
    default:
      return false;
  }
}

export type VerifiedFile = { mime: string; ext: string; size: number };

/**
 * التحقق الكامل للبايتات الفعلية بعد الرفع (خادمي).
 * يعيد رسالة عربية واضحة عند الرفض، أو النوع المعياري عند القبول.
 */
export function verifyFileBytes(
  fileName: string,
  bytes: Uint8Array,
): { ok: true; file: VerifiedFile } | { ok: false; reason: string } {
  const ext = fileExtension(fileName);
  const mime = normalizedMime(fileName);
  if (!ext || !mime) {
    return {
      ok: false,
      reason: UNSUPPORTED_FORMAT_MESSAGE,
    };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: "الملف فارغ." };
  if (bytes.byteLength > MAX_UPLOAD_SIZE) {
    return { ok: false, reason: "حجم الملف يتجاوز 20 ميجابايت." };
  }
  if (ext !== "txt" && ext !== "csv" && looksLikeMarkupOrJson(bytes)) {
    return { ok: false, reason: "محتوى الملف لا يطابق نوعه المُعلن، وتم رفضه لأسباب أمنية." };
  }
  if (!signatureMatchesExtension(bytes, ext)) {
    return { ok: false, reason: "محتوى الملف لا يطابق نوعه المُعلن، وتم رفضه لأسباب أمنية." };
  }
  return { ok: true, file: { mime, ext, size: bytes.byteLength } };
}
