import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Eye, Printer, Share2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canDo, permissionDeniedMessage, type DocumentPermission } from "@/lib/doc-permissions";
import { Badge, Btn, FormField, IconBtn, Modal, inputCls } from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import {
  createDocumentShareLink,
  listDocumentShareLinks,
  requestDocumentAccess,
  revokeDocumentShareLink,
} from "@/lib/secure-view/secure-view.functions";
import { detectEnvironment } from "@/lib/print/print.shared";
import { fetchWatermarkedPdf } from "@/lib/secure-view/fetch-watermarked";

/**
 * Every document interaction in the app goes through this module: view,
 * download, print and share all ask the server for a watermarked copy, so no
 * screen can accidentally expose an original file.
 */

export type SecureDoc = {
  id: string;
  organization_id: string;
  file_name: string;
  file_type?: string | null;
  is_confidential?: boolean | null;
};

type AccessKind = "view" | "download" | "print";

const PERMISSION: Record<AccessKind, DocumentPermission> = {
  view: "documents.view",
  download: "documents.download",
  print: "documents.print",
};

/**
 * تُجلب النسخة المائية مرة واحدة كـ Blob ثم تُعرض من الذاكرة. هذا يمنع طلبات
 * المتصفح المتكررة على تذكرة العرض المؤقتة (وهي محدودة الاستخدام)، ويُظهر رسالة
 * الخادم الحقيقية بدلاً من رسالة "تعذّر تحميل المستند" العامة من عارض PDF.
 */
