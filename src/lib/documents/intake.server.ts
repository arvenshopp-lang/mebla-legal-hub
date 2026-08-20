/**
 * مسار الإدخال الموحّد للمستندات (server-only).
 *
 * القاعدة: العميل يرفع البايتات فقط عبر رابط رفع موقّع، ثم الخادم — بمفتاح
 * الخدمة — يتحقق من المسار المملوك والحجم والنوع وبصمة البايتات قبل أن يُربط أي
 * كائن بسجل في جدول documents. عند الفشل يُنظّف الكائن اليتيم فوراً.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_UPLOAD_SIZE, UNSUPPORTED_FORMAT_MESSAGE } from "@/lib/client-portal.shared";
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
    throw new Error(UNSUPPORTED_FORMAT_MESSAGE);
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
    // النسخة الآمنة تُحذف مع الأصل دائماً حتى لا تبقى بايتات بلا سجل.
    await db.storage.from(DOCUMENTS_BUCKET).remove([path, `${path}.safe.pdf`]);
  } catch {
    /* التنظيف أفضل-جهد؛ لا يجوز أن يُخفي سبب الرفض الأصلي */
  }
}

export class IntakeRejection extends Error {}

/** رمز خطأ Postgres لتعارض الفهرس الفريد (مسار رفع مُستخدم مسبقاً). */
export const UNIQUE_VIOLATION = "23505";

export function isDuplicatePathError(error: { code?: string | null } | null): boolean {
  return (error?.code ?? "") === UNIQUE_VIOLATION;
}

/**
 * يمنع إعادة استخدام مسار رفع ناجح لإنشاء سجل مستند إضافي (replay). الفحص هنا
 * سريع وواضح الرسالة، والفهرس الفريد على documents.file_path هو الضمان النهائي
 * ضد التسابق.
 */
export async function assertPathNotLinked(path: string) {
  const db = await admin();
  const { data, error } = await db
    .from("documents")
    .select("id")
    .eq("file_path", path)
    .limit(1)
    .maybeSingle();
  if (error) throw new IntakeRejection("تعذّر التحقق من الملف المرفوع. أعد المحاولة.");
  if (data) throw new IntakeRejection("هذا الملف مرتبط بمستند مسجّل مسبقاً.");
}

/**
 * يتحقق — عبر عميل المستخدم (RLS) — أن القضية والعميل الممرَّرين ينتميان لنفس
 * المكتب. يمنع الربط المتقاطع بين المكاتب قبل أي insert.
 */
export async function assertCaseAndClientInOrg(
  supabase: Client,
  organizationId: string,
  caseId: string | null,
  clientId: string | null,
) {
  if (caseId) {
    const { data, error } = await supabase
      .from("cases")
      .select("id")
      .eq("id", caseId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) throw new IntakeRejection("القضية المحددة لا تنتمي إلى هذا المكتب.");
  }
  if (clientId) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) throw new IntakeRejection("العميل المحدد لا ينتمي إلى هذا المكتب.");
  }
}

/**
 * يتحقق من الكائن المرفوع فعلياً: ملكية المسار، وجود الملف، الحجم، النوع
 * المعياري، وبصمة البايتات. عند أي فشل يُحذف الكائن ويُرفع خطأ عربي واضح.
 */
export type IntakeScanOutcome = {
  engineVersion: string;
  findings: { rule: string; severity: string; locator?: string }[];
  safePath: string | null;
  safeSha256: string | null;
  safeMime: string | null;
};

