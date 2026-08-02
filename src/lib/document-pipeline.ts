/**
 * Browser-side extraction pipeline.
 *
 * The file is already in the browser at upload time (or fetched through a short
 * lived signed URL on retry), so digital text extraction and page rasterisation
 * happen here — the Worker runtime cannot host PDF or image toolchains. OCR,
 * quota accounting and provider keys stay server-side. Every DB write goes
 * through RLS as the signed-in user, so pages can never cross offices.
 */
import { supabase } from "@/integrations/supabase/client";
import { ocrDocumentPage } from "@/lib/document-ai.functions";
import {
  MAX_OCR_PAGES_PER_RUN,
  MIN_DIGITAL_CHARS_PER_PAGE,
  extractableKind,
  type DocumentJobStatus,
  type PageText,
} from "@/lib/document-ai.shared";

type OcrFn = (args: {
  data: {
    organizationId: string;
    documentId: string;
    pageNumber: number;
    mimeType: string;
    imageBase64: string;
    languageHint: "ar" | "en" | "mixed";
  };
}) => Promise<{ text: string; confidence: number; language: string; isBlank: boolean }>;

export type PipelineProgress = {
  status: DocumentJobStatus;
  progress: number;
  pagesDone: number;
  pagesTotal: number | null;
};

export type PipelineInput = {
  organizationId: string;
  documentId: string;
  file: Blob;
  fileName: string;
  mimeType: string | null;
  ocr: OcrFn;
  onProgress?: (p: PipelineProgress) => void;
};

export class ProcessingError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const OCR_RENDER_SCALE = 2;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  return pdfjs;
}

function canvasToBase64(canvas: HTMLCanvasElement): { base64: string; mimeType: string } {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** يرسم الصورة على canvas لتوحيد الصيغة وتقليل الحجم قبل الإرسال إلى OCR. */
async function imageBlobToPage(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(blob);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ProcessingError("CORRUPT_FILE");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvasToBase64(canvas);
}

async function updateJob(
  documentId: string,
  patch: Partial<{
    status: DocumentJobStatus;
    progress: number;
    pages_total: number | null;
    pages_done: number;
    ocr_pages: number;
    error_code: string | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>,
) {
  await supabase.from("document_processing_jobs").update(patch).eq("document_id", documentId);
}

/** يُنشئ سجل المعالجة أو يعيد استخدامه — يمنع معالجة الملف نفسه مرتين. */
export async function ensureJob(organizationId: string, documentId: string, processingType: string) {
  const { data: existing } = await supabase
    .from("document_processing_jobs")
    .select("id, status, attempts")
    .eq("document_id", documentId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("document_processing_jobs")
    .insert({
      organization_id: organizationId,
      document_id: documentId,
      processing_type: processingType,
      status: "queued",
    })
    .select("id, status, attempts")
    .single();
  if (error) throw new ProcessingError("UNKNOWN", error.message);
  return data;
}

async function extractPdf(
  input: PipelineInput,
  report: (p: PipelineProgress) => void,
): Promise<PageText[]> {
  const pdfjs = await loadPdfjs();
  const buffer = await input.file.arrayBuffer();
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    throw new ProcessingError("CORRUPT_FILE");
  }

  const total = pdf.numPages;
  const pages: PageText[] = [];
  const needsOcr: number[] = [];

  await updateJob(input.documentId, { status: "extracting", pages_total: total, progress: 10 });
  report({ status: "extracting", progress: 10, pagesDone: 0, pagesTotal: total });

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length >= MIN_DIGITAL_CHARS_PER_PAGE) {
      pages.push({
        page_number: i,
        extracted_text: text,
        ocr_used: false,
        ocr_confidence: null,
        language: /[\u0600-\u06FF]/.test(text) ? "ar" : "en",
        is_blank: false,
      });
    } else {
      needsOcr.push(i);
      pages.push({
        page_number: i,
        extracted_text: text,
        ocr_used: false,
        ocr_confidence: null,
        language: null,
        is_blank: text.length === 0,
      });
    }
    page.cleanup();
    const progress = 10 + Math.round((i / total) * 35);
    report({ status: "extracting", progress, pagesDone: i, pagesTotal: total });
  }

  if (needsOcr.length > 0) {
    const budget = needsOcr.slice(0, MAX_OCR_PAGES_PER_RUN);
    await updateJob(input.documentId, { status: "ocr_processing", progress: 50 });
    let done = 0;

    for (const pageNumber of budget) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(2200, Math.ceil(viewport.width));
      canvas.height = Math.ceil((canvas.width / viewport.width) * viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ProcessingError("CORRUPT_FILE");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport: page.getViewport({ scale: (canvas.width / viewport.width) * OCR_RENDER_SCALE }),
      }).promise;
      const { base64, mimeType } = canvasToBase64(canvas);
      page.cleanup();

      const result = await input.ocr({
        data: {
          organizationId: input.organizationId,
          documentId: input.documentId,
          pageNumber,
          mimeType,
          imageBase64: base64,
          languageHint: "mixed",
        },
      });

      const target = pages.find((p) => p.page_number === pageNumber)!;
      target.extracted_text = result.text;
      target.ocr_used = true;
      target.ocr_confidence = result.confidence;
      target.language = result.language;
      target.is_blank = result.isBlank;

      done += 1;
      const progress = 50 + Math.round((done / budget.length) * 35);
      await updateJob(input.documentId, { pages_done: done, ocr_pages: done, progress });
      report({ status: "ocr_processing", progress, pagesDone: done, pagesTotal: budget.length });
    }
  }

  return pages;
}

