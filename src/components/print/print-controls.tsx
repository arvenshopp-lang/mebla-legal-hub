import { Printer, FileDown } from "lucide-react";
import { useSecureDocument } from "@/components/documents/secure-document";
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
  organization_id: string;
  file_name: string;
  file_type?: string | null;
  is_confidential?: boolean | null;
};

/**
 * تصدير مستند مخزّن: يطلب تذكرة من الخادم فيحصل على نسخة PDF مائية جاهزة،
 * دون أي وصول مباشر إلى المستودع من المتصفح.
 */
export function ExportStampedButton({
  file,
  variant = "icon",
  label = "تصدير نسخة مائية",
}: {
  file: StoredFile;
  variant?: "icon" | "button";
  label?: string;
}) {
  const secure = useSecureDocument();
  if (!secure.can("documents.export" as const)) return null;
  const run = () => secure.download(file);
  const loading = secure.isBusy(file.id, "download");

  if (variant === "button") {
    return (
      <Btn variant="outline" onClick={run} loading={loading}>
        <FileDown className="inline h-4 w-4 me-1" /> {label}
      </Btn>
    );
  }
  return (
    <IconBtn aria-label={label} title={label} loading={loading} onClick={run}>
      <FileDown className="h-4 w-4" />
    </IconBtn>
  );
}
