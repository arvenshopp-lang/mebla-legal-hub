/**
 * مسار الإدخال الموحّد للمستندات (server-only).
 *
 * القاعدة: العميل يرفع البايتات فقط عبر رابط رفع موقّع، ثم الخادم — بمفتاح
 * الخدمة — يتحقق من المسار المملوك والحجم والنوع وبصمة البايتات قبل أن يُربط أي
 * كائن بسجل في جدول documents. عند الفشل يُنظّف الكائن اليتيم فوراً.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_UPLOAD_SIZE } from "@/lib/client-portal.shared";
import { normalizedMime, verifyFileBytes, type VerifiedFile } from "./file-signature";

export const DOCUMENTS_BUCKET = "documents";

/** الأدوار المسموح لها بإضافة مستندات داخل المكتب (مطابقة لسياسة الرفع). */
const WRITE_ROLES = ["owner", "admin", "lawyer", "legal_assistant"] as const;

type Client = SupabaseClient<Database>;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** يتحقق من العضوية النشطة والدور، عبر عميل المستخدم نفسه (RLS). */
export async function requireDocumentWriteRole(
  supabase: Client,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new Error("لا تملك وصولاً إلى هذا المكتب.");
  if (!(WRITE_ROLES as readonly string[]).includes(data.role)) {
    throw new Error("لا تملك صلاحية «رفع المستندات» داخل هذا المكتب.");
  }
  return data.role;
}

/** يرفض أي مسار خارج المجلد المملوك للمكتب/الطلب. */
export function assertOwnedPath(path: string, prefix: string) {
  const clean = (path ?? "").trim();
  if (!clean || clean.length > 400) throw new Error("مسار ملف غير صالح.");
  if (clean.includes("..") || clean.includes("//") || clean.startsWith("/")) {
    throw new Error("مسار ملف غير صالح.");
  }
  if (!clean.startsWith(prefix)) throw new Error("مسار ملف غير صالح.");
  return clean;
}

/** ينشئ فتحة رفع موقّعة داخل مجلد المكتب فقط. */
export async function createUploadSlot(prefix: string, fileName: string) {
  const mime = normalizedMime(fileName);
  if (!mime) {
    throw new Error("نوع الملف غير مسموح به. يُسمح بملفات PDF والصور ومستندات Office فقط.");
  }
  const ext = fileName.toLowerCase().split(".").pop()!;
  const path = `${prefix}${crypto.randomUUID()}.${ext}`;
  const db = await admin();
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("تعذّر تجهيز الرفع، حاول مرة أخرى.");
  return { path, uploadToken: data.token, contentType: mime };
}

/** يحذف الكائن اليتيم بعد فشل التحقق (لا يمس أي سجل قائم). */
export async function removeOrphanObject(path: string) {
  try {
    const db = await admin();
    await db.storage.from(DOCUMENTS_BUCKET).remove([path]);
  } catch {
    /* التنظيف أفضل-جهد؛ لا يجوز أن يُخفي سبب الرفض الأصلي */
  }
}

export class IntakeRejection extends Error {}

/**
 * يتحقق من الكائن المرفوع فعلياً: ملكية المسار، وجود الملف، الحجم، النوع
 * المعياري، وبصمة البايتات. عند أي فشل يُحذف الكائن ويُرفع خطأ عربي واضح.
 */
export async function verifyUploadedObject(input: {
  path: string;
  prefix: string;
  fileName: string;
}): Promise<VerifiedFile & { path: string }> {
  const path = assertOwnedPath(input.path, input.prefix);
  const db = await admin();
  const { data: blob, error } = await db.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !blob) {
    throw new IntakeRejection("تعذّر التحقق من الملف المرفوع. أعد المحاولة.");
  }
  if (blob.size > MAX_UPLOAD_SIZE) {
    await removeOrphanObject(path);
    throw new IntakeRejection("حجم الملف يتجاوز 20 ميجابايت.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const verdict = verifyFileBytes(input.fileName, bytes);
  if (!verdict.ok) {
    await removeOrphanObject(path);
    throw new IntakeRejection(verdict.reason);
  }
  return { ...verdict.file, path };
}