export function useSecureDocument() {
  const { activeOrgId, activeRole } = useAuth();
  const request = useServerFn(requestDocumentAccess);
  const [busy, setBusy] = useState<{ id: string; kind: AccessKind } | null>(null);
  const [viewing, setViewing] = useState<{ doc: SecureDoc; url: string } | null>(null);
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  const objectUrls = useRef<string[]>([]);

  const trackUrl = useCallback((url: string) => {
    objectUrls.current.push(url);
    return url;
  }, []);

  const releaseUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((item) => item !== url);
  }, []);

  useEffect(
    () => () => {
      printFrame.current?.remove();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    },
    [],
  );

  const can = useCallback(
    (permission: DocumentPermission) => canDo(activeRole, permission),
    [activeRole],
  );

  const ticket = useCallback(
    async (doc: SecureDoc, kind: AccessKind) => {
      const env = detectEnvironment();
      return request({
        data: {
          organizationId: doc.organization_id || activeOrgId!,
          documentId: doc.id,
          kind,
          sourcePage:
            typeof window === "undefined" ? "app" : window.location.pathname.slice(0, 120),
          sessionId: env.sessionId,
        },
      });
    },
    [activeOrgId, request],
  );

  const run = useCallback(
    async (doc: SecureDoc, kind: AccessKind) => {
      if (!can(PERMISSION[kind])) {
        toast.error("صلاحية غير كافية", { description: permissionDeniedMessage(PERMISSION[kind]) });
        return;
      }
      setBusy({ id: doc.id, kind });
      try {
        const result = await ticket(doc, kind);
        const blobUrl = trackUrl(await fetchWatermarkedPdf(result.url));
        if (kind === "view") {
          setViewing({ doc, url: blobUrl });
          return;
        }
        if (kind === "download") {
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = result.fileName;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
          toast.success("تم تجهيز نسخة مائية للتنزيل");
          return;
        }
        printFrame.current?.remove();
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;inset:0;width:0;height:0;border:0;opacity:0;";
        frame.src = blobUrl;
        document.body.appendChild(frame);
        printFrame.current = frame;
        frame.onload = () => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        };
        toast.success("تم تجهيز نسخة الطباعة المائية");
      } catch (error) {
        toast.error("تعذّرت العملية", { description: (error as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [can, ticket, trackUrl],
  );

  const isBusy = useCallback(
    (id: string, kind: AccessKind) => busy?.id === id && busy.kind === kind,
    [busy],
  );

  return useMemo(
    () => ({
      can,
      isBusy,
      view: (doc: SecureDoc) => void run(doc, "view"),
      download: (doc: SecureDoc) => void run(doc, "download"),
      print: (doc: SecureDoc) => void run(doc, "print"),
      viewing,
      closeViewer: () => {
        setViewing((current) => {
          if (current) releaseUrl(current.url);
          return null;
        });
      },
    }),
    [can, isBusy, releaseUrl, run, viewing],
  );
}

/** عارض المستند: يعرض النسخة المائية المؤقتة فقط داخل إطار معزول. */
export function SecureDocumentViewer({
  doc,
  url,
  onClose,
}: {
  doc: SecureDoc;
  url: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={doc.file_name} size="lg">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge tone="green">نسخة عرض مائية</Badge>
          {doc.is_confidential && <Badge tone="red">سرّي</Badge>}
          <span>تُنتهي صلاحية هذه النسخة تلقائياً، ولا تحتوي رابط الملف الأصلي.</span>
        </div>
        {/* إطار معزول: سياسة CSP تسمح بـ blob: في frame-src فقط، بينما object-src
            محصورة بالأصل، لذا الإطار هو المسار الصحيح لعرض النسخة المائية. */}
        <iframe
          title={`عرض ${doc.file_name}`}
          src={url}
          className="h-[70vh] w-full rounded-lg border border-border bg-surface-muted"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"
        >
          <ExternalLink className="h-4 w-4" /> فتح النسخة المائية في عارض الجهاز
        </a>
      </div>
    </Modal>
  );
}

/** إدارة روابط المشاركة: إنشاء رابط مؤقت وإلغاء الروابط السابقة. */
export function ShareDocumentDialog({
  doc,
  onClose,
}: {
  doc: SecureDoc | null;
  onClose: () => void;
}) {
  const { activeOrgId } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createDocumentShareLink);
  const revoke = useServerFn(revokeDocumentShareLink);
  const list = useServerFn(listDocumentShareLinks);
  const [recipient, setRecipient] = useState("");
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<string | null>(null);

  const orgId = doc?.organization_id || activeOrgId || "";
  const links = useQuery({
    queryKey: ["doc-share-links", doc?.id],
    enabled: !!doc && !!orgId,
    queryFn: () => list({ data: { organizationId: orgId, documentId: doc!.id } }),
  });

  const add = useMutation({
    mutationFn: () =>
      create({
        data: {
          organizationId: orgId,
          documentId: doc!.id,
          recipientLabel: recipient.trim() || undefined,
          expiresInDays: days,
          maxUses: 20,
        },
      }),
    onSuccess: (result) => {
      setCreated(`${window.location.origin}${result.path}`);
      setRecipient("");
      toast.success("تم إنشاء رابط مشاركة مائي");
      void qc.invalidateQueries({ queryKey: ["doc-share-links", doc?.id] });
    },
    onError: (error: Error) => toast.error("تعذّر إنشاء الرابط", { description: error.message }),
  });

  const kill = useMutation({
    mutationFn: (tokenId: string) => revoke({ data: { organizationId: orgId, tokenId } }),
    onSuccess: () => {
      toast.success("تم إلغاء الرابط");
      void qc.invalidateQueries({ queryKey: ["doc-share-links", doc?.id] });
    },
    onError: (error: Error) => toast.error("تعذّر الإلغاء", { description: error.message }),
  });

  if (!doc) return null;

  return (
    <Modal
      open
      onClose={() => {
        setCreated(null);
        onClose();
      }}
      title={`مشاركة: ${doc.file_name}`}
      description="يفتح الرابط نسخة مائية تحمل اسم مكتبك واسمك، ولا يكشف الملف الأصلي."
    >
      <div className="space-y-4">
        <FormField label="الجهة المستلمة (اختياري)" hint="للتوثيق الداخلي فقط">
          <input
            className={inputCls}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="مثال: العميل خالد عبدالله"
          />
        </FormField>
        <FormField label="مدة الصلاحية (بالأيام)">
          <input
            type="number"
            min={1}
            max={30}
            className={inputCls}
            value={days}
            onChange={(event) =>
              setDays(Math.min(30, Math.max(1, Number(event.target.value) || 7)))
            }
          />
        </FormField>
        <Btn onClick={() => add.mutate()} loading={add.isPending}>
          <Share2 className="inline h-4 w-4 me-1" /> إنشاء رابط مشاركة
        </Btn>

        {created && (
          <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
            <div className="mb-2 text-xs text-muted-foreground">
              انسخ الرابط الآن — لن يُعرض مرة أخرى.
            </div>
            <div className="flex items-center gap-2">
              <input readOnly className={inputCls} value={created} />
              <IconBtn
                aria-label="نسخ الرابط"
                title="نسخ الرابط"
                onClick={() => {
                  void navigator.clipboard.writeText(created);
                  toast.success("تم نسخ الرابط");
                }}
              >
                <Copy className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium">الروابط الحالية</div>
          {links.isLoading ? (
            <div className="text-sm text-muted-foreground">جاري التحميل…</div>
          ) : !links.data?.length ? (
            <div className="text-sm text-muted-foreground">لا توجد روابط مشاركة لهذا المستند.</div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {links.data.map((link) => {
                const dead = !!link.revoked_at || new Date(link.expires_at) <= new Date();
                return (
                  <li key={link.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{link.recipient_label ?? "بدون جهة محددة"}</div>
                      <div className="text-xs text-muted-foreground">
                        ينتهي {fmtDate(link.expires_at)} · فتح {link.used_count} من {link.max_uses}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={dead ? "muted" : "green"}>{dead ? "منتهٍ" : "نشط"}</Badge>
                      {!dead && (
                        <IconBtn
                          tone="danger"
                          aria-label="إلغاء الرابط"
                          title="إلغاء الرابط"
                          loading={kill.isPending}
                          onClick={() => kill.mutate(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** أزرار الوصول الموحّدة لأي صف مستند. */
export function SecureDocActions({
  doc,
  onShare,
  engine,
}: {
  doc: SecureDoc;
  onShare?: (doc: SecureDoc) => void;
  engine: ReturnType<typeof useSecureDocument>;
}) {
  return (
    <>
      {engine.can("documents.view") && (
        <IconBtn
          aria-label="عرض النسخة المائية"
          title="عرض النسخة المائية"
          loading={engine.isBusy(doc.id, "view")}
          onClick={() => engine.view(doc)}
        >
          <Eye className="h-4 w-4" />
        </IconBtn>
      )}
      {engine.can("documents.print") && (
        <IconBtn
          aria-label="طباعة النسخة المائية"
          title="طباعة النسخة المائية"
          loading={engine.isBusy(doc.id, "print")}
          onClick={() => engine.print(doc)}
        >
          <Printer className="h-4 w-4" />
        </IconBtn>
      )}
      {engine.can("documents.download") && (
        <IconBtn
          aria-label="تنزيل النسخة المائية"
          title="تنزيل النسخة المائية"
          loading={engine.isBusy(doc.id, "download")}
          onClick={() => engine.download(doc)}
        >
          <Download className="h-4 w-4" />
        </IconBtn>
      )}
      {onShare && engine.can("documents.share") && (
        <IconBtn aria-label="مشاركة" title="مشاركة برابط مائي" onClick={() => onShare(doc)}>
          <Share2 className="h-4 w-4" />
        </IconBtn>
      )}
    </>
  );
}
