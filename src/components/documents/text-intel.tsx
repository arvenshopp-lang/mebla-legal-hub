import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, FileSearch, RefreshCcw, Save, ScanText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canDo } from "@/lib/doc-permissions";
import { ocrDocumentPage, signDocumentUrl } from "@/lib/document-ai.functions";
import { processDocument, reprocessDocument } from "@/lib/document-pipeline";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONE,
  describeProcessingError,
  extractableKind,
  type DocumentJobStatus,
} from "@/lib/document-ai.shared";
import { Badge, Btn, IconBtn, LoadingBlock, Modal, inputCls } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";

export type DocumentRow = {
  id: string;
  organization_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
};

type JobRow = {
  document_id: string;
  status: DocumentJobStatus;
  progress: number;
  pages_total: number | null;
  pages_done: number;
  ocr_pages: number;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  completed_at: string | null;
};

/** حالات معالجة كل مستندات الصفحة الحالية، مع تحديث تلقائي أثناء العمل. */
export function useProcessingJobs(documentIds: string[]) {
  const key = useMemo(() => [...documentIds].sort().join(","), [documentIds]);
  return useQuery({
    queryKey: ["document-jobs", key],
    enabled: documentIds.length > 0,
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as JobRow[];
      const busy = rows.some((r) => !["completed", "failed"].includes(r.status));
      return busy ? 2500 : false;
    },
    queryFn: async (): Promise<JobRow[]> => {
      const { data, error } = await supabase
        .from("document_processing_jobs")
        .select("document_id, status, progress, pages_total, pages_done, ocr_pages, attempts, error_code, error_message, completed_at")
        .in("document_id", documentIds);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
  });
}

