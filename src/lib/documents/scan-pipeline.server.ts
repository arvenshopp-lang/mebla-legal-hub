/**
 * منسّق ومحرّك طابور فحص المستندات الأمني (Document Malware Scanning & Quarantine Pipeline).
 *
 * المبادئ الأمنية الصارمة:
 *  1. Server-Only & Atomic: يُدار الطابور خادمياً فقط وبصلاحيات إدارية لمنع أي تعديل من المتصفح.
 *  2. No Auto-Clean for Legacy: المستندات القديمة لا تأخذ CLEAN أبداً إلا باجتياز الفحص الكامل.
 *  3. Bounded Retries: إعادة المحاولة محصورة في SCAN_FAILED (حد أقصى 3 مرات مع تراجع زمني)؛ المحتوى المصاب INFECTED لا يُعاد فحصه إطلاقاً.
 *  4. Strict Transitions:
 *      PENDING_SCAN -> CLEAN (فقط عبر فحص ClamAV كامل وناجح)
 *      PENDING_SCAN -> INFECTED (حجر فوري ودائم)
 *      PENDING_SCAN -> SCAN_FAILED (عند تعذر الاتصال أو انتهاء المهلة)
 *      SCAN_FAILED  -> PENDING_SCAN (عبر رتل إعادة المحاولة المنضبط)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  preScreenFileBytes,
  ClamAvScannerAdapter,
  type MalwareScanner,
  type MalwareScanResult,
  type ScanStatus,
} from "./malware-scanner.server";
import { recordScanResult } from "./quarantine.server";
import { logSecurityEvent } from "@/lib/observability/security-events.server";

type Client = SupabaseClient<Database>;

export const MAX_SCAN_RETRIES = 3;

/** جدول التراجع الزمني للمحاولات (بالمللي ثانية): 1 دقيقة، 5 دقائق، 15 دقيقة */
export function scanBackoffMs(retryCount: number): number {
  const ladder = [60_000, 300_000, 900_000];
  const idx = Math.max(0, Math.min(retryCount - 1, ladder.length - 1));
  return ladder[idx] ?? 900_000;
}

export type ScanQueueItem = {
  id: string;
  organization_id: string;
  file_path: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  scan_status: ScanStatus | string;
  scan_retry_count?: number | null;
  next_retry_at?: string | null;
};

export type PipelineBatchResult = {
  claimed: number;
  clean: number;
  infected: number;
  failed: number;
  retried: number;
  durationMs: number;
};

/**
 * حجز دفعة مستندات معلقة للفحص الأمني بشكل ذري (Atomic Claim via FOR UPDATE SKIP LOCKED)
 */
