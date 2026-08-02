/**
 * مهمة إصلاح المستندات (server-only).
 *
 * تعالج آثار فترة الخطأ التي كان فيها العرض والتنزيل يفشلان:
 *  1) تطبيع مسار التخزين المحفوظ (روابط موقّعة قديمة، بادئة المخزن، ترميز URL).
 *  2) إعادة ربط السجل بملفه الحقيقي داخل مجلد المكتب عند اختلاف المسار.
 *  3) التحقق الفعلي: رابط موقّع جديد + جلب البايتات + فحص بصمة الملف،
 *     وتثبيت الحالة (AVAILABLE / FILE_MISSING / INVALID_FILE).
 *  4) إعادة تهيئة مهام المعالجة الفاشلة كي يُستخرج النص من جديد.
 *
 * لا يُعاد أي مسار تخزين أو رابط موقّع إلى المتصفح، ولا يُكتب أي محتوى قانوني
 * في السجلات — فقط رموز أخطاء ومعرّفات تعرّف.
 */
import { extractableKind } from "@/lib/document-ai.shared";
import { readOriginal, StorageReadError } from "@/lib/secure-view/secure-view.server";
import { logFailure } from "@/lib/observability/failure-log.server";
import type { DocumentRepairResult, RepairReport, RepairScope } from "./repair.shared";

const BUCKET = "documents";
/** حد آمن لكل تشغيل: يمنع استهلاك زمن الطلب في مكاتب ضخمة. */
export const MAX_DOCUMENTS_PER_RUN = 60;

type DocRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_status: string;
  storage_verified_at: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** يزيل الروابط الموقّعة القديمة وبادئة المخزن والترميز من المسار المحفوظ. */
export function normalizeStoragePath(raw: string): string {
  let path = (raw ?? "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* يُعامَل كمسار نصي عادي */
    }
  }
  path = path.split("?")[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    /* مسار غير مُرمّز */
  }
  path = path.replace(/^\/+/, "");
  path = path.replace(/^storage\/v1\/object\/(?:sign|public|authenticated)\//, "");
  path = path.replace(new RegExp(`^${BUCKET}/`), "");
  return path.replace(/\/{2,}/g, "/");
}

function isViewerNativeType(contentType: string | null): boolean {
  return /^(application\/pdf|image\/(png|jpeg))(?:;|$)/.test((contentType ?? "").toLowerCase());
}

type ReadAttempt = {
  ok: boolean;
  contentType: string | null;
  errorCode: string | null;
  missing: boolean;
};

/** يحاول قراءة الملف فعلياً من المخزن ويُعيد نتيجة الفحص دون رمي استثناء. */
async function probe(path: string, documentId: string | null): Promise<ReadAttempt> {
  try {
    const { trace } = await readOriginal(path, {
      allowProcessingFormat: true,
      ...(documentId ? { documentId } : {}),
    });
    return { ok: true, contentType: trace.contentType, errorCode: null, missing: false };
  } catch (error) {
    const trace = error instanceof StorageReadError ? error.trace : null;
    const code = trace?.errorCode ?? "STORAGE_READ_FAILED";
    return {
      ok: false,
      contentType: trace?.contentType ?? null,
      errorCode: code,
      missing: code === "HTTP_404" || code === "SIGNED_URL_MISSING" || /not.?found/i.test(code),
    };
  }
}

/** يبحث عن الملف نفسه داخل مجلد المكتب عندما يكون المسار المحفوظ خاطئاً. */
async function findRelinkCandidates(organizationId: string, path: string): Promise<string[]> {
  const db = await admin();
  const fileName = path.split("/").pop() ?? "";
  if (!fileName) return [];
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  const folders = Array.from(new Set([organizationId, path.split("/").slice(0, -1).join("/")].filter(Boolean)));
  const candidates: string[] = [`${organizationId}/${fileName}`];

  for (const folder of folders) {
    const { data } = await db.storage.from(BUCKET).list(folder, { limit: 1000 });
    for (const entry of data ?? []) {
      if (!entry.name || entry.id === null) continue;
      const name = entry.name.toLowerCase();
      if (name === fileName.toLowerCase() || (stem.length >= 8 && name.startsWith(stem))) {
        candidates.push(`${folder}/${entry.name}`);
      }
    }
  }
  return Array.from(new Set(candidates)).filter((candidate) => candidate !== path);
}

