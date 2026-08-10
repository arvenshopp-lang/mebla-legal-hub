import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canDo, permissionDeniedMessage, type DocumentPermission } from "@/lib/doc-permissions";
import { openPrintEvent } from "./print-audit.functions";
import { stampImageAsPdf, stampPdfBytes } from "./pdf-stamp";
import { classificationStampDataUrl, watermarkTileDataUrl } from "./watermark";
import {
  DOCUMENT_TYPE_LABELS,
  ROLE_PRINT_LABELS,
  detectEnvironment,
  documentRefFor,
  footerLine,
  formatStampDate,
  type Classification,
  type PrintAction,
  type PrintStamp,
  type PrintTarget,
} from "./print.shared";

/**
 * The single supported way to print, export or download anything in مِهلة.
 *
 * Order of operations is deliberate and identical for every surface:
 * 1. permission check (client mirror) → 2. immutable server audit entry →
 * 3. watermark + footer applied → 4. output handed to the user.
 * If step 2 fails, no output is produced.
 */

type PrintHtmlInput = PrintTarget & { html: string };

function stampFromEvent(
  event: Awaited<ReturnType<typeof openPrintEvent>>,
  target: PrintTarget,
  action: PrintAction,
  fallbackName: string,
  fallbackEmail: string,
  role: string | null,
): PrintStamp {
  const env = detectEnvironment();
  const { date, time } = formatStampDate(new Date(event.serverTime), env.timeZone);
  return {
    printRef: event.printRef,
    action,
    userName: event.userName || fallbackName || "—",
    userEmail: event.userEmail || fallbackEmail || "—",
    userRoleLabel: ROLE_PRINT_LABELS[event.role ?? role ?? ""] ?? "مستخدم",
    userId: "",
    officeName: event.officeName || "—",
    documentRef: documentRefFor(target),
    documentId: target.documentId ?? null,
    documentTitle: target.title,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[target.documentType],
    documentVersion: target.version ?? "v1",
    classification: target.classification ?? "internal",
    copyNumber: event.copyNumber,
    date,
    time,
    ip: event.ip || "—",
    country: event.country,
    browser: env.browser,
    os: env.os,
    device: env.device,
    sessionId: env.sessionId,
  };
}