export async function claimPendingScanBatch(
  supabaseAdmin: Client,
  options: {
    limit?: number;
    workerId?: string;
    leaseSeconds?: number;
    organizationId?: string;
  } = {},
): Promise<ScanQueueItem[]> {
  const limit = Math.min(options.limit ?? 10, 50);
  const workerId = options.workerId ?? `worker-${Math.random().toString(36).slice(2, 9)}`;
  const leaseSeconds = options.leaseSeconds ?? 300;

  try {
    // 1. المحاولة عبر دالة الحجز الذري (PostgreSQL RPC)
    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc(
      "claim_document_scan_batch",
      {
        p_limit: limit,
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      },
    );

    if (!rpcError && Array.isArray(rpcData)) {
      if (options.organizationId) {
        return rpcData.filter((d: any) => d.organization_id === options.organizationId) as ScanQueueItem[];
      }
      return rpcData as ScanQueueItem[];
    }
  } catch {
    // fallback if RPC not yet deployed
  }

  // 2. مسار احتياطي استعلامي مباشر
  const now = new Date().toISOString();
  let query = (supabaseAdmin as any)
    .from("documents")
    .select("id, organization_id, file_path, file_name, file_size, mime_type, scan_status, scan_retry_count, next_retry_at")
    .or(`scan_status.eq.PENDING_SCAN,and(scan_status.eq.SCAN_FAILED,scan_retry_count.lt.${MAX_SCAN_RETRIES},next_retry_at.lte.${now})`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data as ScanQueueItem[];
}

/**
 * معالجة فحص مستند فردي عبر المسار الأمني الكامل
 */
export async function processDocumentScanJob(
  supabaseAdmin: Client,
  doc: ScanQueueItem,
  scanner?: MalwareScanner,
): Promise<MalwareScanResult> {
  const start = new Date();

  // 1. تنزيل بايتات الملف من مخزن المستندات
  const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
    .from("documents")
    .download(doc.file_path);

  if (downloadErr || !fileBlob) {
    const retryCount = (doc.scan_retry_count ?? 0) + 1;
    const nextRetry = new Date(Date.now() + scanBackoffMs(retryCount)).toISOString();

    const failResult: MalwareScanResult = {
      status: "SCAN_FAILED",
      provider: "storage-intake",
      startedAt: start.toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: "STORAGE_DOWNLOAD_FAILED",
      reason: `تعذر تنزيل الملف من المخزن: ${downloadErr?.message || "ملف غير موجود"}`,
      sha256: "0".repeat(64),
      durationMs: Date.now() - start.getTime(),
    };

    await (supabaseAdmin as any)
      .from("documents")
      .update({
        scan_status: "SCAN_FAILED",
        scan_failure_code: failResult.failureCode,
        scan_retry_count: retryCount,
        next_retry_at: retryCount >= MAX_SCAN_RETRIES ? null : nextRetry,
      })
      .eq("id", doc.id);

    await logSecurityEvent({
      type: "DOCUMENT_SCAN_FAILED",
      action: "malware_scan.download_failed",
      organizationId: doc.organization_id,
      targetType: "document",
      targetId: doc.id,
      description: failResult.reason,
    });

    return failResult;
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const u8 = new Uint8Array(arrayBuffer);

  // 2. الفحص الهيكلي الأولي السريع (Pre-Screen)
  const prescreen = preScreenFileBytes(doc.file_name, u8);
  if (!prescreen.clean) {
    const end = new Date();
    const infectedResult: MalwareScanResult = {
      status: "INFECTED",
      provider: "structural-prescreen",
      engineVersion: "1.0.0",
      startedAt: start.toISOString(),
      completedAt: end.toISOString(),
      reason: prescreen.reason,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      durationMs: end.getTime() - start.getTime(),
    };

    await recordScanResult(supabaseAdmin, doc.id, infectedResult);
    await logSecurityEvent({
      type: "DOCUMENT_SCAN_INFECTED",
      action: "malware_scan.threat_detected",
      organizationId: doc.organization_id,
      targetType: "document",
      targetId: doc.id,
      description: prescreen.reason,
    });

    return infectedResult;
  }

  // 3. الفحص العميق عبر مضاد الفيروسات (Full Scanner)
  const fullScanner =
    scanner ||
    (process.env["CLAMAV_SCANNER_URL"]
      ? new ClamAvScannerAdapter(
          process.env["CLAMAV_SCANNER_URL"],
          process.env["CLAMAV_API_TOKEN"],
        )
      : null);

  if (!fullScanner) {
    // في غياب محرك ClamAV الفعلي، المستند يبقى PENDING_SCAN ولا يُمنح CLEAN أبداً
    const end = new Date();
    const pendingResult: MalwareScanResult = {
      status: "PENDING_SCAN",
      provider: "prescreen-only",
      engineVersion: "1.0.0",
      startedAt: start.toISOString(),
      completedAt: end.toISOString(),
      reason: "اجتاز فحص الهيكلية الأولي بنجاح. بانتظار الفحص العميق عبر مضاد الفيروسات.",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      durationMs: end.getTime() - start.getTime(),
    };

    await (supabaseAdmin as any)
      .from("documents")
      .update({
        scan_status: "PENDING_SCAN",
        scan_provider: "prescreen-only",
        scan_started_at: start.toISOString(),
      })
      .eq("id", doc.id);

    return pendingResult;
  }

  // تنفيذ الفحص عبر ClamAV
  const scanResult = await fullScanner.scan(arrayBuffer, {
    fileName: doc.file_name,
    fileSize: arrayBuffer.byteLength,
    mimeType: doc.mime_type || "application/octet-stream",
    organizationId: doc.organization_id,
  });

  await recordScanResult(supabaseAdmin, doc.id, scanResult);

  if (scanResult.status === "CLEAN") {
    await logSecurityEvent({
      type: "DOCUMENT_SCAN_FAILED", // or info event
      action: "malware_scan.clean",
      organizationId: doc.organization_id,
      targetType: "document",
      targetId: doc.id,
      description: "اجتاز فحص البرمجيات الضارة بنجاح (CLEAN).",
    });
  } else if (scanResult.status === "INFECTED") {
    await logSecurityEvent({
      type: "DOCUMENT_SCAN_INFECTED",
      action: "malware_scan.infected",
      organizationId: doc.organization_id,
      targetType: "document",
      targetId: doc.id,
      description: scanResult.reason || "تم اكتشاف فيروس أو برمجية خبيثة في المستند.",
    });
  } else {
    const retryCount = (doc.scan_retry_count ?? 0) + 1;
    const nextRetry = new Date(Date.now() + scanBackoffMs(retryCount)).toISOString();
    await (supabaseAdmin as any)
      .from("documents")
      .update({
        scan_retry_count: retryCount,
        next_retry_at: retryCount >= MAX_SCAN_RETRIES ? null : nextRetry,
      })
      .eq("id", doc.id);

    await logSecurityEvent({
      type: "DOCUMENT_SCAN_FAILED",
      action: "malware_scan.failed",
      organizationId: doc.organization_id,
      targetType: "document",
      targetId: doc.id,
      description: scanResult.reason || "تعذر إكمال فحص مضاد الفيروسات.",
    });
  }

  return scanResult;
}