async function extractDocx(input: PipelineInput): Promise<PageText[]> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  try {
    const { value } = await (mammoth as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> })
      .extractRawText({ arrayBuffer: await input.file.arrayBuffer() });
    const text = value.replace(/\s+\n/g, "\n").trim();
    if (!text) throw new ProcessingError("NO_TEXT_FOUND");
    // DOCX لا يحمل ترقيم صفحات ثابتاً؛ يُقسَّم إلى مقاطع بحجم صفحة تقريبية.
    const CHUNK = 2500;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
    return chunks.map((chunk, index) => ({
      page_number: index + 1,
      extracted_text: chunk,
      ocr_used: false,
      ocr_confidence: null,
      language: /[\u0600-\u06FF]/.test(chunk) ? "ar" : "en",
      is_blank: false,
    }));
  } catch (e) {
    if (e instanceof ProcessingError) throw e;
    throw new ProcessingError("CORRUPT_FILE");
  }
}

async function extractTxt(input: PipelineInput): Promise<PageText[]> {
  const text = (await input.file.text()).trim();
  if (!text) throw new ProcessingError("NO_TEXT_FOUND");
  const CHUNK = 2500;
  const pages: PageText[] = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    const chunk = text.slice(i, i + CHUNK);
    pages.push({
      page_number: pages.length + 1,
      extracted_text: chunk,
      ocr_used: false,
      ocr_confidence: null,
      language: /[\u0600-\u06FF]/.test(chunk) ? "ar" : "en",
      is_blank: false,
    });
  }
  return pages;
}

async function extractImage(
  input: PipelineInput,
  report: (p: PipelineProgress) => void,
): Promise<PageText[]> {
  await updateJob(input.documentId, { status: "ocr_processing", pages_total: 1, progress: 40 });
  report({ status: "ocr_processing", progress: 40, pagesDone: 0, pagesTotal: 1 });
  const { base64, mimeType } = await imageBlobToPage(input.file);
  const result = await input.ocr({
    data: {
      organizationId: input.organizationId,
      documentId: input.documentId,
      pageNumber: 1,
      mimeType,
      imageBase64: base64,
      languageHint: "mixed",
    },
  });
  await updateJob(input.documentId, { pages_done: 1, ocr_pages: 1, progress: 85 });
  report({ status: "ocr_processing", progress: 85, pagesDone: 1, pagesTotal: 1 });
  return [
    {
      page_number: 1,
      extracted_text: result.text,
      ocr_used: true,
      ocr_confidence: result.confidence,
      language: result.language,
      is_blank: result.isBlank,
    },
  ];
}

/**
 * Runs the whole pipeline for one document and persists the indexed pages.
 * Safe to call again after a failure — pages are replaced, not duplicated.
 */