export async function verifyUploadedObject(input: {
  path: string;
  prefix: string;
  fileName: string;
}): Promise<VerifiedFile & { path: string; sha256: string; scan: IntakeScanOutcome }> {
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
  const { sha256Hex, logSecurityEvent } = await import(
    "@/lib/file-security/security-state.server"
  );
  const sha256 = await sha256Hex(bytes);

  // الفحص العميق داخل الطلب: أي ملف لا يخرج بقرار «سليم» لا يُقبل مطلقاً.
  const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
  const { deepScanBytes } = await import("@/lib/file-security/deep-scan/index.server");
  const { SCAN_REJECTED_MESSAGE, SCAN_UNSCANNABLE_MESSAGE } = await import(
    "@/lib/file-security/deep-scan/rules"
  );
  const scan = await deepScanBytes(ext, bytes);
  if (scan.verdict !== "clean") {
    await removeOrphanObject(path);
    await logSecurityEvent({
      action: "deep_scan",
      result: "denied",
      reason: scan.verdict,
      sha256,
      metadata: {
        engine_version: scan.engineVersion,
        findings: scan.findings,
        file_extension: ext,
      },
    });
    throw new IntakeRejection(
      scan.verdict === "malicious" ? SCAN_REJECTED_MESSAGE : SCAN_UNSCANNABLE_MESSAGE,
    );
  }

  // نسخة عرض آمنة مسطّحة: هي وحدها ما يُسلَّم لمسارات العرض والطباعة والمشاركة.
  const { buildSafeRender, safeRenderPath } = await import("@/lib/file-security/sanitize.server");
  let safePath: string | null = null;
  let safeSha256: string | null = null;
  let safeMime: string | null = null;
  const safe = await buildSafeRender(ext, bytes);
  if (safe) {
    safePath = safeRenderPath(path);
    const { error: safeError } = await db.storage
      .from(DOCUMENTS_BUCKET)
      .upload(safePath, safe.bytes as unknown as ArrayBuffer, {
        contentType: safe.mime,
        upsert: true,
      });
    if (safeError) {
      await removeOrphanObject(path);
      throw new IntakeRejection("تعذّر تجهيز النسخة الآمنة من الملف، ولم يُقبل الملف.");
    }
    safeSha256 = await sha256Hex(safe.bytes);
    safeMime = safe.mime;
  }

  return {
    ...verdict.file,
    path,
    sha256,
    scan: {
      engineVersion: scan.engineVersion,
      findings: scan.findings,
      safePath,
      safeSha256,
      safeMime,
    },
  };
}

/** الأدوار التي تحذف أي مستند داخل المكتب. */
const DELETE_ANY_ROLES = ["owner", "admin"] as const;
/** الأدوار التي تحذف مستنداتها التي رفعتها بنفسها فقط. */
const DELETE_OWN_ROLES = ["lawyer", "legal_assistant"] as const;

/**
 * يتحقق من صلاحية حذف مستند معيّن، بنفس قاعدة الصلاحيات المعتمدة سابقاً:
 * المالك والمدير يحذفان أي مستند، والمحامي/المساعد يحذف ما رفعه بنفسه.
 * القراءة تجري بعميل المستخدم (RLS) قبل أي عملية بمفتاح الخدمة.
 */
export async function requireDocumentDeletePermission(
  supabase: Client,
  userId: string,
  documentId: string,
) {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, organization_id, file_name, file_path, uploaded_by")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) throw new IntakeRejection("المستند غير موجود.");

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", doc.organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError || !member) throw new IntakeRejection("لا تملك وصولاً إلى هذا المكتب.");

  const role = member.role as string;
  const canDeleteAny = (DELETE_ANY_ROLES as readonly string[]).includes(role);
  const canDeleteOwn =
    (DELETE_OWN_ROLES as readonly string[]).includes(role) && doc.uploaded_by === userId;
  if (!canDeleteAny && !canDeleteOwn) {
    throw new IntakeRejection("لا تملك صلاحية حذف هذا المستند.");
  }

  assertOwnedPath(doc.file_path, `${doc.organization_id}/`);
  return doc;
}

/**
 * يزيل كائن التخزين أولاً ثم الصف. لا يُحذف الصف أبداً إذا بقي الكائن، لتجنّب
 * كائنات يتيمة أو سجلات معلّقة بلا ملف.
 */
export async function purgeDocument(doc: { id: string; file_path: string }) {
  const db = await admin();
  const { data: removed, error: removeError } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .remove([doc.file_path, `${doc.file_path}.safe.pdf`]);
  if (removeError) throw new Error("تعذّر إزالة ملف المستند من المخزن، لم يُحذف شيء.");
  // كائن مفقود مسبقاً: الحذف يكمل لتنظيف السجل المعلّق.
  if (!removed || removed.length === 0) {
    const { data: still } = await db.storage
      .from(DOCUMENTS_BUCKET)
      .list(doc.file_path.split("/").slice(0, -1).join("/"), {
        search: doc.file_path.split("/").pop()!,
        limit: 1,
      });
    if (still && still.length > 0) {
      throw new Error("تعذّر إزالة ملف المستند من المخزن، لم يُحذف شيء.");
    }
  }
  const { error } = await db.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error("تعذّر حذف سجل المستند بعد إزالة الملف.");
}