export function ProcessingBadge({ job, fileName, fileType }: { job?: JobRow; fileName: string; fileType: string | null }) {
  if (!extractableKind(fileName, fileType)) {
    return <span className="text-xs text-muted-foreground">غير قابل للفهرسة</span>;
  }
  if (!job) return <Badge tone="muted">بانتظار المعالجة</Badge>;
  const label = JOB_STATUS_LABELS[job.status];
  const detail =
    job.status === "ocr_processing" && job.pages_total
      ? ` (${job.pages_done}/${job.pages_total})`
      : job.status === "completed" && job.pages_done
        ? ` · ${job.pages_done} صفحة`
        : "";
  return (
    <div className="space-y-1">
      <Badge tone={JOB_STATUS_TONE[job.status]}>
        {label}
        {detail}
      </Badge>
      {job.status === "failed" && (
        <p className="max-w-[220px] text-[11px] text-danger">
          {describeProcessingError(job.error_code)}
          {job.error_code ? ` (${job.error_code})` : ""}
        </p>
      )}
      {!["completed", "failed"].includes(job.status) && (
        <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${job.progress}%` }} />
        </div>
      )}
    </div>
  );
}

/** يشغّل خط المعالجة على ملف تم رفعه الآن أو يعيد المحاولة لمستند قائم. */
export function useDocumentIndexing() {
  const qc = useQueryClient();
  const ocr = useServerFn(ocrDocumentPage);
  const sign = useServerFn(signDocumentUrl);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["document-jobs"] });
    qc.invalidateQueries({ queryKey: ["document-pages"] });
  };

  const indexUploaded = async (args: {
    organizationId: string;
    documentId: string;
    file: File;
  }) => {
    if (!extractableKind(args.file.name, args.file.type)) return;
    try {
      await processDocument({
        organizationId: args.organizationId,
        documentId: args.documentId,
        file: args.file,
        fileName: args.file.name,
        mimeType: args.file.type,
        ocr: ocr as never,
      });
      toast.success("المستند جاهز للبحث");
    } catch (e) {
      toast.error("تعذّرت معالجة المستند", {
        description: e instanceof Error ? describeProcessingError((e as { code?: string }).code, e.message) : undefined,
      });
    } finally {
      invalidate();
    }
  };

  const retry = useMutation({
    mutationFn: async (doc: DocumentRow) => {
      const signed = await sign({ data: { organizationId: doc.organization_id, documentId: doc.id } });
      return reprocessDocument({
        organizationId: doc.organization_id,
        documentId: doc.id,
        signedUrl: signed.url,
        fileName: doc.file_name,
        mimeType: doc.file_type,
        ocr: ocr as never,
      });
    },
    onSuccess: () => {
      toast.success("تمت إعادة المعالجة");
      invalidate();
    },
    onError: (e: Error) => {
      invalidate();
      toast.error("تعذّرت إعادة المعالجة", {
        description: describeProcessingError((e as { code?: string }).code, e.message),
      });
    },
  });

  return { indexUploaded, retry };
}

export function RetryButton({ doc }: { doc: DocumentRow }) {
  const { activeRole } = useAuth();
  const { retry } = useDocumentIndexing();
  if (!canDo(activeRole, "documents.retry_ocr")) return null;
  return (
    <IconBtn
      aria-label="إعادة المعالجة"
      title="إعادة المعالجة واستخراج النص"
      loading={retry.isPending && retry.variables?.id === doc.id}
      onClick={() => retry.mutate(doc)}
    >
      <RefreshCcw className="h-4 w-4" />
    </IconBtn>
  );
}

/** تبويب «النص المستخرج»: عرض صفحة بصفحة، نسخ، وتعديل مع حفظ النسخة الأصلية. */
export function ExtractedTextDialog({
  doc,
  onClose,
}: {
  doc: DocumentRow | null;
  onClose: () => void;
}) {
  const { activeRole } = useAuth();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const mayEdit = canDo(activeRole, "documents.edit_extracted_text");

  const { data, isLoading } = useQuery({
    queryKey: ["document-pages", doc?.id],
    enabled: !!doc,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_pages")
        .select("id, page_number, extracted_text, original_text, ocr_used, ocr_confidence, language, edited_at")
        .eq("document_id", doc!.id)
        .order("page_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pages = data ?? [];
  const current = pages[Math.min(index, Math.max(pages.length - 1, 0))];

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("document_pages")
        .update({ extracted_text: draft ?? "" })
        .eq("id", current!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ النص المعدّل");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["document-pages", doc?.id] });
    },
    onError: (e: Error) => toast.error("تعذّر الحفظ", { description: e.message }),
  });

  const copy = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(current.extracted_text);
    toast.success("تم نسخ نص الصفحة");
  };

  return (
    <Modal
      open={!!doc}
      onClose={() => {
        setDraft(null);
        setIndex(0);
        onClose();
      }}
      title="النص المستخرج"
      description={doc?.file_name}
      size="lg"
    >
      {isLoading ? (
        <LoadingBlock rows={4} cols={1} />
      ) : pages.length === 0 ? (
        <p className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-6 text-center text-sm text-muted-foreground">
          لا يوجد نص مفهرس لهذا المستند بعد.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={current?.page_number}
              onChange={(e) => {
                setDraft(null);
                setIndex(pages.findIndex((p) => p.page_number === Number(e.target.value)));
              }}
              aria-label="اختر الصفحة"
              className={`${inputCls} w-auto min-w-[140px]`}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.page_number}>
                  صفحة {p.page_number}
                </option>
              ))}
            </select>
            <Badge tone={current?.ocr_used ? "warn" : "green"}>
              {current?.ocr_used ? "قراءة ضوئية (OCR)" : "نص أصلي"}
            </Badge>
            {current?.ocr_used && current.ocr_confidence != null && (
              <Badge tone="muted">الثقة {Math.round(Number(current.ocr_confidence) * 100)}%</Badge>
            )}
            {current?.language && <Badge tone="muted">{current.language === "ar" ? "عربي" : current.language === "en" ? "إنجليزي" : "مختلط"}</Badge>}
            {current?.edited_at && <Badge tone="muted">عُدّل يدوياً · {fmtDateTime(current.edited_at)}</Badge>}
          </div>

          <textarea
            dir="auto"
            rows={14}
            readOnly={!mayEdit}
            value={draft ?? current?.extracted_text ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            className={`${inputCls} font-normal leading-7`}
          />

          {current?.original_text && (
            <details className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2 text-[12px]">
              <summary className="cursor-pointer text-muted-foreground">النص قبل التعديل</summary>
              <p dir="auto" className="mt-2 whitespace-pre-wrap leading-7">
                {current.original_text}
              </p>
            </details>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Btn variant="outline" onClick={copy}>
              <Copy className="h-4 w-4 me-1" /> نسخ النص
            </Btn>
            {mayEdit && (
              <Btn onClick={() => save.mutate()} loading={save.isPending} disabled={draft === null}>
                <Save className="h-4 w-4 me-1" /> حفظ التعديل
              </Btn>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export const TextIntelIcons = { FileSearch, ScanText };