function buildPrintDocument(html: string, stamp: PrintStamp): string {
  const tile = watermarkTileDataUrl(stamp);
  const classStamp = classificationStampDataUrl(stamp);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${stamp.documentTitle} — ${stamp.documentRef}</title>
<link rel="stylesheet" href="/fonts/mehla-fonts.css" />
<style>
  @page { size: A4; margin: 16mm 14mm 24mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Tajawal", sans-serif;
    color: #16211D; background: #fff; font-size: 12.5px; line-height: 1.9;
  }
  .mehla-watermark, .mehla-classification, .mehla-footer { position: fixed; z-index: 9999; pointer-events: none; }
  .mehla-watermark { inset: 0; background-image: url("${tile}"); background-repeat: repeat; }
  .mehla-classification {
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 170mm; height: 70mm;
    background-image: url("${classStamp ?? ""}"); background-repeat: no-repeat;
    background-position: center; background-size: contain;
    display: ${classStamp ? "block" : "none"};
  }
  .mehla-footer {
    bottom: 0; inset-inline: 0; padding: 3mm 8mm 4mm;
    border-top: 0.4pt solid rgba(18,60,50,0.35);
    font-size: 7.5pt; color: #123C32; text-align: center; background: #fff;
  }
  .mehla-content { position: relative; z-index: 1; padding-bottom: 6mm; }
  .mehla-content h1 { font-size: 19px; margin: 0 0 4px; color: #123C32; }
  .mehla-content h2 { font-size: 15px; margin: 18px 0 6px; color: #123C32; }
  .mehla-content table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
  .mehla-content th, .mehla-content td { border: 0.5pt solid #D8D3C7; padding: 6px 8px; text-align: right; vertical-align: top; }
  .mehla-content th { background: #F5F3EE; font-weight: 600; }
  .mehla-content tr, .mehla-content h1, .mehla-content h2 { break-inside: avoid; }
  .mehla-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    border-bottom: 1pt solid #123C32; padding-bottom: 8px; margin-bottom: 14px; }
  .mehla-head .brand { font-weight: 700; font-size: 16px; color: #123C32; }
  .mehla-head .meta { font-size: 8.5pt; color: #5B6560; text-align: left; line-height: 1.7; }
</style>
</head>
<body>
  <div class="mehla-watermark" aria-hidden="true"></div>
  <div class="mehla-classification" aria-hidden="true"></div>
  <div class="mehla-content">
    <div class="mehla-head">
      <div>
        <div class="brand">مِهلة | MehlaLex</div>
        <div style="font-size:9pt;color:#5B6560">${stamp.officeName}</div>
      </div>
      <div class="meta">
        ${stamp.documentTypeLabel} · ${stamp.documentRef}<br />
        ${stamp.documentVersion} · نسخة ${stamp.copyNumber}<br />
        ${stamp.date} ${stamp.time}
      </div>
    </div>
    ${html}
  </div>
  <div class="mehla-footer">${footerLine(stamp)}</div>
</body>
</html>`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function safeFileName(target: PrintTarget, stamp: PrintStamp): string {
  const base = (target.fileName ?? `${target.title}-${stamp.documentRef}`)
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 90);
  return `${base}.pdf`;
}

export function usePrintEngine() {
  const { activeOrgId, activeRole, profile, user } = useAuth();
  const openEvent = useServerFn(openPrintEvent);
  const [busy, setBusy] = useState<PrintAction | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => () => frameRef.current?.remove(), []);

  const can = useCallback(
    (permission: DocumentPermission) => canDo(activeRole, permission),
    [activeRole],
  );

  const guard = useCallback(
    (permission: DocumentPermission, classification: Classification) => {
      if (!activeOrgId) {
        toast.error("اختر المكتب النشط أولاً");
        return false;
      }
      if (!can(permission)) {
        toast.error("صلاحية غير كافية", { description: permissionDeniedMessage(permission) });
        return false;
      }
      if (classification !== "internal" && !can("print.confidential")) {
        toast.error("مستند سرّي", { description: permissionDeniedMessage("print.confidential") });
        return false;
      }
      return true;
    },
    [activeOrgId, can],
  );

  const register = useCallback(
    async (target: PrintTarget, action: PrintAction, pagesCount: number) => {
      const env = detectEnvironment();
      const event = await openEvent({
        data: {
          organizationId: activeOrgId!,
          action,
          documentType: target.documentType,
          documentId: target.documentId ?? null,
          documentRef: documentRefFor(target),
          documentTitle: target.title,
          documentVersion: target.version ?? "v1",
          classification: target.classification ?? "internal",
          pagesCount,
          browser: env.browser,
          os: env.os,
          device: env.device,
          sessionId: env.sessionId,
          metadata: {},
        },
      });
      return stampFromEvent(
        event,
        target,
        action,
        profile?.full_name ?? "",
        profile?.email ?? user?.email ?? "",
        activeRole,
      );
    },
    [activeOrgId, activeRole, openEvent, profile?.email, profile?.full_name, user?.email],
  );

  /** طباعة محتوى HTML مُولَّد داخل المنصة (قضية، مذكرة، فاتورة، تقرير…). */
  const printHtml = useCallback(
    async ({ html, ...target }: PrintHtmlInput) => {
      if (!guard("print.print", target.classification ?? "internal")) return;
      setBusy("print");
      try {
        const stamp = await register(target, "print", 1);
        frameRef.current?.remove();
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;inset:0;width:0;height:0;border:0;opacity:0;";
        document.body.appendChild(frame);
        frameRef.current = frame;
        const doc = frame.contentDocument;
        if (!doc) throw new Error("تعذّر تجهيز نافذة الطباعة.");
        doc.open();
        doc.write(buildPrintDocument(html, stamp));
        doc.close();
        await new Promise((resolve) => setTimeout(resolve, 600));
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        toast.success("تم تجهيز الطباعة", { description: `Print ID: ${stamp.printRef}` });
      } catch (error) {
        toast.error("تعذّرت الطباعة", { description: (error as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [guard, register],
  );

  /** تصدير ملف مخزّن (PDF أو صورة) بعد ختمه بالعلامة المائية والتذييل. */
  const exportStamped = useCallback(
    async (
      target: PrintTarget & { source: ArrayBuffer; mimeType: string },
      action: Extract<PrintAction, "export_pdf" | "download"> = "export_pdf",
    ) => {
      const permission: DocumentPermission =
        action === "download" ? "print.download" : "print.export_pdf";
      if (!guard(permission, target.classification ?? "internal")) return;
      setBusy(action);
      try {
        const isPdf = /pdf/i.test(target.mimeType) || /\.pdf$/i.test(target.fileName ?? "");
        const isImage = /^image\//i.test(target.mimeType);
        if (!isPdf && !isImage) {
          toast.error("صيغة غير قابلة للختم", {
            description: "يمكن ختم ملفات PDF والصور فقط. حوّل الملف إلى PDF قبل التصدير.",
          });
          return;
        }
        const stamp = await register(target, action, 1);
        const blob = isPdf
          ? await stampPdfBytes(target.source, stamp)
          : await stampImageAsPdf(target.source, target.mimeType, stamp);
        downloadBlob(blob, safeFileName(target, stamp));
        toast.success("تم التصدير مع العلامة المائية", {
          description: `Print ID: ${stamp.printRef}`,
        });
      } catch (error) {
        toast.error("تعذّر التصدير", { description: (error as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [guard, register],
  );

  return useMemo(
    () => ({ printHtml, exportStamped, can, busy, isBusy: busy !== null }),
    [busy, can, exportStamped, printHtml],
  );
}
