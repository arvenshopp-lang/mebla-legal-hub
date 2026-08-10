import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canDo } from "@/lib/doc-permissions";
import { openPrintEvent } from "@/lib/print/print-audit.functions";
import { classificationStampDataUrl, watermarkTileDataUrl } from "@/lib/print/watermark";
import {
  ROLE_PRINT_LABELS,
  detectEnvironment,
  footerLine,
  formatStampDate,
  type PrintStamp,
} from "@/lib/print/print.shared";

const LAYER_ID = "mehla-print-layer";

/**
 * Catches native printing (Ctrl/⌘+P, browser menu, "Save as PDF") anywhere
 * inside the app: the screen is never printed bare. The event is registered in
 * the immutable audit log and the dynamic watermark plus footer are injected
 * into the printed output.
 */
export function PrintGuard() {
  const { activeOrgId, activeRole, profile, user } = useAuth();
  const openEvent = useServerFn(openPrintEvent);

  useEffect(() => {
    if (!activeOrgId) return;
    const allowed = canDo(activeRole, "print.print");
    const env = detectEnvironment();

    const buildStamp = (
      printRef: string,
      copyNumber: number,
      ip: string,
      serverTime: string,
    ): PrintStamp => {
      const { date, time } = formatStampDate(new Date(serverTime), env.timeZone);
      return {
        printRef,
        action: "print",
        userName: profile?.full_name ?? "—",
        userEmail: profile?.email ?? user?.email ?? "—",
        userRoleLabel: ROLE_PRINT_LABELS[activeRole ?? ""] ?? "مستخدم",
        userId: user?.id ?? "",
        officeName: "",
        documentRef: `SCR-${
          window.location.pathname
            .replace(/[^a-zA-Z]/g, "")
            .slice(0, 12)
            .toUpperCase() || "HOME"
        }`,
        documentId: null,
        documentTitle: document.title,
        documentTypeLabel: "شاشة",
        documentVersion: "v1",
        classification: "confidential",
        copyNumber,
        date,
        time,
        ip: ip || "—",
        country: null,
        browser: env.browser,
        os: env.os,
        device: env.device,
        sessionId: env.sessionId,
      };
    };

    const inject = (stamp: PrintStamp) => {
      document.getElementById(LAYER_ID)?.remove();
      const layer = document.createElement("div");
      layer.id = LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      const classStamp = classificationStampDataUrl(stamp);
      layer.innerHTML = `
        <style>
          @media print {
            #${LAYER_ID} .wm, #${LAYER_ID} .cs, #${LAYER_ID} .ft { display: block !important; }
          }
          #${LAYER_ID} .wm, #${LAYER_ID} .cs, #${LAYER_ID} .ft {
            display: none; position: fixed; z-index: 2147483000; pointer-events: none;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #${LAYER_ID} .wm { inset: 0; background-image: url("${watermarkTileDataUrl(stamp)}"); background-repeat: repeat; }
          #${LAYER_ID} .cs { top: 50%; left: 50%; transform: translate(-50%,-50%); width: 170mm; height: 70mm;
            background: url("${classStamp ?? ""}") center / contain no-repeat; }
          #${LAYER_ID} .ft { bottom: 0; inset-inline: 0; background: #fff; color: #123C32;
            font-family: "Tajawal", Arial, sans-serif; font-size: 7.5pt; text-align: center;
            padding: 2mm 6mm 3mm; border-top: 0.4pt solid rgba(18,60,50,.35); }
        </style>
        <div class="wm"></div>
        ${classStamp ? '<div class="cs"></div>' : ""}
        <div class="ft">${footerLine(stamp)}</div>`;
      document.body.appendChild(layer);
    };

    let printing = false;

    const onKeyDown = async (event: KeyboardEvent) => {
      if (
        !(event.key === "p" || event.key === "P") ||
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      if (printing) return;
      if (!allowed) {
        toast.error("الطباعة غير مسموحة", {
          description: "لا تملك صلاحية طباعة المستندات في هذا المكتب.",
        });
        return;
      }
      printing = true;
      try {
        const result = await openEvent({
          data: {
            organizationId: activeOrgId,
            action: "print",
            documentType: "other",
            documentId: null,
            documentRef: `SCR-${window.location.pathname.slice(0, 60)}`,
            documentTitle: document.title.slice(0, 300),
            documentVersion: "v1",
            classification: "internal",
            pagesCount: 1,
            browser: env.browser,
            os: env.os,
            device: env.device,
            sessionId: env.sessionId,
            metadata: { path: window.location.pathname, surface: "screen" },
          },
        });
        const stamp = buildStamp(result.printRef, result.copyNumber, result.ip, result.serverTime);
        stamp.officeName = result.officeName;
        inject(stamp);
        window.print();
      } catch (error) {
        toast.error("تعذّرت الطباعة", { description: (error as Error).message });
      } finally {
        printing = false;
      }
    };

    const onAfterPrint = () => document.getElementById(LAYER_ID)?.remove();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("afterprint", onAfterPrint);
      onAfterPrint();
    };
  }, [
    activeOrgId,
    activeRole,
    openEvent,
    profile?.email,
    profile?.full_name,
    user?.email,
    user?.id,
  ]);

  return null;
}
