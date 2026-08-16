/**
 * مسار المشغّل الدوري لفحص البرمجيات الضارة لمستندات مِهلة (Document Malware Scan Cron Runner).
 *
 * التوثيق: محمي بسر التشغيل الموحد (x-mehla-cron-secret) بمقارنة ثابتة الزمن داخل قاعدة البيانات.
 * الحجز: ذري عبر claim_document_scan_batch (FOR UPDATE SKIP LOCKED) مع قفل مؤقت (Lease) لمنع التنازع.
 * الاستجابة: إحصائيات عددية مجمعة فقط دون أي بيانات مستندات أو PII.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";
import {
  claimPendingScanBatch,
  processDocumentScanJob,
  type PipelineBatchResult,
} from "@/lib/documents/scan-pipeline.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/document-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        const start = Date.now();
        const report: PipelineBatchResult = {
          claimed: 0,
          clean: 0,
          infected: 0,
          failed: 0,
          retried: 0,
          durationMs: 0,
        };

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const workerId = `cron-scanner-${Math.random().toString(36).slice(2, 9)}`;

          // حجز دفعة مستندات معلقة بشكل ذري (بحد أقصى 20 مستنداً لكل دورة)
          const batch = await claimPendingScanBatch(supabaseAdmin, {
            limit: 20,
            workerId,
            leaseSeconds: 300,
          });

          report.claimed = batch.length;

          for (const doc of batch) {
            try {
              const res = await processDocumentScanJob(supabaseAdmin, doc);
              if (res.status === "CLEAN") {
                report.clean++;
              } else if (res.status === "INFECTED" || res.status === "QUARANTINED") {
                report.infected++;
              } else {
                report.failed++;
                if ((doc.scan_retry_count ?? 0) < 3) {
                  report.retried++;
                }
              }
            } catch (docErr) {
              console.error("[document-scan-cron] item processing error", doc.id, docErr);
              report.failed++;
            }
          }

          report.durationMs = Date.now() - start;
          return json({ ok: true, report });
        } catch (error) {
          console.error(
            "[document-scan-cron]",
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
          );
          return json({ ok: false, reason: "scan_runner_failed" }, 500);
        }
      },
    },
  },
});