export async function processDocument(input: PipelineInput): Promise<{ pages: number; ocrPages: number }> {
  const report = input.onProgress ?? (() => {});
  const kind = extractableKind(input.fileName, input.mimeType);
  if (!kind) throw new ProcessingError("UNSUPPORTED_TYPE");

  await ensureJob(input.organizationId, input.documentId, kind);
  const { data: job } = await supabase
    .from("document_processing_jobs")
    .select("attempts")
    .eq("document_id", input.documentId)
    .maybeSingle();

  await updateJob(input.documentId, {
    status: "queued",
    progress: 5,
    error_code: null,
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    pages_done: 0,
    ocr_pages: 0,
    ...(job ? { attempts: job.attempts + 1 } : {}),
  } as never);
  report({ status: "queued", progress: 5, pagesDone: 0, pagesTotal: null });

  try {
    const pages =
      kind === "pdf"
        ? await extractPdf(input, report)
        : kind === "docx"
          ? await extractDocx(input)
          : kind === "txt"
            ? await extractTxt(input)
            : await extractImage(input, report);

    const usable = pages.filter((p) => p.extracted_text.trim().length > 0);
    if (usable.length === 0) throw new ProcessingError("NO_TEXT_FOUND");

    await updateJob(input.documentId, { status: "indexing", progress: 90 });
    report({ status: "indexing", progress: 90, pagesDone: usable.length, pagesTotal: pages.length });

    await supabase.from("document_pages").delete().eq("document_id", input.documentId);
    const { error: insertError } = await supabase.from("document_pages").insert(
      usable.map((p) => ({
        organization_id: input.organizationId,
        document_id: input.documentId,
        page_number: p.page_number,
        extracted_text: p.extracted_text,
        ocr_used: p.ocr_used,
        ocr_confidence: p.ocr_confidence,
        language: p.language,
        is_blank: p.is_blank,
      })),
    );
    if (insertError) throw new ProcessingError("UNKNOWN", insertError.message);

    const ocrPages = usable.filter((p) => p.ocr_used).length;
    await updateJob(input.documentId, {
      status: "completed",
      progress: 100,
      pages_total: pages.length,
      pages_done: usable.length,
      ocr_pages: ocrPages,
      completed_at: new Date().toISOString(),
    });
    report({ status: "completed", progress: 100, pagesDone: usable.length, pagesTotal: pages.length });
    return { pages: usable.length, ocrPages };
  } catch (e) {
    const code = e instanceof ProcessingError ? e.code : "UNKNOWN";
    const message = e instanceof Error ? e.message : "";
    await updateJob(input.documentId, {
      status: "failed",
      error_code: code,
      // لا يُحفَظ أي محتوى قانوني — فقط رسالة الخطأ.
      error_message: message.slice(0, 400) || null,
      completed_at: new Date().toISOString(),
    });
    report({ status: "failed", progress: 100, pagesDone: 0, pagesTotal: null });
    throw e;
  }
}

/** إعادة المعالجة لمستند مرفوع مسبقاً باستخدام رابط موقّع قصير الصلاحية. */
export async function reprocessDocument(args: {
  organizationId: string;
  documentId: string;
  signedUrl: string;
  fileName: string;
  mimeType: string | null;
  ocr: OcrFn;
  onProgress?: (p: PipelineProgress) => void;
}) {
  let blob: Blob;
  try {
    const endpoint = new URL(args.signedUrl, window.location.origin);
    const response = await fetch(endpoint, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/octet-stream, application/pdf, image/*, application/json" },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
      const code = response.status === 403
        ? "ACCESS_LINK_EXPIRED"
        : response.status === 404
          ? "FILE_MISSING"
          : "DOWNLOAD_FAILED";
      throw new ProcessingError(
        code,
        typeof payload?.message === "string" ? payload.message : undefined,
      );
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      throw new ProcessingError("INVALID_DOWNLOAD");
    }
    blob = await response.blob();
    if (!blob.size) throw new ProcessingError("INVALID_DOWNLOAD");
  } catch (error) {
    const code = error instanceof ProcessingError ? error.code : "DOWNLOAD_FAILED";
    await updateJob(args.documentId, {
      status: "failed",
      error_code: code,
      error_message: error instanceof Error ? error.message.slice(0, 400) : null,
      completed_at: new Date().toISOString(),
    });
    if (error instanceof ProcessingError) throw error;
    throw new ProcessingError("DOWNLOAD_FAILED");
  }
  return processDocument({
    organizationId: args.organizationId,
    documentId: args.documentId,
    file: blob,
    fileName: args.fileName,
    mimeType: args.mimeType ?? blob.type,
    ocr: args.ocr,
    ...(args.onProgress ? { onProgress: args.onProgress } : {}),
  });
}

export { ocrDocumentPage };