async function repairOne(doc: DocRow, organizationId: string): Promise<DocumentRepairResult> {
  const db = await admin();
  const normalized = normalizeStoragePath(doc.file_path);
  let relinked = false;

  if (normalized && normalized !== doc.file_path) {
    await db.from("documents").update({ file_path: normalized }).eq("id", doc.id);
    relinked = true;
  }

  let activePath = normalized || doc.file_path;
  let attempt = activePath ? await probe(activePath, doc.id) : { ok: false, contentType: null, errorCode: "PATH_EMPTY", missing: true };

  if (!attempt.ok) {
    for (const candidate of await findRelinkCandidates(organizationId, activePath)) {
      const retry = await probe(candidate, doc.id);
      if (retry.ok) {
        await db.from("documents").update({ file_path: candidate }).eq("id", doc.id);
        activePath = candidate;
        attempt = retry;
        relinked = true;
        break;
      }
    }
  }

  if (!attempt.ok) {
    const traceRef = await logFailure({
      surface: "document_processing",
      action: "repair.verify",
      error: `تعذّر التحقق من المستند (${attempt.errorCode})`,
      errorCode: attempt.errorCode,
      organizationId,
      documentId: doc.id,
      metadata: { relink_attempted: true },
    });
    return {
      documentId: doc.id,
      fileName: doc.file_name,
      outcome: attempt.missing ? "missing" : "invalid",
      relinked: false,
      viewable: false,
      downloadable: false,
      needsReprocess: false,
      errorCode: attempt.errorCode,
      traceRef,
    };
  }

  const kind = extractableKind(doc.file_name, doc.file_type);
  const { count: pages } = await db
    .from("document_pages")
    .select("id", { count: "exact", head: true })
    .eq("document_id", doc.id);
  const hasText = (pages ?? 0) > 0;
  const nativeView = isViewerNativeType(attempt.contentType);

  return {
    documentId: doc.id,
    fileName: doc.file_name,
    outcome: relinked ? "relinked" : "verified",
    relinked,
    // الصيغ غير القابلة للختم تُعرض من النص المستخرج، فتحتاج فهرسة سليمة.
    viewable: nativeView || hasText,
    downloadable: true,
    needsReprocess: !!kind && (!hasText || relinked),
    errorCode: null,
    traceRef: null,
  };
}

/** يُعيد مهام المعالجة الفاشلة إلى قائمة الانتظار كي يعاد استخراج النص. */
async function requeueJobs(organizationId: string, documentIds: string[]): Promise<number> {
  if (documentIds.length === 0) return 0;
  const db = await admin();
  const { data } = await db
    .from("document_processing_jobs")
    .update({
      status: "queued",
      progress: 0,
      pages_done: 0,
      ocr_pages: 0,
      error_code: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    })
    .eq("organization_id", organizationId)
    .in("document_id", documentIds)
    .select("id");
  return data?.length ?? 0;
}

export type RepairInput = {
  organizationId: string;
  scope?: RepairScope;
  documentIds?: string[];
  limit?: number;
};

/**
 * يفحص المستندات المتعطلة (أو كلها) ويُصلح ما يمكن إصلاحه، ثم يتحقق فعلياً
 * من قابلية العرض والتنزيل لكل ملف.
 */
export async function runDocumentRepair(input: RepairInput): Promise<RepairReport> {
  const db = await admin();
  const limit = Math.min(Math.max(input.limit ?? MAX_DOCUMENTS_PER_RUN, 1), MAX_DOCUMENTS_PER_RUN);
  const scope = input.scope ?? "broken";

  let query = db
    .from("documents")
    .select("id, file_name, file_path, file_type, file_status, storage_verified_at")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (input.documentIds?.length) query = query.in("id", input.documentIds);

  const { data, error } = await query;
  if (error) throw new Error("تعذّر قراءة قائمة المستندات لإجراء الفحص.");
  const all = (data ?? []) as DocRow[];

  let targets = all;
  if (scope === "broken" && !input.documentIds?.length) {
    const { data: failed } = await db
      .from("document_processing_jobs")
      .select("document_id")
      .eq("organization_id", input.organizationId)
      .eq("status", "failed");
    const failedIds = new Set((failed ?? []).map((row: { document_id: string }) => row.document_id));
    targets = all.filter(
      (doc) =>
        doc.file_status !== "AVAILABLE" ||
        !doc.storage_verified_at ||
        failedIds.has(doc.id) ||
        normalizeStoragePath(doc.file_path) !== doc.file_path,
    );
  }
  targets = targets.slice(0, limit);

  const results: DocumentRepairResult[] = [];
  for (const doc of targets) {
    try {
      results.push(await repairOne(doc, input.organizationId));
    } catch (error) {
      const traceRef = await logFailure({
        surface: "document_processing",
        action: "repair.run",
        error,
        organizationId: input.organizationId,
        documentId: doc.id,
      });
      results.push({
        documentId: doc.id,
        fileName: doc.file_name,
        outcome: "invalid",
        relinked: false,
        viewable: false,
        downloadable: false,
        needsReprocess: false,
        errorCode: "REPAIR_FAILED",
        traceRef,
      });
    }
  }

  const requeued = await requeueJobs(
    input.organizationId,
    results.filter((r) => r.needsReprocess).map((r) => r.documentId),
  );

  return {
    scanned: results.length,
    verified: results.filter((r) => r.outcome === "verified").length,
    relinked: results.filter((r) => r.outcome === "relinked").length,
    missing: results.filter((r) => r.outcome === "missing").length,
    invalid: results.filter((r) => r.outcome === "invalid").length,
    requeued,
    results,
  };
}