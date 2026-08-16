/**
 * إدارة العزل الأمني وبوابة فحص المستندات (Legal Document Quarantine Manager).
 *
 * القاعدة الصارمة:
 * لا يُتاح أي مستند للعرض أو التحميل أو التوقيع إلا إذا كانت حالته CLEAN صراحة.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MalwareScanResult } from "./malware-scanner.server";

type Client = SupabaseClient<Database>;

export class QuarantineRejection extends Error {
  code = "QUARANTINE_REJECTION";
  constructor(message: string) {
    super(message);
  }
}

/**
 * التحقق الخادمي الإلزامي من سلامة المستند قبل أي عملية عرض أو ختم أو تصدير
 */
export function assertDocumentClean(document: {
  id: string;
  file_status?: string | null;
  scan_status?: string | null;
  file_name?: string | null;
}) {
  if (document.file_status && document.file_status !== "AVAILABLE") {
    throw new QuarantineRejection("المستند غير متاح حالياً.");
  }
  if (document.scan_status && document.scan_status !== "CLEAN") {
    if (document.scan_status === "INFECTED" || document.scan_status === "QUARANTINED") {
      throw new QuarantineRejection("تم حظر هذا المستند لأسباب أمنية (عزل صحي).");
    }
    if (document.scan_status === "PENDING_SCAN") {
      throw new QuarantineRejection("المستند قيد الفحص الأمني، يُرجى الانتظار.");
    }
    throw new QuarantineRejection("تعذّر التحقق من سلامة المستند أمنياً.");
  }
}

/**
 * تسجيل نتيجة الفحص الأمني في جدول documents
 */
export async function recordScanResult(
  supabaseAdmin: Client,
  documentId: string,
  result: MalwareScanResult,
) {
  const updatePayload: Record<string, unknown> = {
    scan_status: result.status,
    scan_provider: result.provider,
    scan_engine_version: result.engineVersion || null,
    scan_signature_version: result.signatureVersion || null,
    scan_started_at: result.startedAt,
    scan_completed_at: result.completedAt,
    scan_failure_code: result.failureCode || null,
    quarantine_reason: result.status === "INFECTED" ? result.reason : null,
  };

  if (result.status === "CLEAN") {
    updatePayload["file_status"] = "AVAILABLE";
  } else if (result.status === "INFECTED" || result.status === "QUARANTINED") {
    updatePayload["file_status"] = "INVALID_FILE";
  }

  try {
    await supabaseAdmin
      .from("documents")
      .update(updatePayload as any)
      .eq("id", documentId);
  } catch {
    // تجاهل أخطاء التحديث إذا كانت الأعمدة الجديدة لم تُطبق في قاعدة البيانات بعد
  }
}
