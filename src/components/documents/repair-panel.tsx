import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canDo } from "@/lib/doc-permissions";
import { Badge, Btn, Modal } from "@/lib/list-utils";
import { repairOfficeDocuments } from "@/lib/documents/repair.functions";
import {
  REPAIR_OUTCOME_LABELS,
  REPAIR_OUTCOME_TONE,
  summarizeRepair,
  type DocumentRepairResult,
  type RepairReport,
} from "@/lib/documents/repair.shared";
import { ocrDocumentPage, signDocumentUrl } from "@/lib/document-ai.functions";
import { reprocessDocument } from "@/lib/document-pipeline";
import { describeProcessingError } from "@/lib/document-ai.shared";

type Row = DocumentRepairResult & { reindexed?: boolean; reindexError?: string | null };

/**
 * مهمة «فحص وإصلاح المستندات»: يُشغّلها المكتب بنفسه. الخادم يُعيد ربط الملفات
 * ويتحقق من العرض والتنزيل، ثم يُعاد استخراج النص للمستندات التي تحتاج ذلك —
 * الاستخراج يعمل في المتصفح لأن أدوات قراءة PDF غير متاحة على الخادم.
 */
export function DocumentRepairButton() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const runRepair = useServerFn(repairOfficeDocuments);
  const sign = useServerFn(signDocumentUrl);
  const ocr = useServerFn(ocrDocumentPage);
  const [report, setReport] = useState<RepairReport | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [reindexing, setReindexing] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const result = (await runRepair({
        data: { organizationId: activeOrgId!, scope: "broken" },
      })) as RepairReport;
      setReport(result);
      setRows(result.results.map((r) => ({ ...r })));

      // إعادة استخراج النص للمستندات التي أُعيد ربطها أو فقدت فهرستها.
      for (const item of result.results.filter((r) => r.needsReprocess)) {
        setReindexing(item.documentId);
        try {
          const ticket = await sign({
            data: { organizationId: activeOrgId!, documentId: item.documentId },
          });
          await reprocessDocument({
            organizationId: activeOrgId!,
            documentId: item.documentId,
            signedUrl: ticket.url,
            fileName: ticket.fileName,
            mimeType: ticket.fileType,
            ocr: ocr as never,
          });
          setRows((prev) =>
            prev.map((r) =>
              r.documentId === item.documentId ? { ...r, reindexed: true, viewable: true } : r,
            ),
          );
        } catch (error) {
          const message = describeProcessingError(
            (error as { code?: string }).code,
            error instanceof Error ? error.message : null,
          );
          setRows((prev) =>
            prev.map((r) => (r.documentId === item.documentId ? { ...r, reindexError: message } : r)),
          );
        }
      }
      setReindexing(null);
      return result;
    },
    onSuccess: (result) => {
      toast.success("انتهى فحص المستندات", { description: summarizeRepair(result) });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-jobs"] });
    },
    onError: (error: Error) => {
      setReindexing(null);
      toast.error("تعذّر تشغيل مهمة الإصلاح", { description: error.message });
    },
  });

  if (!activeOrgId || !canDo(activeRole, "documents.retry_ocr")) return null;

  return (
    <>
      <Btn variant="outline" onClick={() => run.mutate()} loading={run.isPending}>
        <Wrench className="h-4 w-4 me-1" />
        {run.isPending ? "جاري الفحص…" : "فحص وإصلاح المستندات"}
      </Btn>

      <Modal
        open={!!report && !run.isPending}
        onClose={() => setReport(null)}
        title="تقرير فحص وإصلاح المستندات"
        description={report ? summarizeRepair(report) : undefined}
        size="lg"
      >
        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="سليم" value={report.verified} />
              <Stat label="أُعيد ربطه" value={report.relinked} />
              <Stat label="مفقود" value={report.missing} />
              <Stat label="غير صالح" value={report.invalid} />
            </div>

            {rows.length === 0 ? (
              <p className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-6 text-center text-sm text-muted-foreground">
                لا توجد مستندات تحتاج إصلاحاً — جميع الملفات قابلة للعرض والتنزيل.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-[var(--radius-m)] ring-1 ring-inset ring-border">
                {rows.map((row) => (
                  <li key={row.documentId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{row.fileName}</span>
                    <Badge tone={REPAIR_OUTCOME_TONE[row.outcome]}>{REPAIR_OUTCOME_LABELS[row.outcome]}</Badge>
                    {row.downloadable && (
                      <Badge tone="muted">
                        <ShieldCheck className="me-1 inline h-3 w-3" /> التنزيل المائي يعمل
                      </Badge>
                    )}
                    {row.reindexed && <Badge tone="green">أُعيدت الفهرسة</Badge>}
                    {reindexing === row.documentId && <Badge tone="warn">جاري إعادة الفهرسة…</Badge>}
                    {row.reindexError && <span className="text-[11px] text-danger">{row.reindexError}</span>}
                    {row.traceRef && (
                      <span className="text-[11px] text-muted-foreground">مرجع العطل: {row.traceRef}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {report.missing > 0 && (
              <p className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2 text-[12px] text-danger">
                المستندات المفقودة لم يُعثر على ملفها في مساحة التخزين، ويلزم إعادة رفعها من نسختها الأصلية.
              </p>
            )}

            <div className="flex justify-end">
              <Btn variant="outline" onClick={() => setReport(null)}>
                إغلاق
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}