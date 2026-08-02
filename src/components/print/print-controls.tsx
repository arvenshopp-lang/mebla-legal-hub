import { Printer, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { IconBtn, Btn } from "@/lib/list-utils";
import { usePrintEngine } from "@/lib/print/print-engine";
import type { PrintTarget } from "@/lib/print/print.shared";

/**
 * Shared print/export controls. Any new screen gets watermarking and the audit
 * trail simply by rendering these, so the behaviour can never drift per page.
 */

export function PrintButton({
  target,
  buildHtml,
  variant = "icon",
  label = "طباعة",
}: {
  target: PrintTarget;
  buildHtml: () => string;
  variant?: "icon" | "button";
  label?: string;
}) {
  const { printHtml, can, busy } = usePrintEngine();
  if (!can("print.print")) return null;
  const run = () => void printHtml({ ...target, html: buildHtml() });
  if (variant === "button") {
    return (
      <Btn variant="outline" onClick={run} loading={busy === "print"}>
        <Printer className="inline h-4 w-4 me-1" /> {label}
      </Btn>
    );
  }
  return (
    <IconBtn aria-label={label} title={label} loading={busy === "print"} onClick={run}>
      <Printer className="h-4 w-4" />
    </IconBtn>
  );
}

export type StoredFile = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  is_confidential?: boolean | null;
  document_category?: string | null;
};

/** تصدير مستند مخزّن في المستودع بعد ختمه — يستبدل التنزيل المباشر. */
export function ExportStampedButton({
  file,
  documentType = "document",
  variant = "icon",
  label = "تصدير PDF مع العلامة المائية",
}: {
  file: StoredFile;
  documentType?: PrintTarget["documentType"];
  variant?: "icon" | "button";
  label?: string;
}) {
  const { exportStamped, can, busy } = usePrintEngine();
  if (!can("print.export_pdf")) return null;

  const run = async () => {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(file.file_path, 60);
    if (error || !data) {
      toast.error("تعذّر الوصول للملف", { description: error?.message });
      return;
    }
    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      toast.error("تعذّر تحميل الملف للختم");
      return;
    }
    await exportStamped({
      documentType,
      documentId: file.id,
      title: file.file_name,
      fileName: file.file_name,
      classification: file.is_confidential ? "confidential" : "internal",
      source: await response.arrayBuffer(),
      mimeType: file.file_type ?? "",
    });
  };

  if (variant === "button") {
    return (
      <Btn variant="outline" onClick={() => void run()} loading={busy === "export_pdf"}>
        <FileDown className="inline h-4 w-4 me-1" /> {label}
      </Btn>
    );
  }
  return (
    <IconBtn
      aria-label={label}
      title={label}
      loading={busy === "export_pdf"}
      onClick={() => void run()}
    >
      <FileDown className="h-4 w-4" />
    </IconBtn>
  );
}
