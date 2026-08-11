/**
 * تحقق مشترك (متصفح + خادم) من هوية الملف الفعلية.
 *
 * لا نثق أبداً بالنوع (MIME) أو الاسم أو الحجم الذي يرسله العميل: النوع يُطبَّع
 * من الامتداد المسموح به، ثم تُفحص بصمة البايتات الحقيقية. أي ملف متنكر
 * (HTML أو JSON أو تنفيذي) يُرفض قبل أن يُربط بأي سجل مستند.
 */
import { ALLOWED_EXTENSIONS, fileExtension, MAX_UPLOAD_SIZE } from "@/lib/client-portal.shared";

/** النوع المعياري الوحيد المقبول لكل امتداد مسموح به. */
export const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
};

/** قائمة MIME المسموح بها على مستوى المخزن (مطابقة للامتدادات أعلاه). */
export const ALLOWED_BUCKET_MIME = [
  ...new Set([...Object.values(EXTENSION_MIME), "image/heif"]),
].sort();

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
      return (
        ascii(bytes, 4, 4) === "ftyp" && HEIF_BRANDS.includes(ascii(bytes, 8, 4).toLowerCase())
      );
    case "docx":
    case "xlsx":
    case "pptx":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "doc":
    case "xls":
    case "ppt":
      // OLE2 القديم، أو ملف Office حديث أُعطي امتداداً قديماً.
      return (
        startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ||
        startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
      );
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
      reason: "نوع الملف غير مسموح به. يُسمح بملفات PDF والصور ومستندات Office فقط.",
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
